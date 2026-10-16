"""Upload offline queue items to R2 after an event.

    python sync_offline_queue.py --dry-run
    python sync_offline_queue.py
    python sync_offline_queue.py --session 261006-151258-a7k2
"""
import argparse
import sys

from venv_bootstrap import use_project_venv


if __name__ == "__main__":
    use_project_venv(__file__)

from app.services.offline_queue_service import list_offline_queue, sync_offline_queue


def main() -> int:
    parser = argparse.ArgumentParser(description="Đồng bộ Offline Queue lên Cloudflare R2")
    parser.add_argument("--session", help="Chỉ đồng bộ một session ID")
    parser.add_argument("--dry-run", action="store_true", help="Chỉ liệt kê queue, không upload")
    parser.add_argument("--force", action="store_true", help="Upload lại session đã có trạng thái uploaded")
    args = parser.parse_args()

    if args.dry_run:
        items = list_offline_queue()
        if not items:
            print("Offline Queue trống.")
            return 0
        for item in items:
            print(item["session_id"])
        return 0

    results = sync_offline_queue(args.session, force=args.force)
    if not results:
        print("Không có phiên nào trong Offline Queue.")
        return 0
    failures = 0
    for result in results:
        print(f"{result['session_id']}: {result['status']}")
        if result["status"] == "failed":
            failures += 1
            print(f"  {result['error']}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
