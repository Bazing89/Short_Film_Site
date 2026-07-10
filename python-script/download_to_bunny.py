#!/usr/bin/env python3
"""
Queue video URLs → download one-by-one with yt-dlp → upload to Bunny Stream.

1. Add links to queue.txt (one URL per line)
2. Run:  python3 download_to_bunny.py
3. Finished URLs move to done.txt; failures go to failed.txt

Optional:
  python3 download_to_bunny.py "https://example.com/watch?v=..."
  python3 download_to_bunny.py --interactive   # type URLs, blank line to start
  python3 download_to_bunny.py --upload-existing  # upload files already in downloads/
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DEV_VARS = ROOT / ".dev.vars"
QUEUE_FILE = HERE / "queue.txt"
DONE_FILE = HERE / "done.txt"
FAILED_FILE = HERE / "failed.txt"
DOWNLOAD_DIR = HERE / "downloads"
LIBRARY_ID = os.environ.get("BUNNY_LIBRARY_ID", "700551")


def load_dev_vars() -> dict[str, str]:
    values: dict[str, str] = {}
    if not DEV_VARS.exists():
        return values
    for line in DEV_VARS.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def read_url_list(path: Path) -> list[str]:
    if not path.exists():
        return []
    urls: list[str] = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            urls.append(line)
    return urls


def write_url_list(path: Path, urls: list[str], header: str) -> None:
    body = "\n".join(urls)
    path.write_text(f"{header}\n{body}\n" if body else f"{header}\n")


def append_line(path: Path, line: str) -> None:
    with path.open("a", encoding="utf-8") as handle:
        handle.write(line.rstrip() + "\n")


def bunny_request(
    method: str,
    path: str,
    api_key: str,
    data: bytes | None = None,
    content_type: str | None = None,
) -> dict:
    url = f"https://video.bunnycdn.com{path}"
    headers = {
        "AccessKey": api_key,
        "Accept": "application/json",
    }
    if content_type:
        headers["Content-Type"] = content_type
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as res:
            body = res.read().decode("utf-8")
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Bunny API {err.code}: {detail}") from err


def download_with_ytdlp(source_url: str) -> Path:
    DOWNLOAD_DIR.mkdir(exist_ok=True)
    out_template = str(DOWNLOAD_DIR / "%(title)s [%(id)s].%(ext)s")
    before = {p.resolve() for p in DOWNLOAD_DIR.glob("*") if p.is_file()}

    cmd = [
        "yt-dlp",
        "-f",
        "bv*+ba/b",
        "--merge-output-format",
        "mp4",
        "-o",
        out_template,
        "--no-overwrites",
        "--print",
        "after_move:filepath",
        "--print",
        "filepath",
        source_url,
    ]
    print(f"  yt-dlp downloading…")
    result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "yt-dlp failed")

    printed = [
        line.strip()
        for line in (result.stdout or "").splitlines()
        if line.strip() and not line.startswith("[")
    ]
    for candidate in reversed(printed):
        path = Path(candidate)
        if path.is_file():
            return path

    after = {p.resolve() for p in DOWNLOAD_DIR.glob("*") if p.is_file()}
    new_files = sorted(after - before, key=lambda p: p.stat().st_mtime, reverse=True)
    mp4s = [p for p in new_files if p.suffix.lower() == ".mp4"]
    if mp4s:
        return mp4s[0]
    if new_files:
        return new_files[0]
    raise RuntimeError("Download finished but no output file was found")


def upload_file_binary(file_path: Path, video_id: str, api_key: str) -> None:
    """Stream raw bytes to Bunny (curl --data-binary). Avoids loading the whole file into RAM
    and avoids urllib's default form Content-Type that breaks large uploads.
    """
    url = f"https://video.bunnycdn.com/library/{LIBRARY_ID}/videos/{video_id}"
    cmd = [
        "curl",
        "-sS",
        "-X",
        "PUT",
        url,
        "-H",
        f"AccessKey: {api_key}",
        "-H",
        "Accept: application/json",
        "-H",
        "Content-Type: application/octet-stream",
        "--data-binary",
        f"@{file_path}",
        "--fail-with-body",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "curl upload failed").strip()
        raise RuntimeError(detail)
    body = (result.stdout or "").strip()
    if body:
        try:
            payload = json.loads(body)
            if payload.get("success") is False:
                raise RuntimeError(body)
        except json.JSONDecodeError:
            pass


def upload_to_bunny(file_path: Path, api_key: str) -> dict:
    title = file_path.stem
    print(f"  Creating Bunny video: {title}")
    created = bunny_request(
        "POST",
        f"/library/{LIBRARY_ID}/videos",
        api_key,
        data=json.dumps({"title": title}).encode("utf-8"),
        content_type="application/json",
    )
    video_id = created.get("guid")
    if not video_id:
        raise RuntimeError(f"No video guid returned: {created}")

    size_mb = file_path.stat().st_size / (1024 * 1024)
    print(f"  Uploading {file_path.name} ({size_mb:.1f} MB, streaming)…")
    upload_file_binary(file_path, video_id, api_key)

    embed = f"https://player.mediadelivery.net/embed/{LIBRARY_ID}/{video_id}"
    return {
        "title": title,
        "videoId": video_id,
        "embedUrl": embed,
        "file": str(file_path),
    }


def mark_success(url_or_label: str, result: dict, file_path: Path) -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    append_line(
        DONE_FILE,
        f"{stamp}\t{result['videoId']}\t{result['embedUrl']}\t{url_or_label}",
    )
    try:
        file_path.unlink(missing_ok=True)
        print(f"  Deleted local file: {file_path.name}")
    except OSError as cleanup_err:
        print(f"  Warning: could not delete local file ({cleanup_err})")
    print("  OK")
    print(f"  video id:  {result['videoId']}")
    print(f"  embed url: {result['embedUrl']}\n")


def upload_existing_downloads(api_key: str) -> int:
    DOWNLOAD_DIR.mkdir(exist_ok=True)
    files = sorted(
        [
            p
            for p in DOWNLOAD_DIR.iterdir()
            if p.is_file() and p.suffix.lower() in {".mp4", ".mov", ".mkv", ".webm"}
        ]
    )
    if not files:
        print("No local videos found in python-script/downloads/")
        return 1

    print(f"Bunny library: {LIBRARY_ID}")
    print(f"Uploading {len(files)} existing file(s)\n")
    failed = 0
    for i, file_path in enumerate(files, 1):
        print(f"=== [{i}/{len(files)}] {file_path.name}")
        try:
            result = upload_to_bunny(file_path, api_key)
            mark_success(f"local:{file_path.name}", result, file_path)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            append_line(FAILED_FILE, f"local:{file_path.name}\t{exc}")
            print(f"  Kept local file after failure: {file_path.name}")
            print(f"  FAILED: {exc}\n")

    if failed:
        print(f"Finished with {failed} failure(s). See failed.txt")
        return 1
    print("All uploads finished.")
    return 0


def interactive_urls() -> list[str]:
    print("Paste URLs (one per line). Empty line starts the queue.\n")
    urls: list[str] = []
    while True:
        try:
            line = input("> ").strip()
        except EOFError:
            break
        if not line:
            break
        if line.startswith("#"):
            continue
        urls.append(line)
    return urls


def process_queue(urls: list[str], api_key: str, from_queue_file: bool) -> int:
    if not urls:
        print("Queue is empty. Add URLs to python-script/queue.txt and run again.")
        return 1

    remaining = list(urls)
    print(f"Bunny library: {LIBRARY_ID}")
    print(f"Queued: {len(remaining)} video(s)\n")

    failed = 0
    for i, url in enumerate(list(remaining), 1):
        print(f"=== [{i}/{len(urls)}] {url}")
        file_path: Path | None = None
        try:
            file_path = download_with_ytdlp(url)
            result = upload_to_bunny(file_path, api_key)
            mark_success(url, result, file_path)
            remaining.remove(url)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            append_line(FAILED_FILE, f"{url}\t{exc}")
            # Keep failed downloads so you can retry/upload manually
            if file_path and file_path.exists():
                print(f"  Kept local file after failure: {file_path.name}")
            print(f"  FAILED: {exc}\n")
            remaining.remove(url)

        if from_queue_file:
            write_url_list(
                QUEUE_FILE,
                remaining,
                "# One URL per line. Processed URLs are removed and logged in done.txt",
            )

    if failed:
        print(f"Finished with {failed} failure(s). See failed.txt")
        return 1
    print("All uploads finished.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Download queued videos with yt-dlp and upload to Bunny Stream"
    )
    parser.add_argument(
        "urls",
        nargs="*",
        help="Optional URLs (otherwise uses queue.txt)",
    )
    parser.add_argument(
        "-i",
        "--interactive",
        action="store_true",
        help="Type/paste URLs interactively, then process",
    )
    parser.add_argument(
        "--upload-existing",
        action="store_true",
        help="Upload videos already in python-script/downloads/ (skip yt-dlp)",
    )
    args = parser.parse_args()

    env = load_dev_vars()
    api_key = os.environ.get("BUNNY_API_KEY") or env.get("BUNNY_API_KEY", "")
    if not api_key or api_key == "paste_your_bunny_stream_library_api_key_here":
        print("Set BUNNY_API_KEY in the project .dev.vars file first.")
        return 1

    if args.upload_existing:
        return upload_existing_downloads(api_key)

    from_queue_file = False
    if args.interactive:
        urls = interactive_urls()
    elif args.urls:
        urls = []
        for arg in args.urls:
            path = Path(arg)
            if path.is_file():
                urls.extend(read_url_list(path))
            else:
                urls.append(arg)
    else:
        if not QUEUE_FILE.exists():
            write_url_list(
                QUEUE_FILE,
                [],
                "# One URL per line. Processed URLs are removed and logged in done.txt",
            )
        urls = read_url_list(QUEUE_FILE)
        from_queue_file = True

    return process_queue(urls, api_key, from_queue_file=from_queue_file)


if __name__ == "__main__":
    raise SystemExit(main())
