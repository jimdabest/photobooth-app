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


if __name__ == "__main__":
    unittest.main()
