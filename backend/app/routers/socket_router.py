import asyncio
import json
import os
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.config import BASE_SAVE_DIR, PRINT_EXPORT_DIR
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
    print("Kiosk kết nối WebSocket thành công")

    session_raw_photos = []

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")

            if action == "START_SESSION":
                template_id = data.get("template_id", "tpl_default")
                session_id = data.get("session_id", "default_session")

                # Lấy số lượng ảnh từ template
                tpl = get_template_by_id(template_id)
                num_poses = tpl.get("num_poses", len(tpl.get("slots", []))) if tpl else 3

                # Đọc thời gian đếm ngược
                countdown = 3
                settings_file = os.path.join(CONFIG_DIR, "settings.json")
                if os.path.exists(settings_file):
                    with open(settings_file, "r", encoding="utf-8") as f:
                        settings = json.load(f)
                        countdown = settings.get("countdown_capture", 3)

                session_raw_photos.clear()
                session_failed = False

                for pose in range(1, num_poses + 1):
                    # Kiểm tra kết nối camera
                    if canon_cam.camera is None:
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

                    session_dir = os.path.join(BASE_SAVE_DIR, "sessions", session_id)
                    os.makedirs(session_dir, exist_ok=True)

                    if countdown > 0:
                        await asyncio.sleep(countdown)

                    print(f"[{pose}/{num_poses}] Lấy nét")
                    await asyncio.to_thread(pre_focus_camera)
                    await asyncio.sleep(0.8)

                    print(f"[{pose}/{num_poses}] Chụp ảnh")
                    await websocket.send_json({"event": "TRIGGER_FLASH"})

                    photo_path = await asyncio.to_thread(capture_raw_photo, session_dir, pose)
                    session_raw_photos.append(photo_path)

                    await asyncio.sleep(1)

                if not session_failed:
                    await websocket.send_json({"event": "PROCESSING"})

                    _, session_urls = await asyncio.to_thread(
                        process_and_save_strip,
                        session_id,
                        session_raw_photos,
                        PRINT_EXPORT_DIR,
                        session_dir,
                        template_id
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