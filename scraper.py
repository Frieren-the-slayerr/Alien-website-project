"""Collect public UFO, UAP, and alien-related records from permitted APIs.

This program saves source metadata and can download publicly linked images. It
never bypasses authentication, robots rules, paywalls, deletions, or access
controls. Search results are leads for research, not proof of their claims.
"""

from __future__ import annotations

import argparse
import json
import logging
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import quote

import requests

LOGGER = logging.getLogger(__name__)
DEFAULT_QUERY = "alien OR UFO OR UAP"
DEFAULT_TIMEOUT_SECONDS = 20
DEFAULT_USER_AGENT = "PublicUAPResearchCollector/0.1"
MAX_IMAGE_BYTES = 10 * 1024 * 1024
IMAGE_EXTENSIONS = {".gif", ".jpeg", ".jpg", ".png", ".webp", ".tif", ".tiff"}
ALIEN_FILM_MARKERS = (
    "alien 3",
    "alien-3",
    "alien³",
    "alien queen",
    "alien-queen",
    "alien franchise",
    "franquicia alien",
    "weyland-yutani",
    "xenomorph",
    "nostromo",
    "lv-426",
)


@dataclass(frozen=True)
class Record:
    """A normalized result from a public source."""

    source: str
    title: str
    url: str
    published_at: str | None = None
    author: str | None = None
    description: str | None = None
    identifier: str | None = None
    image_urls: tuple[str, ...] = ()


class PublicSourceClient:
    """Perform bounded requests using a shared HTTP session."""

    def __init__(self, timeout: int = DEFAULT_TIMEOUT_SECONDS) -> None:
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": DEFAULT_USER_AGENT})
        self.timeout = timeout

    def get_json(self, url: str, params: dict[str, Any]) -> dict[str, Any]:
        """Fetch and validate a JSON object from a public endpoint."""
        try:
            response = self.session.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()
            payload = response.json()
        except requests.RequestException as error:
            status = getattr(error.response, "status_code", "unknown")
            raise RuntimeError(f"Request failed for {url} (HTTP {status})") from error
        except ValueError as error:
            raise RuntimeError(f"Invalid JSON returned by {url}") from error
        if not isinstance(payload, dict):
            raise RuntimeError(f"Unexpected JSON payload from {url}")
        return payload

    def download_image(self, url: str, destination: Path) -> bool:
        """Download one public image, enforcing a 10 MB maximum."""
        try:
            with self.session.get(url, stream=True, timeout=self.timeout) as response:
                response.raise_for_status()
                length = response.headers.get("Content-Length")
                if length and int(length) > MAX_IMAGE_BYTES:
                    LOGGER.warning("Skipping image larger than 10 MB: %s", url)
                    return False
                destination.parent.mkdir(parents=True, exist_ok=True)
                written = 0
                with destination.open("wb") as output:
                    for chunk in response.iter_content(chunk_size=64 * 1024):
                        written += len(chunk)
                        if written > MAX_IMAGE_BYTES:
                            destination.unlink(missing_ok=True)
                            LOGGER.warning("Skipping streamed image larger than 10 MB: %s", url)
                            return False
                        output.write(chunk)
        except (OSError, ValueError, requests.RequestException) as error:
            destination.unlink(missing_ok=True)
            LOGGER.warning("Could not download %s: %s", url, error)
            return False
        return True


def as_text(value: Any) -> str | None:
    """Convert source values, including list-valued fields, to text."""
    if value is None:
        return None
    if isinstance(value, list):
        return ", ".join(str(item) for item in value)
    text = str(value).strip()
    return text or None


def search_internet_archive(client: PublicSourceClient, query: str, limit: int) -> list[Record]:
    """Search public Internet Archive text and image records."""
    payload = client.get_json(
        "https://archive.org/advancedsearch.php",
        {
            "q": f"({query}) AND mediatype:(texts OR image)",
            "fl[]": ["identifier", "title", "description", "creator", "date"],
            "rows": limit,
            "page": 1,
            "output": "json",
        },
    )
    documents = payload.get("response", {}).get("docs", [])
    records: list[Record] = []
    for document in documents:
        if not isinstance(document, dict) or not document.get("identifier"):
            continue
        identifier = str(document["identifier"])
        records.append(
            Record(
                source="internet_archive",
                title=as_text(document.get("title")) or identifier,
                url=f"https://archive.org/details/{quote(identifier)}",
                published_at=as_text(document.get("date")),
                author=as_text(document.get("creator")),
                description=as_text(document.get("description")),
                identifier=identifier,
            )
        )
    return records


def add_archive_images(client: PublicSourceClient, record: Record) -> Record:
    """Add public image-file URLs listed in an Internet Archive item."""
    if record.source != "internet_archive" or not record.identifier:
        return record
    metadata = client.get_json(f"https://archive.org/metadata/{quote(record.identifier)}", {})
    image_urls: list[str] = []
    for file_info in metadata.get("files", []):
        if not isinstance(file_info, dict):
            continue
        name = as_text(file_info.get("name"))
        if name and Path(name).suffix.lower() in IMAGE_EXTENSIONS:
            image_urls.append(
                f"https://archive.org/download/{quote(record.identifier)}/{quote(name)}"
            )
    return Record(**{**asdict(record), "image_urls": tuple(image_urls)})


def safe_filename(url: str, index: int) -> str:
    """Create a stable local image name without trusting URL path characters."""
    name = re.sub(r"[^A-Za-z0-9._-]", "_", Path(url.split("?", 1)[0]).name)
    return name if Path(name).suffix.lower() in IMAGE_EXTENSIONS else f"image_{index}.jpg"


def is_alien_film_record(record: Record) -> bool:
    """Return whether a record clearly refers to the Alien film franchise."""
    searchable_text = " ".join(
        value.lower()
        for value in (
            record.title,
            record.url,
            record.author,
            record.description,
            record.identifier,
            *record.image_urls,
        )
        if value
    )
    return any(marker in searchable_text for marker in ALIEN_FILM_MARKERS)


def collect_records(
    client: PublicSourceClient,
    query: str,
    sources: Iterable[str],
    limit: int,
    download_images: bool,
    output_dir: Path,
) -> list[Record]:
    """Collect, enrich, optionally download, and deduplicate records."""
    records: list[Record] = []
    source_errors: list[str] = []
    for source in sources:
        try:
            if source == "archive":
                records.extend(search_internet_archive(client, query, limit))
            else:
                raise ValueError(f"Unsupported source: {source}")
        except RuntimeError as error:
            source_errors.append(f"{source}: {error}")
            LOGGER.warning("Skipping unavailable source %s: %s", source, error)

    result: list[Record] = []
    seen_urls: set[str] = set()
    for record in records:
        if record.url in seen_urls:
            continue
        seen_urls.add(record.url)
        if record.source == "internet_archive":
            try:
                record = add_archive_images(client, record)
            except RuntimeError as error:
                LOGGER.warning("Could not enrich archive record %s: %s", record.url, error)
        if is_alien_film_record(record):
            LOGGER.info("Skipping Alien film-franchise record: %s", record.title)
            continue
        if download_images:
            local_images: list[str] = []
            for index, image_url in enumerate(record.image_urls, start=1):
                destination = output_dir / "images" / (record.identifier or "unknown") / safe_filename(image_url, index)
                if client.download_image(image_url, destination):
                    local_images.append(str(destination))
            record = Record(**{**asdict(record), "image_urls": tuple(local_images)})
        result.append(record)
    if not result and source_errors:
        raise RuntimeError("No records were collected. " + " | ".join(source_errors))
    return result


def save_records(records: Iterable[Record], output_file: Path) -> None:
    """Write records as UTF-8 JSON for later review or indexing."""
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(
        json.dumps([asdict(record) for record in records], indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def build_parser() -> argparse.ArgumentParser:
    """Build the command-line interface."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--query", default=DEFAULT_QUERY)
    parser.add_argument("--source", choices=("archive",), action="append", dest="sources")
    parser.add_argument("--limit", type=int, default=25)
    parser.add_argument("--output", type=Path, default=Path("data/records.json"))
    parser.add_argument("--download-images", action="store_true")
    return parser


def main() -> int:
    """Run the collector and return its process exit code."""
    parser = build_parser()
    arguments = parser.parse_args()
    if arguments.limit < 1 or arguments.limit > 100:
        parser.error("--limit must be between 1 and 100")
    try:
        records = collect_records(
            PublicSourceClient(),
            arguments.query,
            arguments.sources or ["archive"],
            arguments.limit,
            arguments.download_images,
            arguments.output.parent,
        )
        save_records(records, arguments.output)
    except (RuntimeError, ValueError) as error:
        LOGGER.error("Collection failed: %s", error)
        return 1
    print(f"Saved {len(records)} records to {arguments.output}")
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    raise SystemExit(main())
