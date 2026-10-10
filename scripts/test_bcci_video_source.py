#!/usr/bin/env python3
"""Regression tests for the Admin-configured BCCI video source parser."""
import json
import unittest

import refresh_bcci_videos as videos
import refresh_statsguru as statsguru


class CustomResponseTests(unittest.TestCase):
    def test_json_api_response_remains_supported(self):
        payload = {"data": {"videos": [{"title": "Tilak Varma highlights"}]}}
        result = videos.parse_custom_response(
            json.dumps(payload).encode("utf-8"), "application/json"
        )
        self.assertEqual(result, payload)

    def test_html_page_extracts_json_ld_payload(self):
        payload = {
            "title": "Tilak Varma interview",
            "playbackUrl": "https://cdn.example.test/tilak-interview.m3u8",
        }
        page = (
            '<!doctype html><html><head><script type="application/ld+json">'
            + json.dumps(payload)
            + "</script></head><body></body></html>"
        )
        result = videos.parse_custom_response(page.encode("utf-8"), "text/html")
        self.assertEqual(result["embeddedPayloads"], [payload])
        items = list(videos.walk_video_objects(result))
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["title"], "Tilak Varma interview")

    def test_html_page_extracts_framework_bootstrap_json(self):
        payload = {"props": {"pageProps": {"videos": [{"title": "Tilak Varma"}]}}}
        page = (
            "<html><script>"
            "window.__INITIAL_STATE__ = "
            + json.dumps(payload)
            + ";</script></html>"
        )
        result = videos.parse_custom_response(page.encode("utf-8"), "text/html")
        self.assertEqual(result["embeddedPayloads"], [payload])

    def test_html_without_embedded_json_fails_clearly(self):
        with self.assertRaisesRegex(ValueError, "no readable JSON video payload"):
            videos.parse_custom_response(
                b"<html><body>Loading content</body></html>", "text/html"
            )

    def test_non_json_non_html_response_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "neither valid JSON nor an HTML page"):
            videos.parse_custom_response(b"upstream error", "text/plain")

    def test_saved_domestic_summary_fallback_preserves_source_and_no_fake_innings(self):
        data = {
            "careerFormats": {
                "First-class": {
                    "matches": 25,
                    "innings": 42,
                    "runs": 1828,
                    "highestScore": "121",
                    "average": 44.58,
                    "source": "NDTV career statistics",
                    "updatedAt": "2026-09-01",
                }
            },
            "statsguru": {"formats": {"FC": {"innings": []}}},
        }
        result = statsguru.saved_domestic_summary("FC", data)
        self.assertIsNotNone(result)
        self.assertEqual(result["summary"]["runs"], 1828)
        self.assertEqual(result["summary"]["highestScore"], "121")
        self.assertEqual(result["source"], "NDTV career statistics")
        self.assertEqual(result["summaryUpdatedAt"], "2026-09-01")
        self.assertEqual(result["innings"], [])
        self.assertEqual(result["detailStatus"], "summary-only")

    def test_missing_saved_domestic_summary_stays_optional(self):
        self.assertIsNone(statsguru.saved_domestic_summary("List A", {"careerFormats": {}}))


if __name__ == "__main__":
    unittest.main(verbosity=2)
