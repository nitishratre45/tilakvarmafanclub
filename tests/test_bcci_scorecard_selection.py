import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "bcci-fixtures-test" / "fetch_bcci_scorecard.py"
SPEC = importlib.util.spec_from_file_location("fetch_bcci_scorecard", SCRIPT)
FETCHER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(FETCHER)


class ChooseLiveMatchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.fixtures = self.root / "bcci-fixtures.json"
        self.live = self.root / "live-matches.json"

    def write_json(self, path, payload):
        path.write_text(json.dumps(payload), encoding="utf-8")

    def call_choose_match(self):
        with patch.object(FETCHER, "FIXTURES_FILE", self.fixtures), patch.object(
            FETCHER, "LIVE_FILE", self.live
        ):
            return FETCHER.choose_match()

    def test_live_snapshot_resolves_uuid_to_numeric_bcci_match_id(self):
        self.write_json(self.fixtures, {"data": {"match": [
            {"gid": "gid-live", "match_id": "242108", "match_status": "forthcoming"}
        ]}})
        self.write_json(self.live, {"status": "updated-from-bcci-live-scores", "matches": [
            {"id": "gid-live", "status": "In Play", "raw": {
                "gid": "gid-live", "name": "India v New Zealand", "match_status": "live"
            }}
        ]})
        match_id, match, is_live = self.call_choose_match()
        self.assertEqual(match_id, "242108")
        self.assertEqual(match["name"], "India v New Zealand")
        self.assertTrue(is_live)

    def test_valid_empty_live_snapshot_does_not_select_stale_upcoming_fixture(self):
        self.write_json(self.fixtures, {"data": {"match": [
            {"gid": "gid-future", "match_id": "242109", "match_status": "forthcoming"}
        ]}})
        self.write_json(self.live, {"status": "updated-from-bcci-live-scores", "matches": []})
        self.assertIsNone(self.call_choose_match())

    def test_legacy_fixture_fallback_selects_numeric_live_match(self):
        self.write_json(self.fixtures, {"data": {"match": [
            {"gid": "gid-live", "match_id": "242108", "match_status": "live"}
        ]}})
        match_id, match, is_live = self.call_choose_match()
        self.assertEqual(match_id, "242108")
        self.assertEqual(match["gid"], "gid-live")
        self.assertTrue(is_live)


if __name__ == "__main__":
    unittest.main()
