from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import asyncio
from app.utils.file_manager import create_session_folder
from app.services.image_service import capture_raw_photo, process_and_save_strip # Đã sửa import

router = APIRouter()
active_connection = None

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    global active_connection
    await websocket.accept()
    active_connection = websocket
    print("✅ Màn hình Kiosk đã kết nối WebSocket thành công!")
    
    # Nhận 4 biến từ hệ thống quản lý file
    session_id, session_path, cloud_sim_dir, print_export_dir = create_session_folder()
    
    session_raw_photos = []
    
    try:
        while True:
            data = await websocket.receive_json()
            
            if data.get("action") == "capture":
                pose_number = data.get("pose", 1)
                template_id = data.get("template_id", "tpl_default")
                
                # Bỏ dòng await asyncio.sleep(1) đi vì máy ảnh thật đã có độ trễ tự nhiên rồi
                
                # ĐÃ SỬA: Đưa lệnh chụp vào Thread riêng để không làm đơ WebSocket
                print(f"📸 Đang ra lệnh chụp kiểu số {pose_number}...")
                cloud_file_path = await asyncio.to_thread(capture_raw_photo, cloud_sim_dir, pose_number)
                
                session_raw_photos.append(cloud_file_path)
                
                if pose_number == 3:
                    # Truyền session_id và print_export_dir vào hàm ghép ảnh
                    # Chạy process_and_save_strip trong background luôn để tránh nghẽn server
                    await asyncio.to_thread(process_and_save_strip, session_id, session_raw_photos, print_export_dir, cloud_sim_dir, template_id)                    
                    
                    # URL gửi lên màn hình Review
                    final_image_url = f"http://127.0.0.1:8000/data/{session_id}/cloud_simulated/final_photobooth_strip.jpg"

                    await websocket.send_json({
                        "status": "success",
                        "pose": pose_number,
                        "final_image_url": final_image_url
                    })
                else:
                    await websocket.send_json({
                        "status": "success",
                        "pose": pose_number
                    })

    except WebSocketDisconnect:
        print("❌ Kiosk đã ngắt kết nối WebSocket.")
        active_connection = None