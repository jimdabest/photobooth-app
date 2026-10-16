"""Use the project's virtual environment when a script is started with global Python."""
import os
import sys
from pathlib import Path


def use_project_venv(script_path: str) -> None:
    """Re-exec the script in backend/venv when it exists and is not active."""
    backend_dir = Path(script_path).resolve().parent
    venv_python = backend_dir / "venv" / "Scripts" / "python.exe"
    if not venv_python.is_file():
        return
    try:
        already_in_venv = Path(sys.executable).resolve() == venv_python.resolve()
    except OSError:
        already_in_venv = False
    if not already_in_venv:
        os.execv(str(venv_python), [str(venv_python), str(Path(script_path).resolve()), *sys.argv[1:]])
