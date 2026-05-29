"""
本地图像创作工具：文生图 + 图片编辑（Multipart），结果保存到 output/。
配置：环境变量或项目根目录 .env（见 env.example）。
"""

from __future__ import annotations

import base64
import hashlib
import json
import mimetypes
import os
import re
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request, send_file
from werkzeug.utils import secure_filename


def _runtime_base_dir() -> Path:
    """可写目录：开发为项目目录；打包后为 exe 所在目录（便于放 .env 与 output）。"""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


BASE_DIR = _runtime_base_dir()
OUTPUT_DIR = BASE_DIR / "output"

load_dotenv(BASE_DIR / ".env")

ALLOWED_SIZES = frozenset({"1024x1024", "1536x1024", "3840x2160"})
DEFAULT_SIZE = "1024x1024"
DEFAULT_MODEL = os.environ.get("GPT_IMAGE_MODEL", "gpt-image-2")
DEFAULT_BASE = os.environ.get("GPT_IMAGE_BASE_URL", "https://apexapi.roixw.com").rstrip("/")
REQUEST_TIMEOUT = int(os.environ.get("GPT_IMAGE_TIMEOUT", "1200"))

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = int(
    os.environ.get("MAX_UPLOAD_MB", "50")
) * 1024 * 1024
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
RECORD_LOCK = threading.Lock()


def _apply_cors(resp: Response) -> Response:
    """静态页挂在其它域名时，设置 GPT_IMAGE_CORS_ORIGINS=* 或逗号分隔 Origin 列表。"""
    raw = (os.environ.get("GPT_IMAGE_CORS_ORIGINS") or "").strip()
    if not raw:
        return resp
    origin = request.headers.get("Origin", "")
    if raw == "*":
        resp.headers["Access-Control-Allow-Origin"] = "*"
    else:
        allowed = {x.strip() for x in raw.split(",") if x.strip()}
        if origin and origin in allowed:
            resp.headers["Access-Control-Allow-Origin"] = origin
    if "Access-Control-Allow-Origin" in resp.headers:
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-API-Key"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        resp.headers["Access-Control-Max-Age"] = "86400"
    return resp


@app.before_request
def _cors_preflight():
    if request.method != "OPTIONS":
        return None
    if not request.path.startswith("/api"):
        return None
    r = Response(status=204)
    return _apply_cors(r)


@app.after_request
def _cors_after(resp: Response):
    return _apply_cors(resp)

KEY_BUCKET_LEN = 24


def _api_key_env() -> str:
    return (os.environ.get("GPT_IMAGE_API_KEY") or "").strip()


def _resolve_request_key(*, require: bool = False) -> str:
    """优先使用请求头中的密钥，便于多用户分区；否则回退到环境变量。"""
    h = (request.headers.get("X-API-Key") or "").strip()
    if h:
        return h
    auth = (request.headers.get("Authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        t = auth[7:].strip()
        if t:
            return t
    envk = _api_key_env()
    if envk:
        return envk
    if require:
        raise RuntimeError("缺少 API Key：请在 .env 配置 GPT_IMAGE_API_KEY，或在请求头 X-API-Key 传入")
    return ""


def _client_ip() -> str:
    for header in ("CF-Connecting-IP", "X-Real-IP", "X-Forwarded-For"):
        raw = (request.headers.get(header) or "").strip()
        if not raw:
            continue
        ip = raw.split(",", 1)[0].strip()
        if ip:
            return ip
    return (request.remote_addr or "unknown").strip() or "unknown"


def _request_bucket(key: str) -> str:
    client_ip = _client_ip()
    digest = hashlib.sha256(f"{key.strip()}\n{client_ip}".encode("utf-8")).hexdigest()
    return digest[:KEY_BUCKET_LEN]


def _bucket_dir(bucket: str) -> Path:
    if not re.fullmatch(r"[0-9a-f]+", bucket) or len(bucket) != KEY_BUCKET_LEN:
        raise ValueError("非法的密钥分区")
    return OUTPUT_DIR / "by_key" / bucket


def _records_path(bucket: str) -> Path:
    return _bucket_dir(bucket) / "_records.json"


def _append_record(bucket: str, record: dict) -> None:
    with RECORD_LOCK:
        p = _records_path(bucket)
        p.parent.mkdir(parents=True, exist_ok=True)
        items: list = []
        if p.is_file():
            try:
                raw = json.loads(p.read_text(encoding="utf-8"))
                if isinstance(raw, list):
                    items = raw
            except Exception:
                items = []
        items.insert(0, record)
        items = items[:400]
        p.write_text(json.dumps(items, ensure_ascii=False), encoding="utf-8")


def _update_record(bucket: str, record_id: str, updates: dict) -> None:
    """按记录 ID 更新任务状态，供后台生成线程回写成功或失败结果。"""
    with RECORD_LOCK:
        p = _records_path(bucket)
        if not p.is_file():
            return
        try:
            raw = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return
        if not isinstance(raw, list):
            return
        changed = False
        for item in raw:
            if isinstance(item, dict) and item.get("id") == record_id:
                item.update(updates)
                changed = True
                break
        if changed:
            p.write_text(json.dumps(raw[:400], ensure_ascii=False), encoding="utf-8")


def _headers_json_for_key(key: str) -> dict[str, str]:
    if not key:
        raise RuntimeError("未配置 API Key")
    return {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def _build_multipart_body(
    form_fields: list[tuple[str, str]],
    file_fields: list[tuple[str, str, bytes]],
) -> tuple[bytes, str]:
    """组装 multipart 为单一 bytes，便于设置 Content-Length，避免部分网关对 chunked 返回 502。"""
    boundary = f"----WebKitFormBoundary{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for name, value in form_fields:
        chunks.append(f"--{boundary}\r\n".encode())
        chunks.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        chunks.append(value.encode("utf-8"))
        chunks.append(b"\r\n")
    for name, filename, content in file_fields:
        chunks.append(f"--{boundary}\r\n".encode())
        chunks.append(
            f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode()
        )
        chunks.append(b"Content-Type: application/octet-stream\r\n\r\n")
        chunks.append(content)
        chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks), boundary


def _validate_size(size: str | None) -> str:
    s = (size or DEFAULT_SIZE).strip()
    if s not in ALLOWED_SIZES:
        raise ValueError(f"不支持的尺寸: {s}，允许: {', '.join(sorted(ALLOWED_SIZES))}")
    return s


def _save_b64_items(
    data_list: list, prefix: str, *, key_bucket: str | None = None
) -> list[dict]:
    """从 API 的 data 数组解析并保存图片，返回 {filename, path, revised_prompt, key_bucket} 列表。"""
    saved: list[dict] = []
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    dest_root = _bucket_dir(key_bucket) if key_bucket else OUTPUT_DIR
    if key_bucket:
        dest_root.mkdir(parents=True, exist_ok=True)
    for i, item in enumerate(data_list):
        if not isinstance(item, dict):
            continue
        b64 = item.get("b64_json") or ""
        url = item.get("url") or ""
        revised = item.get("revised_prompt") or ""

        raw: bytes | None = None
        ext = "png"
        if b64:
            raw = base64.b64decode(b64)
        elif url.startswith("data:image/"):
            m = re.match(r"data:image/([^;]+);base64,(.+)", url, re.DOTALL)
            if m:
                mime = m.group(1).lower()
                if mime in ("jpeg", "jpg"):
                    ext = "jpg"
                elif mime == "webp":
                    ext = "webp"
                raw = base64.b64decode(m.group(2))

        if not raw:
            continue

        name = f"{prefix}_{ts}_{i:02d}_{uuid.uuid4().hex[:8]}.{ext}"
        name = secure_filename(name) or f"{prefix}_{ts}_{i:02d}.png"
        path = dest_root / name
        path.write_bytes(raw)
        entry = {
            "filename": name,
            "relative_path": str(path.relative_to(BASE_DIR)).replace("\\", "/"),
            "revised_prompt": revised,
        }
        if key_bucket:
            entry["key_bucket"] = key_bucket
        saved.append(entry)
    return saved


def _parse_image_response(resp: requests.Response) -> tuple[dict, int]:
    if resp.status_code != 200:
        return (
            {"ok": False, "error": f"HTTP {resp.status_code}", "body": resp.text[:4000]},
            resp.status_code,
        )
    try:
        payload = resp.json()
    except json.JSONDecodeError:
        return {"ok": False, "error": "解析响应失败", "body": resp.text[:2000]}, 502

    data_list = payload.get("data")
    if not isinstance(data_list, list):
        return {"ok": False, "error": "响应缺少 data 数组", "raw": payload}, 502

    return {"ok": True, "created": payload.get("created"), "data": data_list}, 200


def _run_generate_job(
    *,
    key: str,
    bucket: str,
    record_id: str,
    req_body: dict,
) -> None:
    """后台请求上游并回写记录；避免前端长时间等待连接。"""
    url = f"{DEFAULT_BASE}/v1/images/generations"
    last_error: dict = {}
    for attempt in range(1, 3):
        try:
            if attempt > 1:
                _update_record(
                    bucket,
                    record_id,
                    {
                        "status": "retrying",
                        "retry_attempt": attempt,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    },
                )
                time.sleep(1.5)

            r = requests.post(
                url,
                headers=_headers_json_for_key(key),
                json=req_body,
                timeout=REQUEST_TIMEOUT,
            )
            parsed, status = _parse_image_response(r)
            finished_at = datetime.now(timezone.utc).isoformat()
            if not parsed.get("ok"):
                last_error = {
                    "error": parsed.get("error") or f"HTTP {status}",
                    "error_body": parsed.get("body") or parsed.get("raw") or "",
                }
                continue

            saved = _save_b64_items(parsed["data"], "generate", key_bucket=bucket)
            if not saved:
                last_error = {"error": "未得到可保存的图片数据"}
                continue

            first = saved[0]
            _update_record(
                bucket,
                record_id,
                {
                    "status": "success",
                    "filename": first["filename"],
                    "saved": saved,
                    "revised_prompt": first.get("revised_prompt") or "",
                    "created": parsed.get("created"),
                    "finished_at": finished_at,
                },
            )
            return
        except requests.RequestException as e:
            last_error = {"error": f"请求失败: {e}"}
        except Exception as e:
            last_error = {"error": f"生成任务异常: {e}"}

    updates = {
        "status": "failed",
        "error": last_error.get("error") or "生成失败",
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }
    if last_error.get("error_body"):
        updates["error_body"] = last_error["error_body"]
    _update_record(bucket, record_id, updates)


def _run_edit_job(
    *,
    key: str,
    bucket: str,
    record_id: str,
    prompt: str,
    size: str,
    model: str,
    quality: str | None,
    n_int: int,
    image_bytes: bytes,
    img_name: str,
    img_type: str,
    mask_bytes: bytes | None,
    mask_name: str | None,
    mask_type: str | None,
    source_filename: str,
) -> None:
    """后台请求图生图上游并回写记录，与文生图相同的异步任务模式。"""
    url = f"{DEFAULT_BASE}/v1/images/edits"
    data: list[tuple[str, str]] = [
        ("model", model),
        ("prompt", prompt),
        ("size", size),
        ("response_format", "b64_json"),
    ]
    if quality:
        data.append(("quality", str(quality)))
    if n_int > 1:
        data.append(("n", str(n_int)))

    files: list[tuple[str, tuple[str, bytes, str]]] = [
        ("image", (img_name, image_bytes, img_type))
    ]
    if mask_bytes and mask_name:
        files.append(("mask", (mask_name, mask_bytes, mask_type or "application/octet-stream")))

    last_error: dict = {}
    for attempt in range(1, 3):
        try:
            if attempt > 1:
                _update_record(
                    bucket,
                    record_id,
                    {
                        "status": "retrying",
                        "retry_attempt": attempt,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    },
                )
                time.sleep(1.5)

            r = requests.post(
                url,
                headers={"Authorization": f"Bearer {key}"},
                data=data,
                files=files,
                timeout=REQUEST_TIMEOUT,
            )
            parsed, status = _parse_image_response(r)
            finished_at = datetime.now(timezone.utc).isoformat()
            if not parsed.get("ok"):
                last_error = {
                    "error": parsed.get("error") or f"HTTP {status}",
                    "error_body": parsed.get("body") or parsed.get("raw") or "",
                }
                continue

            saved = _save_b64_items(parsed["data"], "edit", key_bucket=bucket)
            if not saved:
                last_error = {"error": "未得到可保存的图片数据"}
                continue

            first = saved[0]
            _update_record(
                bucket,
                record_id,
                {
                    "status": "success",
                    "filename": first["filename"],
                    "saved": saved,
                    "revised_prompt": first.get("revised_prompt") or "",
                    "source_filename": source_filename,
                    "created": parsed.get("created"),
                    "finished_at": finished_at,
                },
            )
            return
        except requests.RequestException as e:
            last_error = {"error": f"请求失败: {e}"}
        except Exception as e:
            last_error = {"error": f"编辑任务异常: {e}"}

    updates = {
        "status": "failed",
        "error": last_error.get("error") or "编辑失败",
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }
    if last_error.get("error_body"):
        updates["error_body"] = last_error["error_body"]
    _update_record(bucket, record_id, updates)


@app.get("/api/health")
def health():
    return jsonify(
        {
            "configured": bool(_api_key_env()),
            "base_url": DEFAULT_BASE,
            "model": DEFAULT_MODEL,
            "allowed_sizes": sorted(ALLOWED_SIZES),
            "client_key_header": "X-API-Key",
            "hint": "可在请求头 X-API-Key 传入密钥；图片与记录按密钥和客户端 IP 的组合哈希分区保存在 output/by_key/<桶>/",
        }
    )


@app.get("/api/records")
def list_records():
    try:
        key = _resolve_request_key(require=True)
        bucket = _request_bucket(key)
        p = _records_path(bucket)
        if not p.is_file():
            return jsonify({"ok": True, "key_bucket": bucket, "records": []})
        try:
            items = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            items = []
        if not isinstance(items, list):
            items = []
        return jsonify({"ok": True, "key_bucket": bucket, "records": items})
    except RuntimeError as e:
        return jsonify({"ok": False, "error": str(e)}), 401
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400


@app.get("/api/files/<bucket>/<filename>")
def file_by_bucket(bucket: str, filename: str):
    try:
        key = _resolve_request_key(require=True)
        if _request_bucket(key) != bucket:
            return jsonify({"ok": False, "error": "密钥与分区不匹配"}), 403
        if "/" in filename or "\\" in filename or ".." in filename:
            return jsonify({"ok": False, "error": "非法路径"}), 400
        safe = secure_filename(filename)
        if not safe or safe.startswith("_"):
            return jsonify({"ok": False, "error": "非法文件名"}), 400
        root = _bucket_dir(bucket).resolve()
        path = (root / safe).resolve()
        path.relative_to(root)
        if not path.is_file():
            return jsonify({"ok": False, "error": "文件不存在"}), 404
        return send_file(path, as_attachment=False)
    except RuntimeError as e:
        return jsonify({"ok": False, "error": str(e)}), 401
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400


@app.post("/api/generate")
def generate():
    try:
        key = _resolve_request_key(require=True)
        bucket = _request_bucket(key)

        body = request.get_json(force=True, silent=True) or {}
        prompt = (body.get("prompt") or "").strip()
        if not prompt:
            return jsonify({"ok": False, "error": "prompt 不能为空"}), 400

        size = _validate_size(body.get("size"))
        quality = body.get("quality")
        record_id = uuid.uuid4().hex
        now = datetime.now(timezone.utc).isoformat()

        req_body: dict = {
            "model": (body.get("model") or DEFAULT_MODEL).strip() or DEFAULT_MODEL,
            "prompt": prompt,
            "size": size,
            "response_format": "b64_json",
            "n": 1,
        }
        if quality:
            req_body["quality"] = str(quality)

        _append_record(
            bucket,
            {
                "id": record_id,
                "ts": now,
                "kind": "generate",
                "status": "pending",
                "prompt": prompt,
                "size": size,
                "filename": "",
                "revised_prompt": "",
            },
        )

        try:
            thread = threading.Thread(
                target=_run_generate_job,
                kwargs={
                    "key": key,
                    "bucket": bucket,
                    "record_id": record_id,
                    "req_body": req_body,
                },
                daemon=True,
            )
            thread.start()
        except RuntimeError as e:
            _update_record(
                bucket,
                record_id,
                {
                    "status": "failed",
                    "error": f"生成任务启动失败: {e}",
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            return jsonify({"ok": False, "error": f"生成任务启动失败: {e}"}), 500

        return jsonify(
            {
                "ok": True,
                "key_bucket": bucket,
                "record_id": record_id,
                "status": "pending",
            }
        )
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except RuntimeError as e:
        return jsonify({"ok": False, "error": str(e)}), 401


@app.post("/api/edit")
def edit():
    try:
        key = _resolve_request_key(require=True)
        bucket = _request_bucket(key)

        prompt = (request.form.get("prompt") or "").strip()
        if not prompt:
            return jsonify({"ok": False, "error": "prompt 不能为空"}), 400

        size = _validate_size(request.form.get("size"))
        model = (request.form.get("model") or DEFAULT_MODEL).strip() or DEFAULT_MODEL
        quality = request.form.get("quality")
        n_raw = request.form.get("n")
        n_int = 1
        if n_raw not in (None, ""):
            try:
                n_int = max(1, min(int(n_raw), 4))
            except ValueError:
                n_int = 1

        use_saved = (request.form.get("use_saved") or "").strip() == "1"
        image_bytes: bytes = b""
        img_name = "input.png"
        img_type = "application/octet-stream"

        if use_saved:
            sf = secure_filename((request.form.get("source_filename") or "").strip())
            if not sf or sf.startswith("_"):
                return jsonify({"ok": False, "error": "缺少有效的 source_filename"}), 400
            src = (_bucket_dir(bucket) / sf).resolve()
            src.relative_to(_bucket_dir(bucket).resolve())
            if not src.is_file():
                return jsonify({"ok": False, "error": "原图不存在或不在当前密钥分区"}), 400
            image_bytes = src.read_bytes()
            img_name = sf
            guessed, _ = mimetypes.guess_type(sf)
            img_type = (guessed or "application/octet-stream").strip()
        else:
            f_image = request.files.get("image")
            if not f_image or not f_image.filename:
                return jsonify({"ok": False, "error": "请上传原图 image 文件，或使用「基于已保存图片」"}), 400
            image_bytes = f_image.read()
            if not image_bytes:
                return jsonify({"ok": False, "error": "原图文件为空"}), 400
            img_name = secure_filename(f_image.filename) or "input.png"
            img_type = (getattr(f_image, "mimetype", None) or "application/octet-stream").strip()

        f_mask = request.files.get("mask")
        mask_bytes: bytes | None = None
        mask_name: str | None = None
        mask_type: str | None = None
        if f_mask and f_mask.filename:
            mask_bytes = f_mask.read()
            if mask_bytes:
                mask_name = secure_filename(f_mask.filename) or "mask.png"
                mask_type = (
                    (getattr(f_mask, "mimetype", None) or "application/octet-stream").strip()
                )

        src_fn = ""
        if use_saved:
            src_fn = (request.form.get("source_filename") or "").strip()
        else:
            uf = request.files.get("image")
            src_fn = (uf.filename or "") if uf else ""

        record_id = uuid.uuid4().hex
        now = datetime.now(timezone.utc).isoformat()
        _append_record(
            bucket,
            {
                "id": record_id,
                "ts": now,
                "kind": "edit",
                "status": "pending",
                "prompt": prompt,
                "size": size,
                "filename": "",
                "revised_prompt": "",
                "source_filename": src_fn,
            },
        )

        try:
            thread = threading.Thread(
                target=_run_edit_job,
                kwargs={
                    "key": key,
                    "bucket": bucket,
                    "record_id": record_id,
                    "prompt": prompt,
                    "size": size,
                    "model": model,
                    "quality": str(quality) if quality else None,
                    "n_int": n_int,
                    "image_bytes": image_bytes,
                    "img_name": img_name,
                    "img_type": img_type,
                    "mask_bytes": mask_bytes,
                    "mask_name": mask_name,
                    "mask_type": mask_type,
                    "source_filename": src_fn,
                },
                daemon=True,
            )
            thread.start()
        except RuntimeError as e:
            _update_record(
                bucket,
                record_id,
                {
                    "status": "failed",
                    "error": f"编辑任务启动失败: {e}",
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            return jsonify({"ok": False, "error": f"编辑任务启动失败: {e}"}), 500

        return jsonify(
            {
                "ok": True,
                "key_bucket": bucket,
                "record_id": record_id,
                "status": "pending",
            }
        )
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except RuntimeError as e:
        return jsonify({"ok": False, "error": str(e)}), 401


@app.get("/api/output/<filename>")
def output_file(filename: str):
    if not filename or "/" in filename or "\\" in filename or ".." in filename:
        return jsonify({"ok": False, "error": "非法路径"}), 400
    safe = secure_filename(filename)
    if not safe:
        return jsonify({"ok": False, "error": "非法文件名"}), 400
    out_root = OUTPUT_DIR.resolve()
    path = (OUTPUT_DIR / safe).resolve()
    try:
        path.relative_to(out_root)
    except ValueError:
        return jsonify({"ok": False, "error": "非法路径"}), 400
    if not path.is_file():
        return jsonify({"ok": False, "error": "文件不存在"}), 404
    return send_file(path, as_attachment=False)


if __name__ == "__main__":
    from werkzeug.serving import run_simple

    port = int(os.environ.get("PORT", "5050"))
    # 勿用通用 HOST（易被 .env 写成 127.0.0.1）；Docker 反代需 0.0.0.0
    listen_host = (os.environ.get("GPT_IMAGE_LISTEN") or "0.0.0.0").strip()
    print(f"[gpt-image-tool] listening on http://{listen_host}:{port}/api/health", flush=True)
    run_simple(listen_host, port, app, use_reloader=False, use_debugger=False, threaded=True)
