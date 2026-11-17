"""Smoke test for the synthetic-camera server entry point."""

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ["PHOTOBOOTH_CAMERA_MODE"] = "mock"

from fastapi.testclient import TestClient
from PIL import Image
from app.main import app
from app.routers import api_router
from app.services.settings_service import DEFAULT_SETTINGS


class MockServerTests(unittest.TestCase):
    def tearDown(self):
        api_router.limiter._storage.reset()

    def test_settings_and_template_endpoints_are_available(self):
        with TestClient(app) as client:
            settings = client.get("/api/settings")
            self.assertEqual(settings.status_code, 200)
            self.assertEqual(settings.json()["printer_model"], "RX1HS")
            self.assertIn("manual_capture", settings.json())
            update = client.post("/api/settings", json={"manual_capture": True})
            self.assertEqual(update.status_code, 200)
            self.assertTrue(update.json()["settings"]["manual_capture"])
            # Reset back to False
            client.post("/api/settings", json={"manual_capture": False})
            templates = client.get("/api/templates")
            self.assertEqual(templates.status_code, 200)
            self.assertGreaterEqual(len(templates.json()), 1)

    def test_capture_endpoint_uses_the_shared_camera_flow(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)

            def capture_raw(session_dir, pose_number):
                output = Path(session_dir) / f"pose_{pose_number}.jpg"
                Image.new("RGB", (100, 100), "white").save(output)
                return str(output)

            def compose(session_id, raw_photos, template_id):
                output = root / f"{session_id}.jpg"
                Image.new("RGB", (100, 100), "white").save(output)
                return output

            template = {"id": "tpl_rest", "num_poses": 1, "slots": [{}], "print_format": "s4x6"}
            with patch.object(api_router, "SESSION_DIR", root / "sessions"), \
                 patch.object(api_router, "get_template", return_value=template), \
                 patch.object(api_router, "load_settings", return_value=dict(DEFAULT_SETTINGS)), \
                 patch.object(api_router, "pre_focus_camera"), \
                 patch.object(api_router, "capture_raw_photo", side_effect=capture_raw), \
                 patch.object(api_router, "process_and_save_strip", side_effect=compose), \
                 patch.object(api_router, "finalize_session_service"):
                with TestClient(app) as client:
                    response = client.post("/api/capture", json={
                        "session_id": "rest-session", "template_id": "tpl_rest", "pose_number": 1,
                    })

            self.assertEqual(response.status_code, 200)
            payload = response.json()
            self.assertTrue(payload["completed"])
            self.assertEqual(payload["image_url"], "/data/final_images/rest-session.jpg")
            self.assertIn("poses", payload)

    def test_retake_pose_recomposes_strip(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)

            def capture_raw(session_dir, pose_number):
                output = Path(session_dir) / f"pose_{pose_number}.jpg"
                Image.new("RGB", (100, 100), "white").save(output)
                return str(output)

            composed_calls = []
            def compose(session_id, raw_photos, template_id):
                composed_calls.append(raw_photos)
                output = root / f"{session_id}.jpg"
                Image.new("RGB", (100, 100), "white").save(output)
                return output

            template = {"id": "tpl_2poses", "num_poses": 2, "slots": [{}, {}], "print_format": "s4x6"}
            with patch.object(api_router, "SESSION_DIR", root / "sessions"), \
                 patch.object(api_router, "get_template", return_value=template), \
                 patch.object(api_router, "load_settings", return_value=dict(DEFAULT_SETTINGS)), \
                 patch.object(api_router, "pre_focus_camera"), \
                 patch.object(api_router, "capture_raw_photo", side_effect=capture_raw), \
                 patch.object(api_router, "process_and_save_strip", side_effect=compose), \
                 patch.object(api_router, "finalize_session_service"):
                with TestClient(app) as client:
                    # 1. Chụp pose 1
                    r1 = client.post("/api/capture", json={
                        "session_id": "retake-session", "template_id": "tpl_2poses", "pose_number": 1,
                    })
                    self.assertFalse(r1.json()["completed"])
                    # 2. Chụp pose 2 (kết thúc phiên lần đầu)
                    r2 = client.post("/api/capture", json={
                        "session_id": "retake-session", "template_id": "tpl_2poses", "pose_number": 2,
                    })
                    self.assertTrue(r2.json()["completed"])
                    self.assertEqual(len(composed_calls), 1)

                    # 3. Retake chỉ pose 1
                    r_retake = client.post("/api/capture", json={
                        "session_id": "retake-session", "template_id": "tpl_2poses", "pose_number": 1,
                        "is_retake": True, "is_last_in_retake": True
                    })
                    self.assertTrue(r_retake.json()["completed"])
                    self.assertEqual(len(composed_calls), 2)

    def test_capture_endpoint_is_rate_limited(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)

            def capture_raw(session_dir, pose_number):
                output = Path(session_dir) / f"pose_{pose_number}.jpg"
                Image.new("RGB", (100, 100), "white").save(output)
                return str(output)

            template = {"id": "tpl_rate", "num_poses": 2, "slots": [{}, {}]}
            with patch.object(api_router, "SESSION_DIR", root / "sessions"), \
                 patch.object(api_router, "get_template", return_value=template), \
                 patch.object(api_router, "load_settings", return_value=dict(DEFAULT_SETTINGS)), \
                 patch.object(api_router, "pre_focus_camera"), \
                 patch.object(api_router, "capture_raw_photo", side_effect=capture_raw):
                with TestClient(app) as client:
                    responses = [client.post("/api/capture", json={
                        "session_id": f"rate-session-{index}", "template_id": "tpl_rate", "pose_number": 1,
                    }) for index in range(15)]

        self.assertEqual([response.status_code for response in responses[:10]], [200] * 10)
        self.assertEqual([response.status_code for response in responses[10:]], [429] * 5)

    def test_live_view_runs_until_all_poses_complete_then_reopens_for_new_session(self):
        with TestClient(app) as client:
            api_router.canon_cam.start_live_view_thread()
            self.assertTrue(api_router.canon_cam.is_live_view_active)

            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)

                def capture_raw(session_dir, pose_number):
                    output = Path(session_dir) / f"pose_{pose_number}.jpg"
                    Image.new("RGB", (100, 100), "white").save(output)
                    return str(output)

                def compose(session_id, raw_photos, template_id):
                    output = root / f"{session_id}.jpg"
                    Image.new("RGB", (100, 100), "white").save(output)
                    return output

                template = {"id": "tpl_multi", "num_poses": 2, "slots": [{}, {}], "print_format": "s4x6"}
                with patch.object(api_router, "SESSION_DIR", root / "sessions"), \
                     patch.object(api_router, "get_template", return_value=template), \
                     patch.object(api_router, "load_settings", return_value=dict(DEFAULT_SETTINGS)), \
                     patch.object(api_router, "pre_focus_camera"), \
                     patch.object(api_router, "capture_raw_photo", side_effect=capture_raw), \
                     patch.object(api_router, "process_and_save_strip", side_effect=compose), \
                     patch.object(api_router, "finalize_session_service"):

                    # Pose 1: chưa hết phiên (1/2), live view phải TIẾP TỤC CHẠY
                    resp1 = client.post("/api/capture", json={
                        "session_id": "multi-session", "template_id": "tpl_multi", "pose_number": 1,
                    })
                    self.assertEqual(resp1.status_code, 200)
                    self.assertFalse(resp1.json()["completed"])
                    self.assertTrue(api_router.canon_cam.reopen_live_view)
                    self.assertTrue(api_router.canon_cam.is_live_view_active)

                    # Pose 2: hết phiên (2/2), live view phải ĐƯỢC NGẮT
                    resp2 = client.post("/api/capture", json={
                        "session_id": "multi-session", "template_id": "tpl_multi", "pose_number": 2,
                    })
                    self.assertEqual(resp2.status_code, 200)
                    self.assertTrue(resp2.json()["completed"])
                    self.assertFalse(api_router.canon_cam.is_live_view_active)

            # Bắt đầu phiên chụp mới: mở lại live view
            api_router.canon_cam.start_live_view_thread()
            self.assertTrue(api_router.canon_cam.is_live_view_active)
            self.assertTrue(api_router.canon_cam.reopen_live_view)

    def test_cancel_session_removes_files_and_stops_live_view(self):
        with TestClient(app) as client:
            api_router.canon_cam.start_live_view_thread()
            self.assertTrue(api_router.canon_cam.is_live_view_active)

            session_id = "cancel-test-session"
            session_dir = api_router.SESSION_DIR / session_id
            session_dir.mkdir(parents=True, exist_ok=True)
            (session_dir / "pose_1.jpg").write_text("dummy")

            final_file = api_router.FINAL_IMAGES_DIR / f"{session_id}.jpg"
            final_file.parent.mkdir(parents=True, exist_ok=True)
            final_file.write_text("dummy")

            resp = client.post(f"/api/sessions/{session_id}/cancel")
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.json()["status"], "cancelled")

            self.assertFalse(api_router.canon_cam.is_live_view_active)
            self.assertFalse(session_dir.exists())
            self.assertFalse(final_file.exists())


if __name__ == "__main__":
    unittest.main()
