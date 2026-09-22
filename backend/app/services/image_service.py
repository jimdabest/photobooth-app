import os
import json
import time
import qrcode
import boto3
from botocore.config import Config
from PIL import Image, ImageDraw, ImageOps
from app.config import (
    BASE_SAVE_DIR,
    R2_ENABLED,
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY,
    R2_SECRET_KEY,
    R2_BUCKET_NAME,
    R2_PUBLIC_URL,
    FRONTEND_URL,
)

CONFIG_DIR = os.path.join(BASE_SAVE_DIR, "config")
TEMPLATES_FILE = os.path.join(CONFIG_DIR, "templates.json")
TEMPLATES_DIR = os.path.join(BASE_SAVE_DIR, "templates")

# Client R2 (lazy init)
_s3_client = None


def _get_s3_client():
    """Khởi tạo S3 client cho R2 (chỉ tạo 1 lần)"""
    global _s3_client
    if _s3_client is not None:
        return _s3_client

    if not R2_ENABLED:
        return None

    try:
        _s3_client = boto3.client(
            's3',
            endpoint_url=f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com',
            aws_access_key_id=R2_ACCESS_KEY,
            aws_secret_access_key=R2_SECRET_KEY,
            config=Config(signature_version='s3v4'),
            region_name='auto'
        )
        print("[R2] Đã kết nối Cloudflare R2")
        return _s3_client
    except Exception as e:
        print(f"[R2] Lỗi khởi tạo client: {e}")
        return None


def upload_session_to_r2(session_id, session_dir, final_path):
    """
    Upload toàn bộ session lên R2:
    - final.jpg
    - pose_1.jpg, pose_2.jpg, ...
    - metadata.json
    """
    result = {"final": "", "poses": [], "metadata": ""}

    if not R2_ENABLED:
        print("[R2] Chưa bật, bỏ qua upload session")
        return result

    client = _get_s3_client()
    if client is None:
        return result

    try:
        now = time.localtime()
        month_str = time.strftime('%Y-%m', now)
        base_key = f"prints/{month_str}/{session_id}"

        # Upload ảnh final
        final_key = f"{base_key}/final.jpg"
        client.upload_file(
            final_path,
            R2_BUCKET_NAME,
            final_key,
            ExtraArgs={'ContentType': 'image/jpeg'}
        )
        result["final"] = f"{R2_PUBLIC_URL.rstrip('/')}/{final_key}"
        print(f"[R2] Upload final: {result['final']}")

        # Upload từng pose gốc
        for i in range(1, 20):
            pose_file = os.path.join(session_dir, f"pose_{i}.jpg")
            if not os.path.exists(pose_file):
                break

            pose_key = f"{base_key}/pose_{i}.jpg"
            client.upload_file(
                pose_file,
                R2_BUCKET_NAME,
                pose_key,
                ExtraArgs={'ContentType': 'image/jpeg'}
            )
            pose_url = f"{R2_PUBLIC_URL.rstrip('/')}/{pose_key}"
            result["poses"].append(pose_url)
            print(f"[R2] Upload pose {i}: {pose_url}")

        # Upload metadata.json
        metadata = {
            "session_id": session_id,
            "final_image": result["final"],
            "poses": result["poses"],
            "created_at": time.time(),
            "created_at_str": time.strftime('%Y-%m-%d %H:%M:%S')
        }

        metadata_key = f"{base_key}/metadata.json"
        metadata_bytes = json.dumps(metadata, ensure_ascii=False, indent=2).encode('utf-8')

        client.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=metadata_key,
            Body=metadata_bytes,
            ContentType='application/json'
        )
        result["metadata"] = f"{R2_PUBLIC_URL.rstrip('/')}/{metadata_key}"
        print(f"[R2] Upload metadata: {result['metadata']}")

    except Exception as e:
        print(f"[R2] Lỗi upload session: {e}")

    return result


def process_and_save_strip(session_id, session_raw_photos, print_export_dir, session_dir, template_id="tpl_default"):
    """Ghép ảnh chụp vào template, upload cả session lên R2"""
    # Đọc cấu hình template
    tpl_config = None
    if os.path.exists(TEMPLATES_FILE):
        try:
            with open(TEMPLATES_FILE, "r", encoding="utf-8") as f:
                templates = json.load(f)
                tpl_config = next((t for t in templates if t["id"] == template_id), None)
                if not tpl_config and templates:
                    tpl_config = templates[0]
        except Exception as e:
            print(f"Lỗi đọc templates.json: {e}")

    # Tìm file ảnh khung
    actual_tpl_file = None
    for ext in ["png", "jpg", "jpeg"]:
        test_path = os.path.join(TEMPLATES_DIR, f"{template_id}.{ext}")
        if os.path.exists(test_path):
            actual_tpl_file = test_path
            break

    # Xác định kích thước canvas
    if actual_tpl_file:
        with Image.open(actual_tpl_file) as img_check:
            canvas_w, canvas_h = img_check.size
    elif tpl_config and "canvas_size" in tpl_config:
        canvas_w = tpl_config["canvas_size"]["width"]
        canvas_h = tpl_config["canvas_size"]["height"]
    else:
        canvas_w, canvas_h = 880, 2650

    print(f"[IMAGE SERVICE] Tạo canvas {canvas_w}x{canvas_h}")

    strip_image = Image.new("RGBA", (canvas_w, canvas_h), color=(255, 255, 255, 255))

    # Dán ảnh chụp vào các slot
    if tpl_config and "slots" in tpl_config:
        for i, photo_path in enumerate(session_raw_photos):
            if i < len(tpl_config["slots"]):
                slot = tpl_config["slots"][i]
                try:
                    if os.path.exists(photo_path):
                        img = Image.open(photo_path).convert("RGBA")
                        target_size = (slot["width"], slot["height"])
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

    # Phủ khung viền
    if actual_tpl_file:
        try:
            tpl_img = Image.open(actual_tpl_file).convert("RGBA")
            if tpl_img.size != (canvas_w, canvas_h):
                tpl_img = tpl_img.resize((canvas_w, canvas_h), Image.Resampling.LANCZOS)
            strip_image.paste(tpl_img, (0, 0), tpl_img)
        except Exception as e:
            print(f"Lỗi dán viền template: {e}")

    # Đóng dấu QR code — trỏ đến Cloudflare Pages
    qr_conf = tpl_config.get("qr_config", {}) if tpl_config else {}
    if qr_conf.get("print_on_photo", True):
        try:
            qr_url = f"{FRONTEND_URL}/#/download/{session_id}"
            print(f"[QR] URL: {qr_url}")

            qr = qrcode.QRCode(version=1, box_size=10, border=1)
            qr.add_data(qr_url)
            qr.make(fit=True)
            qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGBA")

            qr_size = qr_conf.get("size", 150)
            qr_img = qr_img.resize((qr_size, qr_size))

            qr_x = qr_conf.get("x", canvas_w - qr_size - 30)
            qr_y = qr_conf.get("y", canvas_h - qr_size - 30)

            qr_x = max(0, min(qr_x, canvas_w - qr_size))
            qr_y = max(0, min(qr_y, canvas_h - qr_size))

            strip_image.paste(qr_img, (qr_x, qr_y), qr_img)
        except Exception as e:
            print(f"Lỗi tạo QR: {e}")

    # Lưu ảnh local
    cloud_save_path = os.path.join(session_dir, "final_photobooth_strip.jpg")
    print_save_path = os.path.join(print_export_dir, f"print_{session_id}.jpg")

    final_rgb = strip_image.convert("RGB")
    final_rgb.save(cloud_save_path, "JPEG", quality=95)
    final_rgb.save(print_save_path, "JPEG", quality=95)

    # Upload cả session lên R2
    session_urls = upload_session_to_r2(session_id, session_dir, cloud_save_path)

    # Lưu metadata local
    metadata = {
        "session_id": session_id,
        "template_id": template_id,
        "local_url": f"http://127.0.0.1:8000/data/sessions/{session_id}/final_photobooth_strip.jpg",
        "cloud_url": session_urls.get("final", ""),
        "cloud_poses": session_urls.get("poses", []),
        "cloud_metadata": session_urls.get("metadata", ""),
        "has_cloud": bool(session_urls.get("final")),
        "created_at": time.time()
    }

    metadata_path = os.path.join(session_dir, "metadata.json")
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    print(f"[IMAGE SERVICE] Đã lưu session {session_id}, cloud: {bool(session_urls.get('final'))}")

    return cloud_save_path, session_urls