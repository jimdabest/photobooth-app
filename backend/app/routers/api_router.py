import os
import json
import shutil
from fastapi import APIRouter, UploadFile, File, Form
from app.config import BASE_SAVE_DIR

router = APIRouter(prefix="/api")

# Tạo các thư mục để chứa cấu hình và khung ảnh
CONFIG_DIR = os.path.join(BASE_SAVE_DIR, "config")
TEMPLATES_DIR = os.path.join(BASE_SAVE_DIR, "templates")
os.makedirs(CONFIG_DIR, exist_ok=True)
os.makedirs(TEMPLATES_DIR, exist_ok=True)

SETTINGS_FILE = os.path.join(CONFIG_DIR, "settings.json")
TEMPLATES_FILE = os.path.join(CONFIG_DIR, "templates.json")

# Khởi tạo file settings.json nếu chưa có
if not os.path.exists(SETTINGS_FILE):
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump({"countdown_capture": 3, "review_timeout": 20}, f)

# Khởi tạo file templates.json nếu chưa có
if not os.path.exists(TEMPLATES_FILE):
    with open(TEMPLATES_FILE, "w", encoding="utf-8") as f:
        json.dump([
            {"id": "tpl_default", "name": "Khung Mặc Định", "color": "#ffb8b8", "image_url": ""}
        ], f)

# 1. API Lấy cài đặt
@router.get("/settings")
def get_settings():
    with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

# 2. API Lưu cài đặt mới
@router.post("/settings")
def update_settings(new_settings: dict):
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(new_settings, f, ensure_ascii=False, indent=4)
    return {"status": "success"}

# 3. API Lấy danh sách khung ảnh
@router.get("/templates")
def get_templates():
    with open(TEMPLATES_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

# 4. API Upload khung ảnh mới
@router.post("/templates/upload")
async def upload_template(name: str = Form(...), file: UploadFile = File(...)):
    # Lưu file PNG vào ổ cứng
    file_location = os.path.join(TEMPLATES_DIR, file.filename)
    with open(file_location, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Cập nhật danh sách templates.json
    with open(TEMPLATES_FILE, "r", encoding="utf-8") as f:
        templates = json.load(f)
        
    new_template = {
        "id": f"tpl_{len(templates) + 1}",
        "name": name,
        "color": "#ffffff", # Màu nền phụ
        "image_url": f"http://127.0.0.1:8000/data/templates/{file.filename}"
    }
    templates.append(new_template)
    
    with open(TEMPLATES_FILE, "w", encoding="utf-8") as f:
        json.dump(templates, f, ensure_ascii=False, indent=4)
        
    return {"status": "success", "template": new_template}