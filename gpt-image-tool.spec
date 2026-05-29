# -*- mode: python ; coding: utf-8 -*-
"""由 build_exe.ps1 调用；依赖环境变量 GPT_IMAGE_TOOL_ROOT 指向本目录。"""

import os
from pathlib import Path

block_cipher = None

HERE = Path()
_raw = (os.environ.get("GPT_IMAGE_TOOL_ROOT") or "").strip()
if _raw:
    HERE = Path(_raw).resolve()
if not HERE.is_dir() or not (HERE / "app.py").is_file():
    HERE = Path(SPECPATH).resolve().parent

if not (HERE / "app.py").is_file():
    raise SystemExit(
        "找不到 app.py：请从 build_exe.ps1 启动打包，或手动设置环境变量 GPT_IMAGE_TOOL_ROOT 为 gpt_image_tool 目录绝对路径。"
    )

a = Analysis(
    [str(HERE / "app.py")],
    pathex=[str(HERE)],
    binaries=[],
    datas=[],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "IPython",
        "jupyter",
        "notebook",
        "matplotlib",
        "pandas",
        "scipy",
        "sphinx",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="gpt-image-tool-server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
