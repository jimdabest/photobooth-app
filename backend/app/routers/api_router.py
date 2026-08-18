import os
import io
import json
import shutil
import time
from fastapi import APIRouter, UploadFile, File, Form, Request
from fastapi.responses import StreamingResponse
from PIL import Image
from app.config import BASE_SAVE_DIR
from app.services.camera_service import canon_cam

# Router đã có sẵn prefix "/api" nên các route con không cần ghi "/api" nữa
router = APIRouter(prefix="/api")

CONFIG_DIR = os.path.join(BASE_SAVE_DIR, "config")
TEMPLATES_DIR = os.path.join(BASE_SAVE_DIR, "templates")
os.makedirs(CONFIG_DIR, exist_ok=True)
os.makedirs(TEMPLATES_DIR, exist_ok=True)

SETTINGS_FILE = os.path.join(CONFIG_DIR, "settings.json")
TEMPLATES_FILE = os.path.join(CONFIG_DIR, "templates.json")

if not os.path.exists(SETTINGS_FILE):
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump({"countdown_capture": 3, "review_timeout": 20}, f)

# Khởi tạo template mặc định ban đầu nếu file chưa tồn tại
if not os.path.exists(TEMPLATES_FILE):
    with open(TEMPLATES_FILE, "w", encoding="utf-8") as f:
        json.dump([{
            "id": "tpl_default",
            "name": "Khung Mac Dinh",
            "image_url": "http://127.0.0.1:8000/data/templates/tpl_default.png",
            "orientation": "landscape",
            "canvas_size": {"width": 1920, "height": 1080},
            "num_poses": 1,
            "slots": [{"pose_index": 1, "x": 100, "y": 100, "width": 800, "height": 600, "rotation": 0}],
            "qr_config": {"print_on_photo": True, "x": 1500, "y": 700, "size": 250}
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
    
    # Hỗ trợ lấy đúng đuôi mở rộng của file upload (png/jpg)
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "png"
    new_filename = f"{new_id}.{ext}"
    
    file_location = os.path.join(TEMPLATES_DIR, new_filename)
    
    # Đọc file upload vào bộ nhớ
    file_bytes = await file.read()
    
    # Lưu file ra đĩa
    with open(file_location, "wb") as buffer:
        buffer.write(file_bytes)
        
    # Sử dụng Pillow để đo chiều rộng/chiều cao thực tế
    with Image.open(io.BytesIO(file_bytes)) as img:
        real_width, real_height = img.size

    # Tính toán tọa độ và kích thước 4 ô chụp tự động (Tỷ lệ 16:9)
    slot_w = int(real_width * 0.85)
    slot_h = int(slot_w * (9 / 16)) 
    slot_x = int((real_width - slot_w) / 2)
    start_y = int(real_height * 0.12)
    gap_y = int(slot_h * 1.1)

    new_template = {
        "id": new_id,
        "name": name,
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
        "qr_config": {"print_on_photo": True, "x": int(real_width - 160), "y": int(real_height - 180), "size": 130}
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

# ==========================================================
# CẬP NHẬT: Quét dọn sạch sẽ file ảnh (kể cả jpg, png)
# ==========================================================
@router.delete("/templates/{tpl_id}")
async def delete_template(tpl_id: str):
    # 1. Đọc dữ liệu hiện tại
    with open(TEMPLATES_FILE, "r", encoding="utf-8") as f:
        templates = json.load(f)
        
    # 2. Lọc bỏ cái khung cần xóa
    new_templates = [tpl for tpl in templates if tpl["id"] != tpl_id]
            
    # 3. Lưu lại JSON
    with open(TEMPLATES_FILE, "w", encoding="utf-8") as f:
        json.dump(new_templates, f, ensure_ascii=False, indent=4)
        
    # 4. Quét và xóa file ảnh liên quan (hỗ trợ nhiều đuôi mở rộng)
    for ext in ["png", "jpg", "jpeg"]:
        file_path = os.path.join(TEMPLATES_DIR, f"{tpl_id}.{ext}")
        if os.path.exists(file_path):
            os.remove(file_path)
        
    return {"status": "success"}