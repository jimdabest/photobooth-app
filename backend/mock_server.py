import os
import io
import shutil
import time
import json
import asyncio
import threading
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, Request
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageDraw, ImageOps
import qrcode
import uvicorn

# Thử import OpenCV nếu có webcam laptop
try:
    import cv2
except ImportError:
    cv2 = None

# =====================================================================
# 1. CẤU HÌNH ĐƯỜNG DẪN DỮ LIỆU TEST
# =====================================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_SAVE_DIR = os.path.join(BASE_DIR, "photobooth_data")
PRINT_EXPORT_DIR = os.path.join(BASE_DIR, "photobooth_prints_all")
CONFIG_DIR = os.path.join(BASE_SAVE_DIR, "config")
TEMPLATES_DIR = os.path.join(BASE_SAVE_DIR, "templates")

os.makedirs(CONFIG_DIR, exist_ok=True)
os.makedirs(TEMPLATES_DIR, exist_ok=True)
os.makedirs(PRINT_EXPORT_DIR, exist_ok=True)

SETTINGS_FILE = os.path.join(CONFIG_DIR, "settings.json")
TEMPLATES_FILE = os.path.join(CONFIG_DIR, "templates.json")

# Khởi tạo settings mặc định nếu chưa có
if not os.path.exists(SETTINGS_FILE):
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump({"countdown_capture": 3, "review_timeout": 20}, f)

# Khởi tạo templates mặc định nếu chưa có
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


# =====================================================================
# 2. BỘ GIẢ LẬP CAMERA / WEBCAM LIVE VIEW
# =====================================================================
class MockCameraEngine:
    def __init__(self):
        self.latest_frame = None
        self.is_running = True
        self.is_frozen = False
        # Cờ mô phỏng camera sẵn sàng (giống canon_cam.camera is not None)
        self.is_connected = True
        self.cap = None

        if cv2 is not None:
            # Thử mở camera với DirectShow trên Windows
            for index in [0, 1]:
                try:
                    cap_test = cv2.VideoCapture(index, cv2.CAP_DSHOW)
                    if cap_test.isOpened():
                        cap_test.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
                        cap_test.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
                        self.cap = cap_test
                        print(f"✅ [MOCK SERVER] Đã mở thành công Webcam (Device Index: {index})")
                        break
                    else:
                        cap_test.release()
                except Exception as e:
                    print(f"Lỗi mở webcam {index}: {e}")

        if not self.cap or not self.cap.isOpened():
            print("⚠️ Không mở được Webcam -> Dùng khung hình giả lập có đồng hồ!")

        self.worker_thread = threading.Thread(target=self._worker, daemon=True)
        self.worker_thread.start()

    def freeze(self):
        """Khóa cứng frame hình tại thời điểm gọi lệnh (giống máy ảnh Canon)"""
        self.is_frozen = True

    def unfreeze(self):
        """Mở lại luồng video chuyển động"""
        self.is_frozen = False

    def _generate_dummy_frame(self):
        """Tạo frame giả lập khi không có webcam"""
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

    def capture_photo(self, save_path: str):
        if self.cap and self.cap.isOpened() and cv2 is not None:
            ret, frame = self.cap.read()
            if ret:
                cv2.imwrite(save_path, frame)
                return
        # Nếu không có webcam, tự tạo ảnh mẫu test
        img = Image.new("RGB", (1920, 1080), color=(59, 130, 246))
        draw = ImageDraw.Draw(img)
        draw.text((750, 500), f"TEST POSE PHOTO\n{time.strftime('%H:%M:%S')}", fill=(255, 255, 255))
        img.save(save_path, "JPEG", quality=95)


mock_cam = MockCameraEngine()


# =====================================================================
# 3. HÀM MÔ PHỎNG PRE-FOCUS (giống pre_focus_camera của Canon)
# =====================================================================
def pre_focus_camera_mock():
    """
    Canon thật sẽ: tắt live view, bấm nửa cò, chờ AF khóa nét.
    Mock chỉ cần chờ 0.15s để giống timing thực tế.
    """
    time.sleep(0.15)
    print("🔍 [MOCK] Đã lấy nét (pre-focus)!")


# =====================================================================
# 4. HÀM GHÉP ẢNH TEMPLATE THÀNH PHẨM
# =====================================================================
def process_and_save_strip(session_id, session_raw_photos, template_id, session_dir):
    # 1. Đọc cấu hình template
    tpl_config = None
    try:
        with open(TEMPLATES_FILE, "r", encoding="utf-8") as f:
            templates = json.load(f)
        tpl_config = next((t for t in templates if t["id"] == template_id), None)
        if not tpl_config and templates:
            tpl_config = templates[0]
    except Exception as e:
        print(f"Lỗi đọc templates.json: {e}")

    # 2. Tìm file ảnh khung thực tế trên đĩa để lấy đúng kích thước thật
    actual_tpl_file = None
    for ext in ["png", "jpg", "jpeg"]:
        test_path = os.path.join(TEMPLATES_DIR, f"{template_id}.{ext}")
        if os.path.exists(test_path):
            actual_tpl_file = test_path
            break

    # 3. Xác định kích thước canvas chuẩn
    if actual_tpl_file:
        with Image.open(actual_tpl_file) as img_check:
            canvas_w, canvas_h = img_check.size
    elif tpl_config and "canvas_size" in tpl_config:
        canvas_w = tpl_config["canvas_size"]["width"]
        canvas_h = tpl_config["canvas_size"]["height"]
    else:
        canvas_w, canvas_h = 880, 2650

    print(f"🖼️ [PROCESSING] Tạo Canvas đúng kích thước thực tế: {canvas_w}x{canvas_h}")

    # 4. Tạo Canvas nền trắng
    strip_image = Image.new("RGBA", (canvas_w, canvas_h), color=(255, 255, 255, 255))

    # 5. Dán các ảnh chụp vào ô
    if tpl_config and "slots" in tpl_config:
        for i, photo_path in enumerate(session_raw_photos):
            if i < len(tpl_config["slots"]):
                slot = tpl_config["slots"][i]
                try:
                    if os.path.exists(photo_path):
                        img = Image.open(photo_path).convert("RGBA")
                        target_size = (slot["width"], slot["height"])
                        # Giữ nguyên tỷ lệ, crop giữa không méo
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

    # 6. Phủ khung viền đồ họa lên trên
    if actual_tpl_file:
        try:
            tpl_img = Image.open(actual_tpl_file).convert("RGBA")
            if tpl_img.size != (canvas_w, canvas_h):
                tpl_img = tpl_img.resize((canvas_w, canvas_h), Image.Resampling.LANCZOS)
            strip_image.paste(tpl_img, (0, 0), tpl_img)
        except Exception as e:
            print(f"Lỗi dán viền khung: {e}")

    # 7. ĐÓNG DẤU MÃ QR
    qr_conf = tpl_config.get("qr_config", {}) if tpl_config else {}
    if qr_conf.get("print_on_photo", True):
        try:
            download_url = f"http://127.0.0.1:3000/download/{session_id}"
            qr = qrcode.QRCode(version=1, box_size=10, border=1)
            qr.add_data(download_url)
            qr.make(fit=True)
            qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGBA")

            qr_size = qr_conf.get("size", 150)
            qr_img = qr_img.resize((qr_size, qr_size))

            qr_x = qr_conf.get("x", canvas_w - qr_size - 30)
            qr_y = qr_conf.get("y", canvas_h - qr_size - 30)

            # Đảm bảo QR không vượt ra ngoài canvas
            qr_x = max(0, min(qr_x, canvas_w - qr_size))
            qr_y = max(0, min(qr_y, canvas_h - qr_size))

            strip_image.paste(qr_img, (qr_x, qr_y), qr_img)
        except Exception as e:
            print(f"Lỗi tạo QR: {e}")

    # 8. Xuất file ảnh thành phẩm (cloud + print export)
    cloud_save_path = os.path.join(session_dir, "final_photobooth_strip.jpg")
    print_save_path = os.path.join(PRINT_EXPORT_DIR, f"print_{session_id}.jpg")

    final_rgb = strip_image.convert("RGB")
    final_rgb.save(cloud_save_path, "JPEG", quality=95)
    final_rgb.save(print_save_path, "JPEG", quality=95)
    return cloud_save_path


# =====================================================================
# 5. KHỞI TẠO FASTAPI APP VÀ ROUTES
# =====================================================================
app = FastAPI(title="Photobooth Mock Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/data", StaticFiles(directory=BASE_SAVE_DIR), name="data")


# ------------------------- SETTINGS -------------------------
@app.get("/api/settings")
def get_settings():
    with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


@app.post("/api/settings")
def update_settings(new_settings: dict):
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(new_settings, f, ensure_ascii=False, indent=4)
    return {"status": "success"}


# ------------------------- TEMPLATES -------------------------
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

    # TỰ ĐỘNG ĐO KÍCH THƯỚC THỰC CỦA ẢNH KHUNG
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

    # Xóa file ảnh liên quan (hỗ trợ png, jpg, jpeg)
    for ext in ["png", "jpg", "jpeg"]:
        file_path = os.path.join(TEMPLATES_DIR, f"{tpl_id}.{ext}")
        if os.path.exists(file_path):
            os.remove(file_path)

    return {"status": "success"}


# ------------------------- BACKGROUND -------------------------
@app.post("/api/upload-background")
async def upload_background(file: UploadFile = File(...)):
    bg_path = os.path.join(BASE_SAVE_DIR, "app_background.jpg")
    with open(bg_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    # Gắn timestamp để trình duyệt không cache ảnh cũ
    return {"url": f"http://127.0.0.1:8000/data/app_background.jpg?t={int(time.time())}"}


# ------------------------- LIVE VIEW API -------------------------
@app.post("/api/camera/live-view/start")
async def start_admin_live_view():
    """Bật live view - trong mock chỉ cần unfreeze."""
    mock_cam.unfreeze()
    return {"status": "started"}


@app.post("/api/camera/live-view/stop")
async def stop_admin_live_view():
    """Tắt live view - trong mock chỉ cần freeze."""
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


# =====================================================================
# 6. WEBSOCKET ĐIỀU PHỐI ĐẾM NGƯỢC & CHỤP
# =====================================================================
@app.websocket("/ws/session")
async def ws_session(websocket: WebSocket):
    await websocket.accept()
    print("✅ Kiosk kết nối WebSocket Mock Server thành công!")
    session_raw_photos = []

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")

            if action == "START_SESSION":
                template_id = data.get("template_id", "tpl_default")
                session_id = data.get("session_id", f"session_{int(time.time())}")

                # 1. Đọc thông tin template
                try:
                    with open(TEMPLATES_FILE, "r", encoding="utf-8") as f:
                        templates = json.load(f)
                    tpl = next((t for t in templates if t["id"] == template_id), None)
                    if not tpl and templates:
                        tpl = templates[0]
                    num_poses = tpl.get("num_poses", len(tpl.get("slots", []))) if tpl else 3
                except Exception:
                    num_poses = 3

                # 2. Đọc countdown từ settings
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

                # 3. Vòng lặp chụp động theo num_poses
                for pose in range(1, num_poses + 1):
                    # --- KIỂM TRA PHẦN CỨNG TRƯỚC KHI ĐẾM NGƯỢC ---
                    if not mock_cam.is_connected:
                        await websocket.send_json({
                            "event": "CRITICAL_ERROR",
                            "message": "Mất kết nối máy ảnh. Vui lòng kiểm tra cáp USB hoặc pin!"
                        })
                        session_failed = True
                        break

                    # Báo React bắt đầu đếm ngược
                    await websocket.send_json({
                        "event": "START_COUNTDOWN",
                        "current_pose": pose,
                        "total_poses": num_poses,
                        "countdown": countdown
                    })

                    # Chờ hết countdown (UI đang đếm số)
                    if countdown > 0:
                        await asyncio.sleep(countdown)

                    # --- KHOẢNH KHẮC SMILE (0s): ĐÓNG BĂNG FRAME ---
                    print(f"[{pose}/{num_poses}] Chốt dáng (Smile) - Đóng băng Live View...")
                    mock_cam.freeze()
                    await asyncio.sleep(0.8)  # Đứng hình 0.8s tạo hiệu ứng chốt dáng

                    # --- GỌI PRE-FOCUS ---
                    print(f"[{pose}/{num_poses}] Đang lấy nét (Smile!)...")
                    await asyncio.to_thread(pre_focus_camera_mock)

                    # --- FLASH + CHỤP ---
                    print(f"📸 Đang ra lệnh CHỤP lút cò kiểu số {pose}/{num_poses}...")
                    await websocket.send_json({"event": "TRIGGER_FLASH"})

                    photo_path = os.path.join(session_dir, f"pose_{pose}.jpg")
                    await asyncio.to_thread(mock_cam.capture_photo, photo_path)
                    session_raw_photos.append(photo_path)

                    # Nghỉ 1s rồi MỞ LẠI LIVE VIEW cho kiểu tiếp theo
                    await asyncio.sleep(1)
                    mock_cam.unfreeze()

                # 4. Chụp xong -> Ghép ảnh theo Template
                if not session_failed:
                    await websocket.send_json({"event": "PROCESSING"})
                    await asyncio.to_thread(
                        process_and_save_strip,
                        session_id,
                        session_raw_photos,
                        template_id,
                        session_dir
                    )

                    # 5. Báo hoàn tất để chuyển sang màn hình QR / Review
                    await websocket.send_json({
                        "event": "COMPLETED",
                        "final_image_url": f"http://127.0.0.1:8000/data/sessions/{session_id}/final_photobooth_strip.jpg"
                    })

    except WebSocketDisconnect:
        print("❌ Kiosk đã ngắt kết nối WebSocket.")
    except Exception as e:
        print(f"Lỗi phiên chụp: {e}")


# =====================================================================
# 7. ĐIỂM CHẠY TRỰC TIẾP
# =====================================================================
if __name__ == "__main__":
    print("=" * 60)
    print("🚀 PHOTOBOOTH ALL-IN-ONE MOCK SERVER ĐANG CHẠY...")
    print("📍 URL Backend: http://127.0.0.1:8000")
    print("📍 WebSocket:   ws://127.0.0.1:8000/ws/session")
    print("=" * 60)
    uvicorn.run(app, host="127.0.0.1", port=8000)