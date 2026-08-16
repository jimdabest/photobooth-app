import asyncio
import json
import os
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.config import BASE_SAVE_DIR

# Đã import thêm pre_focus_camera
from app.services.image_service import capture_raw_photo, process_and_save_strip, pre_focus_camera

router = APIRouter()

CONFIG_DIR = os.path.join(BASE_SAVE_DIR, "config")
TEMPLATES_FILE = os.path.join(CONFIG_DIR, "templates.json")

def get_template_by_id(template_id: str):
    if os.path.exists(TEMPLATES_FILE):
        with open(TEMPLATES_FILE, "r", encoding="utf-8") as f:
            templates = json.load(f)
            return next((t for t in templates if t["id"] == template_id), None)
    return None

@router.websocket("/ws/session")
async def websocket_session_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("✅ Màn hình Kiosk đã kết nối WebSocket thành công!")
    
    session_raw_photos = []
    
    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")
            
            if action == "START_SESSION":
                template_id = data.get("template_id", "tpl_default")
                session_id = data.get("session_id", "default_session")
                
                # 1. Lấy thông tin khung để biết số lượng ảnh cần chụp
                tpl = get_template_by_id(template_id)
                num_poses = tpl.get("num_poses", len(tpl.get("slots", []))) if tpl else 3
                
                # 2. Đọc thời gian đếm ngược từ settings.json
                countdown = 3
                settings_file = os.path.join(CONFIG_DIR, "settings.json")
                if os.path.exists(settings_file):
                    with open(settings_file, "r", encoding="utf-8") as f:
                        settings = json.load(f)
                        countdown = settings.get("countdown_capture", 3)
                
                session_raw_photos.clear()
                
                # 3. Vòng lặp chụp ĐỘNG theo num_poses
                for pose in range(1, num_poses + 1):
                    # Báo về cho React biết tổng số ảnh và ảnh hiện tại để đếm ngược
                    await websocket.send_json({
                        "event": "START_COUNTDOWN",
                        "current_pose": pose,
                        "total_poses": num_poses,
                        "countdown": countdown
                    })
                    
                    session_dir = os.path.join(BASE_SAVE_DIR, "sessions", session_id)
                    os.makedirs(session_dir, exist_ok=True)
                    
                    # ========================================================
                    # ĐỒNG BỘ THỜI GIAN: TÁCH NHỊP ĐẾM NGƯỢC VÀ BẤM NỬA CÒ
                    # ========================================================
                    if countdown >= 1:
                        # Chờ đến khi còn đúng 1 giây cuối cùng
                        await asyncio.sleep(countdown - 1)
                        
                        # Ra lệnh BẤM NỬA CÒ (Máy ảnh tắt LiveView và xoay lấy nét)
                        print(f"[{pose}/{num_poses}] Đang lấy nét (còn 1 giây)...")
                        await asyncio.to_thread(pre_focus_camera)
                        
                        # Chờ nốt 1 giây còn lại để thấu kính khóa nét xong
                        await asyncio.sleep(1)
                    else:
                        # Trường hợp setting countdown = 0 (chụp tức thì)
                        await asyncio.to_thread(pre_focus_camera)
                        await asyncio.sleep(0.5)
                        
                    # ========================================================
                    # ĐỒNG BỘ: KÍCH HOẠT FLASH UI + BẤM LÚT CÒ CHỤP
                    # ========================================================
                    print(f"📸 Đang ra lệnh CHỤP lút cò kiểu số {pose}/{num_poses}...")
                    
                    # Báo UI chớp màn hình trắng
                    await websocket.send_json({"event": "TRIGGER_FLASH"})
                    
                    # Gọi lệnh chụp (Không có độ trễ vì đã nét sẵn)
                    photo_path = await asyncio.to_thread(capture_raw_photo, session_dir, pose)
                    session_raw_photos.append(photo_path)
                    
                    # Nghỉ 1 giây để khách đổi dáng cho kiểu tiếp theo
                    await asyncio.sleep(1) 

                # 4. Chụp xong -> Ghép ảnh theo Template
                await websocket.send_json({"event": "PROCESSING"})
                
                print_dir = os.path.join(BASE_SAVE_DIR, "prints")
                os.makedirs(print_dir, exist_ok=True)
                
                final_strip_path = await asyncio.to_thread(
                    process_and_save_strip,
                    session_id,
                    session_raw_photos,
                    print_dir,
                    session_dir,
                    template_id
                )
                
                # Báo hoàn tất để chuyển sang màn hình QR / Review
                await websocket.send_json({
                    "event": "COMPLETED",
                    "final_image_url": f"http://127.0.0.1:8000/data/sessions/{session_id}/final_photobooth_strip.jpg"
                })
                
    except WebSocketDisconnect:
        print("❌ Kiosk đã ngắt kết nối WebSocket.")