"""Offline tests for the public-source collector."""

import json
import tempfile
import unittest
from pathlib import Path

from scraper import (
    Record,
    add_archive_images,
    as_text,
    safe_filename,
    save_records,
    is_alien_film_record,
)


class FakeClient:
    """Return fixed archive metadata without making a network request."""

    def get_json(self, url: str, params: dict[str, object]) -> dict[str, object]:
        return {
            "files": [
                {"name": "scan.jpg"},
                {"name": "report.pdf"},
                {"name": "frame.PNG"},
            ]
        }


class ScraperTests(unittest.TestCase):
    """Verify deterministic collector helpers without network access."""

    def test_as_text_handles_lists_and_empty_values(self) -> None:
        self.assertEqual(as_text(["UFO", "UAP"]), "UFO, UAP")
        self.assertIsNone(as_text("   "))
        self.assertIsNone(as_text(None))

    def test_archive_images_filters_non_images(self) -> None:
        record = Record(
            source="internet_archive",
            title="Public item",
            url="https://archive.org/details/example",
            identifier="example",
        )
        enriched = add_archive_images(FakeClient(), record)
        self.assertEqual(len(enriched.image_urls), 2)
        self.assertTrue(enriched.image_urls[0].endswith("scan.jpg"))

    def test_safe_filename_removes_untrusted_path_characters(self) -> None:
        self.assertEqual(safe_filename("https://example.test/a b.jpg?download=1", 1), "a_b.jpg")
        self.assertEqual(safe_filename("https://example.test/no-extension", 2), "image_2.jpg")

    def test_alien_film_filter_removes_franchise_records_only(self) -> None:
        film_record = Record(source="test", title="LJN Alien 3", url="https://example.test/3")
        artwork_record = Record(
            source="test",
            title="Public image collection",
            url="https://example.test/images",
            image_urls=("https://example.test/alien-queen.jpg",),
        )
        research_record = Record(source="test", title="Alien life research", url="https://example.test/uap")
        self.assertTrue(is_alien_film_record(film_record))
        self.assertTrue(is_alien_film_record(artwork_record))
        self.assertFalse(is_alien_film_record(research_record))

    def test_save_records_writes_json(self) -> None:
        record = Record(source="test", title="Public lead", url="https://example.test/item")
        with tempfile.TemporaryDirectory() as temporary_directory:
            output_file = Path(temporary_directory) / "nested" / "records.json"
            save_records([record], output_file)
            saved = json.loads(output_file.read_text(encoding="utf-8"))
        self.assertEqual(saved[0]["title"], "Public lead")
        self.assertEqual(saved[0]["image_urls"], [])


if __name__ == "__main__":
    unittest.main()
