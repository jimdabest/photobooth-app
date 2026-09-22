import uvicorn
from app.config import R2_ENABLED, R2_BUCKET_NAME, R2_PUBLIC_URL, FRONTEND_URL

if __name__ == "__main__":
    print("Khởi động Backend Photobooth Server (Canon EDSDK)")
    print("URL:       http://0.0.0.0:8000")
    print("WebSocket: ws://0.0.0.0:8000/ws/session")
    print(f"Frontend:  {FRONTEND_URL}")
    print(f"R2:        {'BẬT' if R2_ENABLED else 'TẮT'}")
    if R2_ENABLED:
        print(f"R2 Bucket: {R2_BUCKET_NAME}")
        print(f"R2 URL:    {R2_PUBLIC_URL}")
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False)