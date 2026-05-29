#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")"

APP_NAME="gpt-image-tool-server"
VENV_DIR="${VENV_DIR:-.venv-linux-build}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "[error] Cannot find Python: $PYTHON_BIN" >&2
  echo "[hint] Install Python 3.10+ first, or run: PYTHON_BIN=/path/to/python3 ./build_linux.sh" >&2
  exit 1
fi

PY_VERSION="$("$PYTHON_BIN" - <<'PY'
import sys
print(f"{sys.version_info.major}.{sys.version_info.minor}")
PY
)"

case "$PY_VERSION" in
  3.10|3.11|3.12|3.13|3.14) ;;
  *)
    echo "[error] Python 3.10+ is required, found $PY_VERSION" >&2
    exit 1
    ;;
esac

echo "[build] Create virtual environment: $VENV_DIR"
"$PYTHON_BIN" -m venv "$VENV_DIR"

PY="$VENV_DIR/bin/python"

echo "[build] Upgrade packaging tools"
"$PY" -m pip install --upgrade pip setuptools wheel

echo "[build] Install project dependencies"
"$PY" -m pip install -r requirements.txt

echo "[build] Install PyInstaller"
"$PY" -m pip install "pyinstaller>=6.0"

echo "[build] Clean previous Linux build outputs"
rm -rf build dist "$APP_NAME.spec.tmp"

export GPT_IMAGE_TOOL_ROOT="$(pwd)"

echo "[build] PyInstaller onefile for Linux"
"$PY" -m PyInstaller --noconfirm gpt-image-tool.spec

BIN_PATH="dist/$APP_NAME"
if [[ ! -x "$BIN_PATH" ]]; then
  echo "[error] Build finished but executable was not found: $BIN_PATH" >&2
  exit 1
fi

echo "[build] OK -> $BIN_PATH"
echo "[hint] Put .env next to the executable on the Linux machine."
echo "[hint] Run: PORT=5050 ./$BIN_PATH"
