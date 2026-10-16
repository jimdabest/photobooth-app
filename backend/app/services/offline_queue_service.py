"""Manual synchronization for compressed files waiting in the offline queue."""

import json
from pathlib import Path

from app.config import OFFLINE_QUEUE_DIR, R2_BUCKET_NAME, R2_ENABLED, R2_PUBLIC_URL
from app.services.image_service import cloud_prefix, get_r2_client


def list_offline_queue() -> list[dict[str, str | int]]:
    return [
        {
            "session_id": image.stem,
            "status": "pending",
            "image_count": 1 + len(_queue_pose_paths(image.stem)),
            "path": str(image),
        }
        for image in sorted(OFFLINE_QUEUE_DIR.glob("*.jpg"), reverse=True)
        if "_pose_" not in image.stem
    ]


def _queue_pose_paths(session_id: str) -> list[Path]:
    return sorted(OFFLINE_QUEUE_DIR.glob(f"{session_id}_pose_*.jpg"), key=lambda path: path.name)


def sync_queue_item(session_id: str, client=None) -> dict[str, str]:
    image_path = OFFLINE_QUEUE_DIR / f"{session_id}.jpg"
    if not image_path.is_file():
        raise FileNotFoundError(f"Không tìm thấy ảnh offline: {session_id}")
    if client is None:
        if not R2_ENABLED or not R2_PUBLIC_URL:
            raise RuntimeError("R2 chưa được cấu hình")
        client = get_r2_client()
    if client is None:
        raise RuntimeError("Không thể kết nối R2")

    prefix = cloud_prefix(session_id)
    final_key = f"{prefix}/{session_id}.jpg"
    client.upload_file(str(image_path), R2_BUCKET_NAME, final_key, ExtraArgs={"ContentType": "image/jpeg"})
    public_base = R2_PUBLIC_URL.rstrip("/")
    pose_paths = _queue_pose_paths(session_id)
    pose_urls = []
    for pose_path in pose_paths:
        pose_name = pose_path.name.removeprefix(f"{session_id}_")
        pose_key = f"{prefix}/{pose_name}"
        client.upload_file(str(pose_path), R2_BUCKET_NAME, pose_key, ExtraArgs={"ContentType": "image/jpeg"})
        pose_urls.append(f"{public_base}/{pose_key}")
    client.put_object(
        Bucket=R2_BUCKET_NAME,
        Key=f"{prefix}/metadata.json",
        Body=json.dumps({"session_id": session_id, "final_image": f"{public_base}/{final_key}", "poses": pose_urls}).encode("utf-8"),
        ContentType="application/json",
    )
    image_path.unlink()
    for pose_path in pose_paths:
        pose_path.unlink()
    return {"session_id": session_id, "status": "uploaded"}


def sync_offline_queue(session_id: str | None = None, client=None, force: bool = False) -> list[dict[str, str]]:
    del force
    ids = [session_id] if session_id else [item["session_id"] for item in list_offline_queue()]
    results: list[dict[str, str]] = []
    for current_id in ids:
        try:
            results.append(sync_queue_item(str(current_id), client))
        except Exception as exc:
            results.append({"session_id": str(current_id), "status": "failed", "error": str(exc)})
    return results
