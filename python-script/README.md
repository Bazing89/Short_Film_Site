# Local yt-dlp → Bunny Stream queue

## Setup

1. Install [yt-dlp](https://github.com/yt-dlp/yt-dlp) (`brew install yt-dlp`)
2. Put your Bunny Stream library API key in the project root `.dev.vars`:

```bash
BUNNY_API_KEY=your_library_access_key
```

Library ID defaults to `700551`.  
Collection ID defaults to `98f0b8d8-336d-4ab9-9c2c-513c29815305` (override with `BUNNY_COLLECTION_ID`).

## Queue links

### Browser UI (actor search + paste)

```bash
cd "/path/to/Short_Film_Site"
python3 python-script/ui.py
```

Opens http://127.0.0.1:8765

1. Enter an **actor name** and search XVideos / XNXX / Pornhub / MyFPO (fpo.xxx)  
2. Select videos from the results list  
3. Choose one:
   - **Publish as links** — adds title + thumbnail to the site catalog; viewers hit an ad page then go to the source site (fast, no download)
   - **Queue for Bunny download** then **Start downloads** — hosts the video on Bunny (`Actor — video title`)
4. After publishing links, run `npm run build` / `npm run deploy` so `public/outbound-films.json` is live

You can still paste raw URLs under “Or paste URLs manually”.

### Edit queue file

Edit [`queue.txt`](queue.txt) — one URL per line:

```text
https://www.youtube.com/watch?v=RBmw0pLlgWI
https://example.com/video.mp4
```

Optional metadata (actor/title) is stored in `queue_meta.json` when you queue from search.

## Run CLI (downloads one-by-one, then uploads to Bunny)

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

### Speed tips

Downloads now:
- Prefer a single progressive MP4 (avoids slow video+audio merge)
- Pull HLS/DASH fragments in parallel (`YTDLP_FRAGMENTS`, default 8)
- Process multiple queue items at once (`DOWNLOAD_WORKERS`, default 3)

```powershell
$env:DOWNLOAD_WORKERS=4
$env:YTDLP_FRAGMENTS=12
python3 python-script/ui.py
```

Set `DOWNLOAD_WORKERS=1` if your network gets unstable with parallel downloads.

## Output

| File | Purpose |
|------|---------|
| `downloads/` | Temporary local mp4s (deleted automatically after successful Bunny upload) |
| `done.txt` | Successful uploads (timestamp, video id, embed URL, source) |
| `failed.txt` | Failed URLs + error |
| `queue.txt` | Remaining URLs (successful/failed items are removed when using the queue file) |

Copy the embed URL from `done.txt` into `src/data/films.ts` when you want it on the site.
