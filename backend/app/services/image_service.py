"""Image composition, print routing, and online/offline delivery."""

import json
import os
import re
import shutil
import tempfile
import time
from pathlib import Path

import qrcode
from PIL import Image, ImageOps

from app.config import (
    DEFAULT_PRINT_COPIES,
    FINAL_IMAGES_DIR,
    FRONTEND_URL,
    HOT_FOLDER_DIR,
    MAX_PRINT_COPIES,
    OFFLINE_QUEUE_DIR,
    R2_ACCESS_KEY,
    R2_ACCOUNT_ID,
    R2_BUCKET_NAME,
    R2_ENABLED,
    R2_PUBLIC_URL,
    R2_SECRET_KEY,
    SESSION_DIR,
    TEMPLATE_DIR,
    WEB_IMAGE_MAX_WIDTH,
    WEB_IMAGE_QUALITY,
    PROJECT_DIR,
)
from app.services.settings_service import DEFAULT_HOT_FOLDER_DIR, load_settings
from app.services.template_service import get_template

try:
    import boto3
    from botocore.config import Config
except ImportError:
    boto3 = None
    Config = None

_s3_client = None
_SAFE_SEGMENT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")
_HFP_4X6_JOB_SIZE = (1200, 1800)
_HFP_2X6_JOB_SIZE = (600, 1800)


def cloud_prefix(session_id: str) -> str:
    return f"photo/{session_id}"


def get_session_url(session_id: str) -> str:
    """Return the canonical public hash-router URL for a photo session."""
    base_url = FRONTEND_URL.split("#", 1)[0].rstrip("/")
    return f"{base_url}/#/photo/{session_id}"


def final_image_path(session_id: str) -> Path:
    if not _SAFE_SEGMENT.fullmatch(session_id):
        raise ValueError("session_id không hợp lệ")
    return FINAL_IMAGES_DIR / f"{session_id}.jpg"


def get_hot_folder_dir(settings: dict | None = None) -> Path:
    """Resolve the configurable HFP root, while retaining the project default."""
    configured = str((settings or load_settings()).get("hot_folder_dir", DEFAULT_HOT_FOLDER_DIR)).strip()
    if configured == DEFAULT_HOT_FOLDER_DIR:
        return HOT_FOLDER_DIR
    path = Path(configured).expanduser()
    return path if path.is_absolute() else PROJECT_DIR / path


def _write_hfp_job(source: Path, destination: Path, print_format: str) -> None:
    """Write a DNP-compatible print file without altering the kiosk original.

    HFP's ``s4x6`` queue takes one 4x6 image. A kiosk 2x6 template must go
    to ``s2x6`` as one native strip. ``s6x2_2`` is HFP's two-up batching
    queue and can put two customers on one sheet, so it is migrated to
    ``s2x6`` by settings_service before jobs are created.
    User-uploaded templates may be preview-sized, so letterbox rather than
    crop the frame.
    """
    if print_format == "s4x6":
        output_size = _HFP_4X6_JOB_SIZE
    elif print_format == "s2x6":
        output_size = _HFP_2X6_JOB_SIZE
    else:
        shutil.copy2(source, destination)
        return

    with Image.open(source) as original:
        image = ImageOps.exif_transpose(original).convert("RGB")
        fitted = ImageOps.contain(image, output_size, method=Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", output_size, "white")
        offset = ((canvas.width - fitted.width) // 2, (canvas.height - fitted.height) // 2)
        canvas.paste(fitted, offset)
        canvas.save(destination, "JPEG", quality=95, dpi=(300, 300))


def _get_s3_client():
    global _s3_client
    if _s3_client is not None:
        return _s3_client
    if not R2_ENABLED or boto3 is None or Config is None:
        return None
    try:
        _s3_client = boto3.client(
            "s3",
            endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=R2_ACCESS_KEY,
            aws_secret_access_key=R2_SECRET_KEY,
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )
        return _s3_client
    except Exception as exc:
        print(f"[R2] Không thể tạo client: {exc}")
        return None


def get_r2_client():
    return _get_s3_client()


def create_web_optimized_image(source_path: str | Path, output_path: str | Path) -> Path:
    """Create a JPEG web derivative at the required resolution and quality."""
    source = Path(source_path)
    output = Path(output_path)
    if not source.is_file():
        raise FileNotFoundError(f"Không tìm thấy ảnh: {source}")
    output.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        if image.mode in {"RGBA", "LA"} or (image.mode == "P" and "transparency" in image.info):
            background = Image.new("RGB", image.size, "white")
            rgba = image.convert("RGBA")
            background.paste(rgba, mask=rgba.getchannel("A"))
            image = background
        else:
            image = image.convert("RGB")
        if image.width > WEB_IMAGE_MAX_WIDTH:
            height = max(1, round(image.height * WEB_IMAGE_MAX_WIDTH / image.width))
            image = image.resize((WEB_IMAGE_MAX_WIDTH, height), Image.Resampling.LANCZOS)
        image.save(output, "JPEG", quality=WEB_IMAGE_QUALITY, optimize=True, progressive=True)
    return output


def upload_final_image_to_r2(
    session_id: str,
    web_image_path: Path,
    pose_image_paths: list[Path] | None = None,
) -> dict[str, object]:
    """Upload the final image and every compressed pose before publishing metadata."""
    client = _get_s3_client()
    if client is None or not R2_PUBLIC_URL:
        return {"final": "", "metadata": "", "poses": []}
    prefix = cloud_prefix(session_id)
    try:
        final_key = f"{prefix}/{session_id}.jpg"
        client.upload_file(str(web_image_path), R2_BUCKET_NAME, final_key, ExtraArgs={"ContentType": "image/jpeg"})
        public_base = R2_PUBLIC_URL.rstrip("/")
        final_url = f"{public_base}/{final_key}"
        pose_urls = []
        for pose_path in pose_image_paths or []:
            pose_key = f"{prefix}/{pose_path.name}"
            client.upload_file(str(pose_path), R2_BUCKET_NAME, pose_key, ExtraArgs={"ContentType": "image/jpeg"})
            pose_urls.append(f"{public_base}/{pose_key}")
        metadata_key = f"{prefix}/metadata.json"
        client.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=metadata_key,
            Body=json.dumps({"session_id": session_id, "final_image": final_url, "poses": pose_urls}).encode("utf-8"),
            ContentType="application/json",
        )
        return {"final": final_url, "metadata": f"{public_base}/{metadata_key}", "poses": pose_urls}
    except Exception as exc:
        print(f"[R2] Upload thất bại cho {session_id}: {exc}")
        return {"final": "", "metadata": "", "poses": []}


def send_to_hot_folder(
    session_id: str,
    print_format: str,
    copies: int = DEFAULT_PRINT_COPIES,
) -> list[str]:
    """Copy one independent HFP job file for every requested print copy."""
    source = final_image_path(session_id)
    if not source.is_file():
        raise FileNotFoundError(f"Không tìm thấy ảnh hoàn chỉnh: {source}")
    if not isinstance(print_format, str) or not _SAFE_SEGMENT.fullmatch(print_format):
        raise ValueError("print_format không hợp lệ")

    settings = load_settings()
    try:
        requested_copies = int(copies)
    except (TypeError, ValueError):
        requested_copies = 1
    valid_copies = max(1, min(requested_copies, int(settings["max_print_copies"]), MAX_PRINT_COPIES))
    # HFP 3.x theo dõi theo cấu trúc: Prints/<print size>/<printer name>.
    # `hot_folder_dir` là thư mục Prints được chọn trong HFP Settings.
    hot_folder_root = get_hot_folder_dir(settings)
    target_dir = hot_folder_root / print_format / settings["printer_model"]
    target_dir.mkdir(parents=True, exist_ok=True)
    # HFP 3.6 documents job intake as an image *moved into* a monitored
    # directory. Keep staging outside Prints so the final replace is a real
    # move into the watcher rather than a rename within it.
    staging_dir = hot_folder_root.parent / ".photobooth_hfp_staging"
    staging_dir.mkdir(parents=True, exist_ok=True)

    created: list[str] = []
    timestamp = time.strftime("%Y%m%d-%H%M%S") + f"-{time.time_ns() % 1_000_000:06d}"
    for copy_index in range(1, valid_copies + 1):
        destination = target_dir / f"{session_id}_{timestamp}_{copy_index}.jpg"
        retry_index = 1
        while destination.exists():
            retry_index += 1
            destination = target_dir / f"{session_id}_{timestamp}_{copy_index}_{retry_index}.jpg"
        # Prepare outside the watcher, then move the completed JPG into HFP.
        # This avoids HFP reading a partially written file and emits the
        # expected arrival event even when it only handles moved files.
        staged = staging_dir / f"{destination.name}.{time.time_ns()}.staging"
        try:
            _write_hfp_job(source, staged, print_format)
            staged.replace(destination)
        finally:
            staged.unlink(missing_ok=True)
        created.append(str(destination))
        if copy_index < valid_copies:
            time.sleep(0.05)
    return created


def _session_pose_paths(session_id: str) -> list[Path]:
    session_dir = SESSION_DIR / session_id
    return sorted(session_dir.glob("pose_*.jpg"), key=lambda path: path.name)


def _cleanup_session_raw_files(session_id: str, settings: dict) -> None:
    session_dir = SESSION_DIR / session_id
    if not settings["save_session_raw_images"] and session_dir.is_dir():
        shutil.rmtree(session_dir)


def _queue_web_images(session_id: str, web_image: Path, web_poses: list[Path]) -> Path:
    """Persist optimized files before a retryable R2 synchronization."""
    OFFLINE_QUEUE_DIR.mkdir(parents=True, exist_ok=True)
    queued_image = OFFLINE_QUEUE_DIR / f"{session_id}.jpg"
    shutil.copy2(web_image, queued_image)
    for pose_path in web_poses:
        shutil.copy2(pose_path, OFFLINE_QUEUE_DIR / f"{session_id}_{pose_path.name}")
    return queued_image


def finalize_session(session_id: str) -> dict[str, object]:
    """Create web images for the final and poses, then upload or queue all of them."""
    source = final_image_path(session_id)
    settings = load_settings()
    raw_poses = _session_pose_paths(session_id)

    with tempfile.TemporaryDirectory(prefix=f"photobooth_{session_id}_") as temporary_dir:
        staging_dir = Path(temporary_dir)
        web_image = create_web_optimized_image(source, staging_dir / f"{session_id}.jpg")
        web_poses = [
            create_web_optimized_image(pose_path, staging_dir / pose_path.name)
            for pose_path in raw_poses
        ]

        if settings["offline_mode"]:
            queued_image = _queue_web_images(session_id, web_image, web_poses)
            _cleanup_session_raw_files(session_id, settings)
            return {
                "session_url": get_session_url(session_id),
                "queue_file": str(queued_image),
                "cloud_url": "",
                "pose_count": len(web_poses),
            }

        try:
            result = upload_final_image_to_r2(session_id, web_image, web_poses)
            if not result.get("final"):
                raise RuntimeError("R2 không trả về URL ảnh sau khi upload")
            _cleanup_session_raw_files(session_id, settings)
            return {
                "session_url": get_session_url(session_id),
                "queue_file": "",
                "cloud_url": result["final"],
                "pose_count": len(web_poses),
            }
        except Exception as exc:
            print(f"[FINALIZE] Upload R2 thất bại, đưa vào queue: {exc}")
            queued_image = _queue_web_images(session_id, web_image, web_poses)
            _cleanup_session_raw_files(session_id, settings)
            return {
                "session_url": get_session_url(session_id),
                "queue_file": str(queued_image),
                "cloud_url": "",
                "pose_count": len(web_poses),
                "fallback": True,
            }


def process_and_save_strip(session_id: str, raw_photo_paths: list[str], template_id: str) -> Path:
    """Compose the final image and optionally retain raw files for the session."""
    settings = load_settings()
    template = get_template(template_id) or settings["templates"][0]
    template_file = next(
        (TEMPLATE_DIR / f"{template_id}.{extension}"
         for extension in ("png", "jpg", "jpeg")
         if (TEMPLATE_DIR / f"{template_id}.{extension}").is_file()),
        None,
    )
    if template_file:
        with Image.open(template_file) as image:
            canvas_width, canvas_height = image.size
    else:
        canvas = template.get("canvas_size", {"width": 1200, "height": 1800})
        canvas_width, canvas_height = canvas["width"], canvas["height"]

    composed = Image.new("RGBA", (canvas_width, canvas_height), "white")
    for index, raw_path in enumerate(raw_photo_paths):
        slots = template.get("slots", [])
        if index >= len(slots) or not Path(raw_path).is_file():
            continue
        slot = slots[index]
        with Image.open(raw_path) as raw:
            fitted = ImageOps.fit(
                raw.convert("RGBA"),
                (slot["width"], slot["height"]),
                method=Image.Resampling.LANCZOS,
                centering=(0.5, 0.5),
            )
            if slot.get("rotation"):
                fitted = fitted.rotate(slot["rotation"], expand=True)
            composed.paste(fitted, (slot["x"], slot["y"]), fitted)

    if template_file:
        with Image.open(template_file) as overlay:
            overlay = overlay.convert("RGBA")
            if overlay.size != composed.size:
                overlay = overlay.resize(composed.size, Image.Resampling.LANCZOS)
            composed.paste(overlay, (0, 0), overlay)

    qr_config = template.get("qr_config", {})
    if not settings["offline_mode"] and qr_config.get("print_on_photo", True):
        qr_size = int(qr_config.get("size", 150))
        qr = qrcode.QRCode(version=1, box_size=10, border=1)
        qr.add_data(get_session_url(session_id))
        qr.make(fit=True)
        qr_image = qr.make_image(fill_color="black", back_color="white").convert("RGBA").resize((qr_size, qr_size))
        x = max(0, min(int(qr_config.get("x", canvas_width - qr_size - 30)), canvas_width - qr_size))
        y = max(0, min(int(qr_config.get("y", canvas_height - qr_size - 30)), canvas_height - qr_size))
        composed.paste(qr_image, (x, y), qr_image)

    final_path = final_image_path(session_id)
    final_path.parent.mkdir(parents=True, exist_ok=True)
    # StaticFiles có thể nhận GET ngay khi API trả về. Lưu file tạm và thay thế
    # nguyên tử để trình duyệt không bao giờ đọc phải JPEG đang được ghi dở.
    temporary_final_path = final_path.with_suffix(f".{time.time_ns()}.tmp")
    try:
        composed.convert("RGB").save(temporary_final_path, "JPEG", quality=95)
        os.replace(temporary_final_path, final_path)
    finally:
        temporary_final_path.unlink(missing_ok=True)

    return final_path
