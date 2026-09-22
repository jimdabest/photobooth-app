import os
import io
import json
import shutil
import time
from fastapi import APIRouter, UploadFile, File, Form, Request, HTTPException
from fastapi.responses import StreamingResponse
from PIL import Image
from app.config import BASE_SAVE_DIR
from app.services.camera_service import canon_cam

router = APIRouter(prefix="/api")

CONFIG_DIR = os.path.join(BASE_SAVE_DIR, "config")
TEMPLATES_DIR = os.path.join(BASE_SAVE_DIR, "templates")
SESSIONS_DIR = os.path.join(BASE_SAVE_DIR, "sessions")

os.makedirs(CONFIG_DIR, exist_ok=True)
os.makedirs(TEMPLATES_DIR, exist_ok=True)
os.makedirs(SESSIONS_DIR, exist_ok=True)

SETTINGS_FILE = os.path.join(CONFIG_DIR, "settings.json")
TEMPLATES_FILE = os.path.join(CONFIG_DIR, "templates.json")

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
            "orientation": "landscape",
            "canvas_size": {"width": 1920, "height": 1080},
            "num_poses": 1,
            "slots": [{"pose_index": 1, "x": 100, "y": 100, "width": 800, "height": 600, "rotation": 0}],
            "qr_config": {"print_on_photo": True, "x": 1500, "y": 700, "size": 250},
            "guide_config": {"enabled": False, "opacity": 0.4}
        }], f)


@router.get("/settings")
def get_settings():
    with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


@router.post("/settings")
def update_settings(new_settings: dict):
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(new_settings, f, ensure_ascii=False, indent=4)
    return {"status": "success"}


@router.get("/templates")
def get_templates():
    with open(TEMPLATES_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


@router.post("/templates/upload")
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

    # Đo kích thước thực của ảnh khung
    with Image.open(io.BytesIO(file_bytes)) as img:
        real_width, real_height = img.size

    # Tự động tính toán 4 slot mẫu theo tỷ lệ 16:9
    slot_w = int(real_width * 0.85)
    slot_h = int(slot_w * (9 / 16))
    slot_x = int((real_width - slot_w) / 2)
    start_y = int(real_height * 0.12)
    gap_y = int(slot_h * 1.1)

    new_template = {
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
    templates.append(new_template)

    with open(TEMPLATES_FILE, "w", encoding="utf-8") as f:
        json.dump(templates, f, ensure_ascii=False, indent=4)

    return {"status": "success", "template": new_template}


@router.put("/templates/{tpl_id}")
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


@router.post("/upload-background")
async def upload_background(file: UploadFile = File(...)):
    bg_path = os.path.join(BASE_SAVE_DIR, "app_background.jpg")
    with open(bg_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    # Gắn timestamp để trình duyệt không cache ảnh cũ
    return {"url": f"http://127.0.0.1:8000/data/app_background.jpg?t={int(time.time())}"}


@router.post("/camera/live-view/start")
async def start_admin_live_view():
    canon_cam.start_live_view_thread()
    return {"status": "started"}


@router.post("/camera/live-view/stop")
async def stop_admin_live_view():
    canon_cam.stop_live_view_thread()
    return {"status": "stopped"}


@router.get("/liveview")
def video_stream():
    canon_cam.start_live_view_thread()

    def generate_frames():
        while True:
            frame = canon_cam.latest_frame
            if frame:
                yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
            time.sleep(0.04)

    return StreamingResponse(generate_frames(), media_type="multipart/x-mixed-replace; boundary=frame")


@router.delete("/templates/{tpl_id}")
async def delete_template(tpl_id: str):
    with open(TEMPLATES_FILE, "r", encoding="utf-8") as f:
        templates = json.load(f)

    new_templates = [tpl for tpl in templates if tpl["id"] != tpl_id]

    with open(TEMPLATES_FILE, "w", encoding="utf-8") as f:
        json.dump(new_templates, f, ensure_ascii=False, indent=4)

    # Xóa file ảnh liên quan
    for ext in ["png", "jpg", "jpeg"]:
        file_path = os.path.join(TEMPLATES_DIR, f"{tpl_id}.{ext}")
        if os.path.exists(file_path):
            os.remove(file_path)

    return {"status": "success"}


# Lấy thông tin session
@router.get("/sessions/{session_id}")
def get_session_info(session_id: str):
    """Lấy metadata của session bao gồm URL ảnh cloud"""
    metadata_path = os.path.join(SESSIONS_DIR, session_id, "metadata.json")

    if os.path.exists(metadata_path):
        with open(metadata_path, "r", encoding="utf-8") as f:
            return json.load(f)

    # Fallback: kiểm tra file ảnh có tồn tại không
    local_image = os.path.join(SESSIONS_DIR, session_id, "final_photobooth_strip.jpg")
    if os.path.exists(local_image):
        return {
            "session_id": session_id,
            "local_url": f"http://127.0.0.1:8000/data/sessions/{session_id}/final_photobooth_strip.jpg",
            "cloud_url": "",
            "has_cloud": False
        }

    raise HTTPException(status_code=404, detail="Không tìm thấy session")