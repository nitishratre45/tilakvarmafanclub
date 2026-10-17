#!/usr/bin/env python3
"""Regression tests for BCCI news article table extraction."""

from __future__ import annotations

import unittest

from scripts.news_content_formatter import blocks_for


class NewsTableFormattingTests(unittest.TestCase):
    def test_t20i_fixture_table_with_serial_number(self) -> None:
        blocks = blocks_for(
            "Squad announced. | No. | DAY | Date | Time | Match | Venue | "
            "1 | Sun | 27-Sep-26 | 7:00 PM | 1st T20I | Hyderabad | "
            "2 | Wed | 30-Sep-26 | 7:00 PM | 2nd T20I | Delhi"
        )
        tables = [block for block in blocks if block["type"] == "table"]
        self.assertEqual(len(tables), 1)
        self.assertEqual(
            tables[0]["rows"][0], ["No.", "DAY", "Date", "Time", "Match", "Venue"]
        )
        self.assertEqual(tables[0]["rows"][1][-2:], ["1st T20I", "Hyderabad"])
        self.assertEqual(len(tables[0]["rows"]), 3)

    def test_table_without_serial_number(self) -> None:
        blocks = blocks_for(
            "Fixtures: | Day | Date | Match | Venue | "
            "Saturday | 19-Oct-24 | India A vs Pakistan A | Oman Cricket Academy Ground, Muscat | "
            "Monday | 21-Oct-24 | India A vs UAE | Oman Cricket Academy Ground, Muscat"
        )
        tables = [block for block in blocks if block["type"] == "table"]
        self.assertEqual(len(tables), 1)
        self.assertEqual(len(tables[0]["rows"]), 3)
        self.assertEqual(tables[0]["rows"][1][2], "India A vs Pakistan A")

    def test_multi_day_fixture_table(self) -> None:
        blocks = blocks_for(
            "Schedule | No. | Day | Date | Day (to) | Date (to) | Match | Venue | "
            "1 | Sat | 24-Oct-26 | Tue | 27-Oct-26 | 1st Multi Day | Lincoln | "
            "2 | Sat | 31-Oct-26 | Tue | 03-Nov-26 | 2nd Multi Day | Christchurch"
        )
        tables = [block for block in blocks if block["type"] == "table"]
        self.assertEqual(len(tables), 1)
        self.assertEqual(len(tables[0]["rows"]), 3)
        self.assertEqual(tables[0]["rows"][1][5:], ["1st Multi Day", "Lincoln"])

    def test_multiple_tables_in_one_article(self) -> None:
        blocks = blocks_for(
            "Senior fixtures | No. | Day | Date | Match | Venue | "
            "1 | Thu | 22-Oct-26 | 1st T20I | Christchurch | "
            "2 | Sat | 24-Oct-26 | 2nd T20I | Christchurch | "
            "India A fixtures | No. | Day | Date | Day (to) | Date (to) | Match | Venue | "
            "1 | Sat | 24-Oct-26 | Tue | 27-Oct-26 | 1st Multi Day | Lincoln | "
            "2 | Sat | 31-Oct-26 | Tue | 03-Nov-26 | 2nd Multi Day | Christchurch"
        )
        tables = [block for block in blocks if block["type"] == "table"]
        self.assertEqual(len(tables), 2)
        self.assertEqual([len(table["rows"]) for table in tables], [3, 3])

    def test_rows_with_pipe_in_venue_keep_table_shape(self) -> None:
        blocks = blocks_for(
            "Fixtures: | No. | Day | Date | Match | Venue | "
            "1 | Sun | 27-Sep-26 | 1st T20I | Ground A | " 
            "2 | Wed | 30-Sep-26 | 2nd T20I | Ground B"
        )
        tables = [block for block in blocks if block["type"] == "table"]
        self.assertEqual(len(tables), 1)
        self.assertTrue(all(len(row) == len(tables[0]["rows"][0]) for row in tables[0]["rows"]))

    def test_prose_is_not_misclassified_as_a_table(self) -> None:
        blocks = blocks_for(
            "The selection committee announced the squad. "
            "Tilak Varma will join the team for the upcoming series."
        )
        self.assertFalse(any(block["type"] == "table" for block in blocks))


if __name__ == "__main__":
    unittest.main(verbosity=2)
