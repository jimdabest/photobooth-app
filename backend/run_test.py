import os
import io
import shutil
import time
import json
import asyncio
import threading
import atexit
import socket
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, Request, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageDraw, ImageOps
from dotenv import load_dotenv
import qrcode
import uvicorn

try:
    import cv2
except ImportError:
    cv2 = None

try:
    import boto3
    from botocore.config import Config
    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False

# Load biến môi trường từ .env
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

# Đường dẫn dữ liệu
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_SAVE_DIR = os.path.join(BASE_DIR, "photobooth_data")
PRINT_EXPORT_DIR = os.path.join(BASE_DIR, "photobooth_prints_all")
CONFIG_DIR = os.path.join(BASE_SAVE_DIR, "config")
TEMPLATES_DIR = os.path.join(BASE_SAVE_DIR, "templates")
SESSIONS_DIR = os.path.join(BASE_SAVE_DIR, "sessions")

os.makedirs(CONFIG_DIR, exist_ok=True)
os.makedirs(TEMPLATES_DIR, exist_ok=True)
os.makedirs(PRINT_EXPORT_DIR, exist_ok=True)
os.makedirs(SESSIONS_DIR, exist_ok=True)

SETTINGS_FILE = os.path.join(CONFIG_DIR, "settings.json")
TEMPLATES_FILE = os.path.join(CONFIG_DIR, "templates.json")

# Cloudflare R2 Configuration
R2_ENABLED = os.getenv("R2_ENABLED", "false").lower() == "true"
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY = os.getenv("R2_ACCESS_KEY", "")
R2_SECRET_KEY = os.getenv("R2_SECRET_KEY", "")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME", "photobooth-prints")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL", "")

# Public URL của frontend
FRONTEND_URL = os.getenv("PUBLIC_URL", "https://simplex-photobooth.pages.dev")


def get_local_ip():
    """Tự động phát hiện IP LAN của máy đang chạy"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip


# Client R2 (lazy init)
_s3_client = None


def get_s3_client():
    """Khởi tạo S3 client cho R2 (chỉ tạo 1 lần)"""
    global _s3_client
    if _s3_client is not None:
        return _s3_client

    if not R2_ENABLED or not BOTO3_AVAILABLE:
        return None

    try:
        _s3_client = boto3.client(
            's3',
            endpoint_url=f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com',
            aws_access_key_id=R2_ACCESS_KEY,
            aws_secret_access_key=R2_SECRET_KEY,
            config=Config(signature_version='s3v4'),
            region_name='auto'
        )
        print("[R2] Đã kết nối Cloudflare R2")
        return _s3_client
    except Exception as e:
        print(f"[R2] Lỗi khởi tạo client: {e}")
        return None


def upload_session_to_r2(session_id, session_dir, final_path):
    """
    Upload toàn bộ session lên R2:
    - final.jpg (ảnh thành phẩm có QR)
    - pose_1.jpg, pose_2.jpg, ... (ảnh gốc)
    - metadata.json (danh sách file)
    
    Trả về dict: {"final": url, "poses": [url1, ...], "metadata": url}
    """
    result = {"final": "", "poses": [], "metadata": ""}

    if not R2_ENABLED:
        print("[R2] Chưa bật, bỏ qua upload session")
        return result

    client = get_s3_client()
    if client is None:
        return result

    try:
        now = time.localtime()
        month_str = time.strftime('%Y-%m', now)
        base_key = f"prints/{month_str}/{session_id}"

        # 1. Upload ảnh final
        final_key = f"{base_key}/final.jpg"
        client.upload_file(
            final_path,
            R2_BUCKET_NAME,
            final_key,
            ExtraArgs={'ContentType': 'image/jpeg'}
        )
        result["final"] = f"{R2_PUBLIC_URL.rstrip('/')}/{final_key}"
        print(f"[R2] Upload final: {result['final']}")

        # 2. Upload từng pose gốc
        for i in range(1, 20):
            pose_file = os.path.join(session_dir, f"pose_{i}.jpg")
            if not os.path.exists(pose_file):
                break

            pose_key = f"{base_key}/pose_{i}.jpg"
            client.upload_file(
                pose_file,
                R2_BUCKET_NAME,
                pose_key,
                ExtraArgs={'ContentType': 'image/jpeg'}
            )
            pose_url = f"{R2_PUBLIC_URL.rstrip('/')}/{pose_key}"
            result["poses"].append(pose_url)
            print(f"[R2] Upload pose {i}: {pose_url}")

        # 3. Tạo và upload metadata.json
        metadata = {
            "session_id": session_id,
            "final_image": result["final"],
            "poses": result["poses"],
            "created_at": time.time(),
            "created_at_str": time.strftime('%Y-%m-%d %H:%M:%S')
        }

        metadata_key = f"{base_key}/metadata.json"
        metadata_bytes = json.dumps(metadata, ensure_ascii=False, indent=2).encode('utf-8')

        client.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=metadata_key,
            Body=metadata_bytes,
            ContentType='application/json'
        )
        result["metadata"] = f"{R2_PUBLIC_URL.rstrip('/')}/{metadata_key}"
        print(f"[R2] Upload metadata: {result['metadata']}")

    except Exception as e:
        print(f"[R2] Lỗi upload session: {e}")

    return result


# Khởi tạo settings mặc định
if not os.path.exists(SETTINGS_FILE):
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump({"countdown_capture": 3, "review_timeout": 20}, f)

# Khởi tạo template mặc định
if not os.path.exists(TEMPLATES_FILE):
    with open(TEMPLATES_FILE, "w", encoding="utf-8") as f:
        json.dump([{
            "id": "tpl_default",
            "name": "Khung Mặc Định",
            "hidden": False,
            "image_url": "http://127.0.0.1:8000/data/templates/tpl_default.png",
            "orientation": "portrait",
            "canvas_size": {"width": 1080, "height": 1920},
            "num_poses": 3,
            "slots": [
                {"pose_index": 1, "x": 50, "y": 50, "width": 980, "height": 550, "rotation": 0},
                {"pose_index": 2, "x": 50, "y": 630, "width": 980, "height": 550, "rotation": 0},
                {"pose_index": 3, "x": 50, "y": 1210, "width": 980, "height": 550, "rotation": 0}
            ],
            "qr_config": {"print_on_photo": True, "x": 800, "y": 1780, "size": 120},
            "guide_config": {"enabled": False, "opacity": 0.4}
        }], f, ensure_ascii=False, indent=4)


class MockCameraEngine:
    """Giả lập camera bằng webcam"""

    def __init__(self):
        self.latest_frame = None
        self.is_running = True
        self.is_frozen = False
        self.is_connected = True
        self.cap = None

        if cv2 is not None:
            for index in [0, 1]:
                try:
                    cap_test = cv2.VideoCapture(index, cv2.CAP_DSHOW)
                    if cap_test.isOpened():
                        cap_test.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
                        cap_test.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
                        self.cap = cap_test
                        print(f"[MOCK] Mở webcam thành công (Device Index: {index})")
                        break
                    cap_test.release()
                except Exception as e:
                    print(f"[MOCK] Lỗi mở webcam {index}: {e}")

        if not self.cap or not self.cap.isOpened():
            print("[MOCK] Không mở được webcam, dùng khung hình giả lập")

        self.worker_thread = threading.Thread(target=self._worker, daemon=True)
        self.worker_thread.start()

    def freeze(self):
        self.is_frozen = True

    def unfreeze(self):
        self.is_frozen = False

    def shutdown(self):
        self.is_running = False
        if self.cap and self.cap.isOpened():
            self.cap.release()

    def _generate_dummy_frame(self):
        img = Image.new("RGB", (1280, 720), color=(30, 41, 59))
        draw = ImageDraw.Draw(img)
        draw.text((450, 340), f"MOCK LIVE VIEW\n{time.strftime('%H:%M:%S')}", fill=(255, 255, 255))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80)
        return buf.getvalue()

    def _worker(self):
        while self.is_running:
            try:
                if not self.is_frozen:
                    if self.cap and self.cap.isOpened() and cv2 is not None:
                        ret, frame = self.cap.read()
                        if ret:
                            _, buffer = cv2.imencode('.jpg', frame)
                            self.latest_frame = buffer.tobytes()
                        else:
                            self.latest_frame = self._generate_dummy_frame()
                    else:
                        self.latest_frame = self._generate_dummy_frame()
            except Exception:
                pass
            time.sleep(0.033)

    def capture_photo(self, save_path):
        if self.cap and self.cap.isOpened() and cv2 is not None:
            ret, frame = self.cap.read()
            if ret:
                cv2.imwrite(save_path, frame)
                return

        # Fallback: ảnh mẫu khi không có webcam
        img = Image.new("RGB", (1920, 1080), color=(59, 130, 246))
        draw = ImageDraw.Draw(img)
        draw.text((750, 500), f"TEST POSE PHOTO\n{time.strftime('%H:%M:%S')}", fill=(255, 255, 255))
        img.save(save_path, "JPEG", quality=95)


mock_cam = MockCameraEngine()
atexit.register(mock_cam.shutdown)


def pre_focus_camera_mock():
    """Mô phỏng thời gian lấy nét của máy ảnh Canon"""
    time.sleep(0.15)


def process_and_save_strip(session_id, session_raw_photos, template_id, session_dir):
    """Ghép ảnh chụp vào template, upload cả session lên R2"""
    tpl_config = None
    try:
        with open(TEMPLATES_FILE, "r", encoding="utf-8") as f:
            templates = json.load(f)
        tpl_config = next((t for t in templates if t["id"] == template_id), None)
        if not tpl_config and templates:
            tpl_config = templates[0]
    except Exception as e:
        print(f"Lỗi đọc templates.json: {e}")

    # Tìm file ảnh khung
    actual_tpl_file = None
    for ext in ["png", "jpg", "jpeg"]:
        test_path = os.path.join(TEMPLATES_DIR, f"{template_id}.{ext}")
        if os.path.exists(test_path):
            actual_tpl_file = test_path
            break

    # Xác định kích thước canvas
    if actual_tpl_file:
        with Image.open(actual_tpl_file) as img_check:
            canvas_w, canvas_h = img_check.size
    elif tpl_config and "canvas_size" in tpl_config:
        canvas_w = tpl_config["canvas_size"]["width"]
        canvas_h = tpl_config["canvas_size"]["height"]
    else:
        canvas_w, canvas_h = 880, 2650

    print(f"[PROCESSING] Tạo canvas {canvas_w}x{canvas_h}")

    strip_image = Image.new("RGBA", (canvas_w, canvas_h), color=(255, 255, 255, 255))

    # Dán ảnh chụp vào các slot
    if tpl_config and "slots" in tpl_config:
        for i, photo_path in enumerate(session_raw_photos):
            if i < len(tpl_config["slots"]):
                slot = tpl_config["slots"][i]
                try:
                    if os.path.exists(photo_path):
                        img = Image.open(photo_path).convert("RGBA")
                        target_size = (slot["width"], slot["height"])
                        img_fitted = ImageOps.fit(
                            img, target_size,
                            method=Image.Resampling.LANCZOS,
                            centering=(0.5, 0.5)
                        )
                        if slot.get("rotation", 0) != 0:
                            img_fitted = img_fitted.rotate(slot["rotation"], expand=True)
                        strip_image.paste(img_fitted, (slot["x"], slot["y"]))
                except Exception as e:
                    print(f"Lỗi dán slot {i}: {e}")

    # Phủ khung viền
    if actual_tpl_file:
        try:
            tpl_img = Image.open(actual_tpl_file).convert("RGBA")
            if tpl_img.size != (canvas_w, canvas_h):
                tpl_img = tpl_img.resize((canvas_w, canvas_h), Image.Resampling.LANCZOS)
            strip_image.paste(tpl_img, (0, 0), tpl_img)
        except Exception as e:
            print(f"Lỗi dán viền khung: {e}")

    # Đóng dấu QR code — trỏ đến trang Download trên Cloudflare Pages
    qr_conf = tpl_config.get("qr_config", {}) if tpl_config else {}
    if qr_conf.get("print_on_photo", True):
        try:
            qr_url = f"{FRONTEND_URL}/#/download/{session_id}"
            print(f"[QR] URL (Pages): {qr_url}")

            qr = qrcode.QRCode(version=1, box_size=10, border=1)
            qr.add_data(qr_url)
            qr.make(fit=True)
            qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGBA")

            qr_size = qr_conf.get("size", 150)
            qr_img = qr_img.resize((qr_size, qr_size))

            qr_x = qr_conf.get("x", canvas_w - qr_size - 30)
            qr_y = qr_conf.get("y", canvas_h - qr_size - 30)

            qr_x = max(0, min(qr_x, canvas_w - qr_size))
            qr_y = max(0, min(qr_y, canvas_h - qr_size))

            strip_image.paste(qr_img, (qr_x, qr_y), qr_img)
        except Exception as e:
            print(f"Lỗi tạo QR: {e}")

    # Lưu ảnh thành phẩm local
    final_path = os.path.join(session_dir, "final_photobooth_strip.jpg")
    print_save_path = os.path.join(PRINT_EXPORT_DIR, f"print_{session_id}.jpg")

    final_rgb = strip_image.convert("RGB")
    final_rgb.save(final_path, "JPEG", quality=95)
    final_rgb.save(print_save_path, "JPEG", quality=95)

    # Upload cả session lên R2
    session_urls = upload_session_to_r2(session_id, session_dir, final_path)

    # Lưu metadata local
    metadata = {
        "session_id": session_id,
        "template_id": template_id,
        "local_url": f"http://127.0.0.1:8000/data/sessions/{session_id}/final_photobooth_strip.jpg",
        "cloud_url": session_urls.get("final", ""),
        "cloud_poses": session_urls.get("poses", []),
        "cloud_metadata": session_urls.get("metadata", ""),
        "has_cloud": bool(session_urls.get("final")),
        "created_at": time.time()
    }

    metadata_path = os.path.join(session_dir, "metadata.json")
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    print(f"[PROCESSING] Đã lưu session {session_id}, cloud: {bool(session_urls.get('final'))}")

    return final_path, session_urls


app = FastAPI(title="Photobooth Mock Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/data", StaticFiles(directory=BASE_SAVE_DIR), name="data")


# ========== SETTINGS ==========
@app.get("/api/settings")
def get_settings():
    with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


@app.post("/api/settings")
def update_settings(new_settings: dict):
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(new_settings, f, ensure_ascii=False, indent=4)
    return {"status": "success"}


# ========== TEMPLATES ==========
@app.get("/api/templates")
def get_templates():
    with open(TEMPLATES_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


@app.post("/api/templates/upload")
async def upload_template(name: str = Form(...), file: UploadFile = File(...)):
    with open(TEMPLATES_FILE, "r", encoding="utf-8") as f:
        templates = json.load(f)

    new_id = f"tpl_{int(time.time())}"
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "png"
    new_filename = f"{new_id}.{ext}"
    file_location = os.path.join(TEMPLATES_DIR, new_filename)

    file_bytes = await file.read()
    with open(file_location, "wb") as buffer:
        buffer.write(file_bytes)

    with Image.open(io.BytesIO(file_bytes)) as img:
        real_width, real_height = img.size

    slot_w = int(real_width * 0.85)
    slot_h = int(slot_w * (9 / 16))
    slot_x = int((real_width - slot_w) / 2)
    start_y = int(real_height * 0.12)
    gap_y = int(slot_h * 1.1)

    new_tpl = {
        "id": new_id,
        "name": name,
        "hidden": False,
        "image_url": f"http://127.0.0.1:8000/data/templates/{new_filename}",
        "orientation": "portrait" if real_height > real_width else "landscape",
        "canvas_size": {"width": real_width, "height": real_height},
        "num_poses": 4,
        "slots": [
            {"pose_index": 1, "x": slot_x, "y": start_y, "width": slot_w, "height": slot_h, "rotation": 0},
            {"pose_index": 2, "x": slot_x, "y": start_y + gap_y, "width": slot_w, "height": slot_h, "rotation": 0},
            {"pose_index": 3, "x": slot_x, "y": start_y + gap_y * 2, "width": slot_w, "height": slot_h, "rotation": 0},
            {"pose_index": 4, "x": slot_x, "y": start_y + gap_y * 3, "width": slot_w, "height": slot_h, "rotation": 0}
        ],
        "qr_config": {"print_on_photo": True, "x": int(real_width - 160), "y": int(real_height - 180), "size": 130},
        "guide_config": {"enabled": False, "opacity": 0.4}
    }

    templates.append(new_tpl)
    with open(TEMPLATES_FILE, "w", encoding="utf-8") as f:
        json.dump(templates, f, ensure_ascii=False, indent=4)

    return {"status": "success", "template": new_tpl}


@app.put("/api/templates/{tpl_id}")
async def update_template(tpl_id: str, request: Request):
    updated_data = await request.json()
    with open(TEMPLATES_FILE, "r", encoding="utf-8") as f:
        templates = json.load(f)

    for i, tpl in enumerate(templates):
        if tpl["id"] == tpl_id:
            templates[i] = updated_data
            break

    with open(TEMPLATES_FILE, "w", encoding="utf-8") as f:
        json.dump(templates, f, ensure_ascii=False, indent=4)

    return {"status": "success"}


@app.delete("/api/templates/{tpl_id}")
async def delete_template(tpl_id: str):
    with open(TEMPLATES_FILE, "r", encoding="utf-8") as f:
        templates = json.load(f)

    new_templates = [tpl for tpl in templates if tpl["id"] != tpl_id]

    with open(TEMPLATES_FILE, "w", encoding="utf-8") as f:
        json.dump(new_templates, f, ensure_ascii=False, indent=4)

    for ext in ["png", "jpg", "jpeg"]:
        file_path = os.path.join(TEMPLATES_DIR, f"{tpl_id}.{ext}")
        if os.path.exists(file_path):
            os.remove(file_path)

    return {"status": "success"}


# ========== BACKGROUND ==========
@app.post("/api/upload-background")
async def upload_background(file: UploadFile = File(...)):
    bg_path = os.path.join(BASE_SAVE_DIR, "app_background.jpg")
    with open(bg_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"url": f"http://127.0.0.1:8000/data/app_background.jpg?t={int(time.time())}"}


# ========== SESSION METADATA ==========
@app.get("/api/sessions/{session_id}")
def get_session_info(session_id: str):
    metadata_path = os.path.join(SESSIONS_DIR, session_id, "metadata.json")

    if os.path.exists(metadata_path):
        with open(metadata_path, "r", encoding="utf-8") as f:
            return json.load(f)

    local_image = os.path.join(SESSIONS_DIR, session_id, "final_photobooth_strip.jpg")
    if os.path.exists(local_image):
        return {
            "session_id": session_id,
            "local_url": f"http://127.0.0.1:8000/data/sessions/{session_id}/final_photobooth_strip.jpg",
            "cloud_url": "",
            "cloud_poses": [],
            "has_cloud": False
        }

    raise HTTPException(status_code=404, detail="Không tìm thấy session")


# ========== LIVE VIEW ==========
@app.post("/api/camera/live-view/start")
async def start_admin_live_view():
    mock_cam.unfreeze()
    return {"status": "started"}


@app.post("/api/camera/live-view/stop")
async def stop_admin_live_view():
    mock_cam.freeze()
    return {"status": "stopped"}


@app.get("/api/liveview")
def video_stream():
    def generate():
        while True:
            frame = mock_cam.latest_frame
            if frame:
                yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
            time.sleep(0.04)
    return StreamingResponse(generate(), media_type="multipart/x-mixed-replace; boundary=frame")


# ========== WEBSOCKET ==========
@app.websocket("/ws/session")
async def ws_session(websocket: WebSocket):
    await websocket.accept()
    print("Kiosk kết nối WebSocket thành công")
    session_raw_photos = []

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")

            if action == "START_SESSION":
                template_id = data.get("template_id", "tpl_default")
                session_id = data.get("session_id", f"session_{int(time.time())}")

                try:
                    with open(TEMPLATES_FILE, "r", encoding="utf-8") as f:
                        templates = json.load(f)
                    tpl = next((t for t in templates if t["id"] == template_id), None)
                    if not tpl and templates:
                        tpl = templates[0]
                    num_poses = tpl.get("num_poses", len(tpl.get("slots", []))) if tpl else 3
                except Exception:
                    num_poses = 3

                try:
                    with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                        settings = json.load(f)
                    countdown = settings.get("countdown_capture", 3)
                except Exception:
                    countdown = 3

                session_dir = os.path.join(BASE_SAVE_DIR, "sessions", session_id)
                os.makedirs(session_dir, exist_ok=True)
                session_raw_photos.clear()

                session_failed = False

                for pose in range(1, num_poses + 1):
                    if not mock_cam.is_connected:
                        await websocket.send_json({
                            "event": "CRITICAL_ERROR",
                            "message": "Mất kết nối máy ảnh. Vui lòng kiểm tra cáp USB hoặc pin."
                        })
                        session_failed = True
                        break

                    await websocket.send_json({
                        "event": "START_COUNTDOWN",
                        "current_pose": pose,
                        "total_poses": num_poses,
                        "countdown": countdown
                    })

                    if countdown > 0:
                        await asyncio.sleep(countdown)

                    print(f"[{pose}/{num_poses}] Chốt dáng, đóng băng live view")
                    mock_cam.freeze()
                    await asyncio.sleep(0.8)

                    await asyncio.to_thread(pre_focus_camera_mock)

                    print(f"[{pose}/{num_poses}] Chụp ảnh")
                    await websocket.send_json({"event": "TRIGGER_FLASH"})

                    photo_path = os.path.join(session_dir, f"pose_{pose}.jpg")
                    await asyncio.to_thread(mock_cam.capture_photo, photo_path)
                    session_raw_photos.append(photo_path)

                    await asyncio.sleep(1)
                    mock_cam.unfreeze()

                if not session_failed:
                    await websocket.send_json({"event": "PROCESSING"})
                    _, session_urls = await asyncio.to_thread(
                        process_and_save_strip,
                        session_id,
                        session_raw_photos,
                        template_id,
                        session_dir
                    )

                    await websocket.send_json({
                        "event": "COMPLETED",
                        "final_image_url": f"http://127.0.0.1:8000/data/sessions/{session_id}/final_photobooth_strip.jpg",
                        "session_id": session_id,
                        "cloud_url": session_urls.get("final", ""),
                        "cloud_poses": session_urls.get("poses", [])
                    })

    except WebSocketDisconnect:
        print("Kiosk ngắt kết nối WebSocket")
    except Exception as e:
        print(f"Lỗi phiên chụp: {e}")


if __name__ == "__main__":
    print("=" * 60)
    print("PHOTOBOOTH MOCK SERVER")
    print(f"URL:       http://{get_local_ip()}:8000")
    print(f"WebSocket: ws://{get_local_ip()}:8000/ws/session")
    print(f"Frontend:  {FRONTEND_URL}")
    print(f"R2:        {'BẬT' if R2_ENABLED else 'TẮT'}")
    if R2_ENABLED:
        print(f"R2 Bucket: {R2_BUCKET_NAME}")
        print(f"R2 URL:    {R2_PUBLIC_URL}")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=8000)