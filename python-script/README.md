# Local yt-dlp → Bunny Stream queue

## Setup

1. Install [yt-dlp](https://github.com/yt-dlp/yt-dlp) (`brew install yt-dlp`)
2. Put your Bunny Stream library API key in the project root `.dev.vars`:

```bash
BUNNY_API_KEY=your_library_access_key
```

Library ID defaults to `700551`.

## Queue links

Edit [`queue.txt`](queue.txt) — one URL per line:

```text
https://www.youtube.com/watch?v=RBmw0pLlgWI
https://example.com/video.mp4
```

## Run (downloads one-by-one, then uploads to Bunny)

```bash
cd "/path/to/Short_Film_Site"
python3 python-script/download_to_bunny.py
```

Or paste URLs interactively:

```bash
python3 python-script/download_to_bunny.py --interactive
```

Or pass URLs on the command line:

```bash
python3 python-script/download_to_bunny.py "https://www.youtube.com/watch?v=RBmw0pLlgWI"
```

Upload a file already in `downloads/` (no re-download):

```bash
python3 python-script/download_to_bunny.py --upload-existing
```

Large files are streamed with `curl --data-binary` (not loaded fully into memory).

## Output

| File | Purpose |
|------|---------|
| `downloads/` | Temporary local mp4s (deleted automatically after successful Bunny upload) |
| `done.txt` | Successful uploads (timestamp, video id, embed URL, source) |
| `failed.txt` | Failed URLs + error |
| `queue.txt` | Remaining URLs (successful/failed items are removed when using the queue file) |

Copy the embed URL from `done.txt` into `src/data/films.ts` when you want it on the site.
