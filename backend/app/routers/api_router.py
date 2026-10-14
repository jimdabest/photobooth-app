"""HTTP API for settings, templates, printing, and session handoff."""

import asyncio
import shutil
import time
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import BASE_DATA_DIR, FINAL_IMAGES_DIR, SESSION_DIR
from app.services.camera_provider import canon_cam, capture_raw_photo, pre_focus_camera
from app.services.image_service import (
    final_image_path,
    finalize_session as finalize_session_service,
    get_session_url,
    process_and_save_strip,
    send_to_hot_folder,
)
from app.services.offline_queue_service import list_offline_queue, sync_offline_queue
from app.services.settings_service import load_settings, save_settings
from app.services.template_service import (
    create_template,
    delete_template as delete_template_service,
    get_template,
    list_templates,
    update_template as update_template_service,
)

router = APIRouter(prefix="/api")
limiter = Limiter(key_func=get_remote_address)


class PrintRequest(BaseModel):
    image_path: str | None = Field(default=None, max_length=1024)
    image_name_or_path: str | None = Field(default=None, max_length=1024)
    print_format: str = Field(default="s4x6", min_length=1, max_length=80, pattern=r"^[A-Za-z0-9][A-Za-z0-9_. -]*$")
    copies: int = Field(default=1, strict=True)


class OfflineQueueSyncRequest(BaseModel):
    session_id: str | None = Field(default=None, min_length=1, max_length=120, pattern=r"^[A-Za-z0-9_-]+$")
    force: bool = False


class FinalizeSessionRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9_-]+$")


class CaptureRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9_-]+$")
    template_id: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9_-]+$")
    pose_number: int = Field(ge=1, le=20)


class SettingsUpdate(BaseModel):
    """Validated Admin settings; extra legacy/template fields are preserved."""
    model_config = ConfigDict(extra="allow")

    offline_mode: bool | None = None
    auto_print: bool | None = None
    max_print_copies: int | None = Field(default=None, ge=1, le=10)
    enable_retake: bool | None = None
    enable_review_page: bool | None = None
    qr_timeout: int | None = Field(default=None, ge=1, le=600)
    hot_folder_dir: str | None = Field(default=None, min_length=1, max_length=1024)


def _session_id_from_print_value(value: str) -> str:
    candidate = Path(value).stem
    if not candidate or Path(candidate).name != candidate:
        raise HTTPException(status_code=422, detail="session_id không hợp lệ")
    try:
        if not final_image_path(candidate).is_file():
            raise HTTPException(status_code=404, detail="Không tìm thấy ảnh hoàn chỉnh")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return candidate


@router.get("/settings")
def get_settings():
    return load_settings()


@router.post("/settings")
def update_settings(changes: SettingsUpdate):
    try:
        return {"status": "success", "settings": save_settings(changes.model_dump(exclude_none=True))}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail="Không thể lưu settings.json") from exc


@router.post("/capture")
@limiter.limit("10/minute")
def capture_pose(request: Request, payload: CaptureRequest, background_tasks: BackgroundTasks):
    """Capture one pose after the client-side countdown for either camera adapter."""
    template = get_template(payload.template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy khung ảnh")

    total_poses = int(template.get("num_poses") or len(template.get("slots", [])) or 1)
    total_poses = max(1, min(total_poses, 20))
    if payload.pose_number > total_poses:
        raise HTTPException(status_code=422, detail="Pose vượt số lượng ảnh của khung")

    session_dir = SESSION_DIR / payload.session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    if payload.pose_number > 1 and not (session_dir / f"pose_{payload.pose_number - 1}.jpg").is_file():
        raise HTTPException(status_code=409, detail="Cần chụp pose trước trước khi tiếp tục")

    try:
        pre_focus_camera()
        photo_path = capture_raw_photo(str(session_dir), payload.pose_number)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Không thể chụp ảnh từ máy ảnh") from exc

    completed = payload.pose_number == total_poses
    settings = load_settings()
    response = {
        "session_id": payload.session_id,
        "pose_number": payload.pose_number,
        "total_poses": total_poses,
        "photo_path": photo_path,
        "completed": completed,
    }
    if not completed:
        return response

    raw_photos = [session_dir / f"pose_{pose}.jpg" for pose in range(1, total_poses + 1)]
    if not all(path.is_file() for path in raw_photos):
        raise HTTPException(status_code=409, detail="Thiếu ảnh pose để ghép khung")
    try:
        final_path = process_and_save_strip(
            payload.session_id,
            [str(path) for path in raw_photos],
            payload.template_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Không thể ghép ảnh thành phẩm") from exc

    print_queued = False
    print_error = ""
    # Khi bỏ qua trang xem lại, phải tự gửi một bản in mặc định để luồng
    # vẫn kết thúc ở màn hình trạng thái in mà không cần thao tác khách hàng.
    if settings["auto_print"] or not settings["enable_review_page"]:
        try:
            send_to_hot_folder(payload.session_id, template.get("print_format", "s4x6"), 1)
            print_queued = True
        except (OSError, ValueError, FileNotFoundError) as exc:
            print_error = str(exc)

    background_tasks.add_task(finalize_session_service, payload.session_id)
    response.update({
        "image_url": f"/data/final_images/{final_path.name}",
        "session_url": get_session_url(payload.session_id),
        "settings": settings,
        "print_queued": print_queued,
        "print_error": print_error,
    })
    return response


@router.get("/templates")
def get_templates():
    return list_templates()


@router.post("/templates/upload")
async def upload_template(
    name: str = Form(...),
    file: UploadFile = File(...),
    print_format: str = Form(default="s4x6"),
):
    try:
        return {"status": "success", "template": create_template(name, file.filename or "template.png", await file.read(), print_format)}
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/templates/{template_id}")
async def update_template(template_id: str, request: Request):
    try:
        return {"status": "success", "template": update_template_service(template_id, await request.json())}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/templates/{template_id}")
def delete_template(template_id: str):
    try:
        delete_template_service(template_id)
        return {"status": "success"}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/print")
def print_image(payload: PrintRequest):
    image_value = payload.image_path or payload.image_name_or_path
    if not image_value:
        raise HTTPException(status_code=422, detail="Thiếu image_path")
    session_id = _session_id_from_print_value(image_value)
    try:
        files = send_to_hot_folder(session_id, payload.print_format, payload.copies)
        return {"status": "queued", "copies": len(files), "files": files, "print_format": payload.print_format}
    except (OSError, ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=500, detail=f"Không thể gửi lệnh in: {exc}") from exc


@router.post("/session/finalize")
def finalize_session(payload: FinalizeSessionRequest, background_tasks: BackgroundTasks):
    if not final_image_path(payload.session_id).is_file():
        raise HTTPException(status_code=404, detail="Không tìm thấy ảnh phiên chụp")
    settings = load_settings()
    background_tasks.add_task(finalize_session_service, payload.session_id)
    return {
        "status": "queued",
        "session_id": payload.session_id,
        "session_url": get_session_url(payload.session_id),
        "offline_mode": settings["offline_mode"],
    }


@router.get("/offline-queue")
def get_offline_queue():
    return {"items": list_offline_queue()}


@router.post("/offline-queue/sync")
async def sync_offline_queue_endpoint(payload: OfflineQueueSyncRequest):
    return {"results": await asyncio.to_thread(sync_offline_queue, payload.session_id, None, payload.force)}


@router.post("/upload-background")
async def upload_background(file: UploadFile = File(...)):
    background_path = BASE_DATA_DIR / "app_background.jpg"
    with open(background_path, "wb") as destination:
        shutil.copyfileobj(file.file, destination)
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
                yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + frame + b"\r\n"
            time.sleep(0.04)

    return StreamingResponse(generate_frames(), media_type="multipart/x-mixed-replace; boundary=frame")


@router.get("/sessions/{session_id}")
def get_session_info(session_id: str):
    local_image = FINAL_IMAGES_DIR / f"{session_id}.jpg"
    if local_image.is_file():
        return {
            "session_id": session_id,
            "local_url": f"http://127.0.0.1:8000/data/final_images/{session_id}.jpg",
            "cloud_url": "",
            "has_cloud": False,
        }
    raise HTTPException(status_code=404, detail="Không tìm thấy session")
