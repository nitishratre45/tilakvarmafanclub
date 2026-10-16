#!/usr/bin/env python3
"""Fetch the supplied BCCI fixtures query and save a separate raw JSON snapshot."""
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "bcci-fixtures-test" / "bcci-custom-fixtures.json"
SOURCE_URL = "https://stats.bcci.tv/match/fixtures/?comp_gid=65d2b784-4a75-41ca-8415-a345042030d6&comp_gid=11ba38c8-30d4-438c-8214-0d5ffdc0d9ca&comp_gid=8e82842f-2c4d-4bd5-8712-5c342fa0ac52&comp_gid=23a35541-7b2d-4caf-a215-9cf07da68259&comp_gid=be3673dc-4020-4db0-81f3-2833432f9de3&comp_gid=34154bc1-ebbf-4109-ba78-67cf9cf7aafa&comp_gid=47f70a25-00df-4792-9650-3e2c3642a27b&comp_gid=6a64053e-55fc-47ed-9cae-4c58e9b0e551&comp_gid=9a12946b-9277-4b5f-ba94-34d02355bf03&comp_gid=2fb13b04-0824-4466-9dca-a8558081ca9c&comp_gid=2c9a58d0-365c-4301-839e-b1d2a0803b2b&comp_gid=b0267a1c-8b9b-4e75-b98f-65d37d080565&comp_gid=dafec7a6-ae05-48a1-abf0-3e946f60a856&comp_gid=04d7f468-3b06-4dcc-88de-594afd83c561&comp_gid=d2f2e609-1d15-4630-ba86-c004c4b6ded7&comp_gid=52f44249-0afd-41aa-bb88-c6e7778a4f0d&comp_gid=97b4c72d-a7dd-42f7-9d4c-e2412d7dbae2&comp_gid=5cd3ede8-16d7-4914-9d4c-2eb59671fe50&comp_gid=db99461c-27d2-46ef-8f47-a0eb1d3e1d26&comp_gid=39a2078a-2e87-4f90-86eb-53696579466c&comp_gid=7ca2538b-b8e8-4221-b76f-4705cb75af1f&comp_gid=a88f96d1-b5ab-4327-82bf-6c89e4ae7b1b&comp_gid=aa9d383e-5b90-41d1-80e2-2a75c8e4359d&comp_gid=d5ad0d62-3c4e-44e3-bd52-80721d1edeac&comp_gid=12616d71-d30e-4c6c-b669-8850c160ad8d&comp_gid=ad6326a1-59dd-4e36-8eeb-36b0c0b09bbc&comp_gid=15a5482f-d85a-4cf8-b1bf-aae83716cf2b&comp_gid=b4d4040d-4631-4f31-b224-e9aa54b40797&comp_gid=ad9bff8b-d68e-4c5e-a92d-72b6705134b2&comp_gid=13de0d47-83d7-4351-8e6a-57d28a18be48&comp_gid=1cf7ed18-0c14-452c-840b-447aeb5dd020&comp_gid=96f00b0b-c06b-4764-bbc3-7ed388abb24b&comp_gid=dd82f86a-6aa4-477c-b0de-2706a677d0d2&min_start_date=2026-01-01&team_gid=71790c66-0e3c-4d0b-96a5-e04526040f94&team_gid=cf9ec6b2-8d90-41a9-a834-f2f120b37811&team_gid=83151b98-bbed-42ba-b397-944059ef5830&team_gid=0f99bbe0-3198-4f82-8520-e18a9e24545f&team_gid=f04b25a0-9d2b-4ee9-b7da-1aba80b24ae8&team_gid=4eb0e97b-6e43-47f3-8e46-bedf6de77cea&team_gid=611a0e16-280f-4fe2-98e8-366ba9719962&team_gid=01d41b53-68f6-48f8-a8d0-c9ec2f338749&team_gid=eb81d735-6436-4dac-9a7a-15a7a347d5e6&team_gid=08dc4ba8-22a1-4e5a-9862-20f8a8643f99&page=1&size=12"
TIMEOUT = 30
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; TilakVarmaFanClubFixtureTest/1.0)",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.bcci.tv/",
}


def with_page(url, page):
    parts = urlsplit(url)
    pairs = [
        (k, str(page) if k == "page" else v)
        for k, v in parse_qsl(parts.query, keep_blank_values=True)
    ]
    return urlunsplit(
        (
            parts.scheme,
            parts.netloc,
            parts.path,
            urlencode(pairs, doseq=True),
            parts.fragment,
        )
    )


def fetch(url):
    req = Request(url, headers=HEADERS)
    with urlopen(req, timeout=TIMEOUT) as response:
        if response.status != 200:
            raise RuntimeError(f"BCCI returned HTTP {response.status}")
        raw = response.read()
        return json.loads(raw.decode("utf-8-sig")), len(raw), response.status


def main():
    try:
        first, first_bytes, status = fetch(with_page(SOURCE_URL, 1))
        page_info = first.get("page", {}) if isinstance(first, dict) else {}
        try:
            last_page = int(page_info.get("last_page") or 1)
        except (TypeError, ValueError):
            last_page = 1
        if not 1 <= last_page <= 100:
            raise ValueError(f"Unexpected last_page={last_page}")
        pages = [first]
        total_bytes = first_bytes
        for page in range(2, last_page + 1):
            payload, byte_count, _ = fetch(with_page(SOURCE_URL, page))
            pages.append(payload)
            total_bytes += byte_count
        # Keep every original BCCI response intact, page by page, for analysis.
        report = {
            "source": SOURCE_URL,
            "checkedAt": datetime.now(timezone.utc).isoformat(),
            "status": "updated-from-bcci-custom-fixtures",
            "httpStatus": status,
            "responseBytes": total_bytes,
            "pagesFetched": len(pages),
            "pagination": page_info,
            "recordCount": sum(
                (
                    len(p.get("match", []))
                    if isinstance(p, dict) and isinstance(p.get("match"), list)
                    else (
                        len(p.get("data", []))
                        if isinstance(p, dict) and isinstance(p.get("data"), list)
                        else 0
                    )
                )
                for p in pages
            ),
            "pages": pages,
            "note": "Separate raw snapshot from the supplied fixtures URL; production bcci-stats-fixtures.json is not modified.",
        }
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        temp = None
        try:
            with tempfile.NamedTemporaryFile(
                "w",
                encoding="utf-8",
                dir=OUTPUT.parent,
                prefix=".bcci-custom-fixtures.",
                suffix=".tmp",
                delete=False,
            ) as f:
                temp = Path(f.name)
                json.dump(report, f, ensure_ascii=False, indent=2)
                f.write("\n")
                f.flush()
                os.fsync(f.fileno())
            parsed = json.loads(temp.read_text(encoding="utf-8"))
            if parsed.get(
                "status"
            ) != "updated-from-bcci-custom-fixtures" or not parsed.get("pages"):
                raise ValueError("snapshot validation failed")
            os.replace(temp, OUTPUT)
            temp = None
        finally:
            if temp:
                temp.unlink(missing_ok=True)
        print(
            json.dumps(
                {
                    k: report[k]
                    for k in (
                        "status",
                        "httpStatus",
                        "responseBytes",
                        "pagesFetched",
                        "recordCount",
                        "pagination",
                    )
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        print(f"Saved raw BCCI fixture response to {OUTPUT.relative_to(ROOT)}")
        return 0
    except (
        HTTPError,
        URLError,
        TimeoutError,
        OSError,
        ValueError,
        RuntimeError,
        json.JSONDecodeError,
    ) as exc:
        print(f"ERROR: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
