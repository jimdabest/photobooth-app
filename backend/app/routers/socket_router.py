import asyncio
import json
import os
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.config import BASE_SAVE_DIR, PRINT_EXPORT_DIR

# Import các service
from app.services.camera_service import capture_raw_photo, pre_focus_camera, canon_cam
from app.services.image_service import process_and_save_strip

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
    print("Màn hình Kiosk đã kết nối WebSocket thành công!")
    
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
                session_failed = False # Cờ đánh dấu phiên chụp có lỗi không

                for pose in range(1, num_poses + 1):
                    # --- KIỂM TRA PHẦN CỨNG TRƯỚC KHI ĐẾM NGƯỢC ---
                    from app.services.image_service import canon_cam
                    if canon_cam.camera is None:
                        # Báo lỗi khẩn cấp lên màn hình React
                        await websocket.send_json({
                            "event": "CRITICAL_ERROR",
                            "message": "Mất kết nối máy ảnh. Vui lòng kiểm tra cáp USB hoặc pin!"
                        })
                        session_failed = True
                        break # Dừng phiên chụp ngay lập tức, không đếm ngược nữa

                    # Báo về cho React biết bắt đầu đếm ngược
                    await websocket.send_json({
                        "event": "START_COUNTDOWN",
                        "current_pose": pose,
                        "total_poses": num_poses,
                        "countdown": countdown
                    })
                    
                    session_dir = os.path.join(BASE_SAVE_DIR, "sessions", session_id)
                    os.makedirs(session_dir, exist_ok=True)
                    
                    # ========================================================
                    # ĐỒNG BỘ THỜI GIAN: ĐẾM 3.. 2.. 1.. -> SMILE!
                    # ========================================================
                    if countdown > 0:
                        # 1. Chờ chạy hết toàn bộ thời gian đếm ngược (UI sẽ đếm 3, 2, 1)
                        # Lúc này Live View vẫn chạy mượt mà không bị ngắt
                        await asyncio.sleep(countdown)
                    
                    # 2. Ngay tại giây số 0 (UI vừa hiện chữ "Smile!"), ta mới bắt đầu Tắt Live View & Bấm nửa cò
                    print(f"[{pose}/{num_poses}] Đang lấy nét (Smile!)...")
                    await asyncio.to_thread(pre_focus_camera)
                    
                    # 3. Đứng chờ 0.8 giây để lấy nét xong. 
                    await asyncio.sleep(0.8) 

                    # ========================================================
                    # ĐỒNG BỘ: KÍCH HOẠT FLASH UI + BẤM LÚT CÒ CHỤP
                    # ========================================================
                    print(f"Đang ra lệnh CHỤP lút cò kiểu số {pose}/{num_poses}...")
                    
                    # Báo UI chớp màn hình trắng
                    await websocket.send_json({"event": "TRIGGER_FLASH"})
                    
                    # Gọi lệnh chụp
                    photo_path = await asyncio.to_thread(capture_raw_photo, session_dir, pose)
                    session_raw_photos.append(photo_path)
                    
                    # Nghỉ 1 giây để khách đổi dáng cho kiểu tiếp theo
                    await asyncio.sleep(1)

                # 4. Chụp xong -> Ghép ảnh theo Template
                if not session_failed:
                    await websocket.send_json({"event": "PROCESSING"})
                
                    final_strip_path = await asyncio.to_thread(
                        process_and_save_strip,
                        session_id,
                        session_raw_photos,
                        PRINT_EXPORT_DIR,
                        session_dir,
                        template_id
                    )
                    
                    # Báo hoàn tất để chuyển sang màn hình QR / Review
                    await websocket.send_json({
                        "event": "COMPLETED",
                        "final_image_url": f"http://127.0.0.1:8000/data/sessions/{session_id}/final_photobooth_strip.jpg"
                    })
                
    except WebSocketDisconnect:
        print("Kiosk đã ngắt kết nối WebSocket.")