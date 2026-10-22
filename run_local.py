"""Run SkillSwap without Docker: SQLite instead of PostgreSQL, UI and API on one port.

    python run_local.py            # http://localhost:8080, opens Brave (or the default browser)
    python run_local.py --no-browser
"""
import os
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = int(os.getenv("APP_PORT", "8080"))
URL = f"http://localhost:{PORT}"

os.environ.setdefault("DATABASE_URL", f"sqlite:///{(ROOT / 'skillswap.db').as_posix()}")
sys.path.insert(0, str(ROOT / "backend"))

import uvicorn  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

from app.main import app  # noqa: E402

# API routes are registered first, so the static mount only serves the UI
app.mount("/", StaticFiles(directory=ROOT / "frontend" / "public", html=True), name="ui")

BRAVE_PATHS = [
    Path(os.getenv("PROGRAMFILES", r"C:\Program Files")) / "BraveSoftware/Brave-Browser/Application/brave.exe",
    Path(os.getenv("PROGRAMFILES(X86)", r"C:\Program Files (x86)")) / "BraveSoftware/Brave-Browser/Application/brave.exe",
    Path(os.getenv("LOCALAPPDATA", "")) / "BraveSoftware/Brave-Browser/Application/brave.exe",
]


def open_browser() -> None:
    time.sleep(2)
    brave = next((p for p in BRAVE_PATHS if p.is_file()), None) or shutil.which("brave")
    if brave:
        subprocess.Popen([str(brave), URL])
    else:
        webbrowser.open(URL)


if __name__ == "__main__":
    print(f"\n  SkillSwap: {URL}  (admin / admin12345, anna / demo123)\n  Остановить: Ctrl+C\n")
    if "--no-browser" not in sys.argv:
        threading.Thread(target=open_browser, daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
