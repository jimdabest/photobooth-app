import os

from venv_bootstrap import use_project_venv


if __name__ == "__main__":
    use_project_venv(__file__)

# `run.py` is the production entry point.  Do not inherit a test adapter from
# a parent shell: the camera provider must load Canon EDSDK in this process.
os.environ["PHOTOBOOTH_CAMERA_MODE"] = "canon"


import uvicorn
from app.config import R2_ENABLED, R2_BUCKET_NAME, R2_PUBLIC_URL, FRONTEND_URL

if __name__ == "__main__":
    print("Khởi động Backend Photobooth Server (Canon EDSDK)")
    print("URL:       http://0.0.0.0:8000")
    print("REST API:  http://0.0.0.0:8000/api")
    print(f"Frontend:  {FRONTEND_URL}")
    print(f"R2:        {'BẬT' if R2_ENABLED else 'TẮT'}")
    if R2_ENABLED:
        print(f"R2 Bucket: {R2_BUCKET_NAME}")
        print(f"R2 URL:    {R2_PUBLIC_URL}")
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False)
