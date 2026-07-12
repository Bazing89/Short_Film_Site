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

1. Enter an **actor name** and search XVideos / XNXX / Pornhub / MyFPO (fpo.xxx) / Eporner — the actor is auto-pushed to the site **Models** page when videos are found  
2. Select videos from the results list  
3. Choose one:
   - **Publish as links** — adds title + thumbnail to the site catalog; viewers hit an ad page then go to the source site (fast, no download)
   - **Queue for Bunny download** then **Start downloads** — hosts the video on Bunny (`Actor — video title`)
4. Or use **Sync new** / **Import all** from FPO / Playvids:
   - **Sync new** — pulls only the newest pages and stops when everything is already on your site (use this daily)
   - **Import all** — deep crawl for a one-time backfill (set max pages high)
5. **Import models** — paste a `/models` listing URL (e.g. `https://www.fpo.xxx/models/`) to import performer profiles into `models.json` for the site **Models** page. Re-imports skip duplicates by profile URL, slug, and name.
6. For **live updates without rebuild**, bind Cloudflare KV as `OUTBOUND` (see below) and set `SITE_URL` in `.dev.vars`

### Hands-off auto sync (recommended)

FPO/Playvids don’t push updates to you — you poll their “newest” listings on a schedule. Dedupe skips anything already posted.

Run once to test:

```bash
python3 python-script/download_to_bunny.py --sync-new --pages 5
```

**Windows Task Scheduler** (every 6 hours):

1. Action: `python3`  
2. Arguments: `"C:\path\to\Short_Film_Site\python-script\download_to_bunny.py" --sync-new --pages 5`  
3. Start in: `C:\path\to\Short_Film_Site`  
4. Ensure you’re logged into Wrangler once (`npx wrangler login`) so KV sync works unattended

Only new titles get added; already-imported links are skipped automatically.

### Live outbound catalog (no rebuild)

Bunny Stream is video hosting, not a general database. Outbound links are stored in **Cloudflare KV** on your Worker:

1. Cloudflare Dashboard → **Storage & Databases → KV** → Create namespace  
2. Open your Worker → **Settings → Bindings** → Add **KV Namespace**  
   - Variable name: `OUTBOUND`  
3. Redeploy once  
4. In project `.dev.vars`:
   ```bash
   SITE_URL=https://your-worker.workers.dev
   ADMIN_PASSWORD=7777
   ```
5. **Publish as links** in the UI — syncs straight to KV; the site picks it up on the next page load

Without KV + `SITE_URL`, links still save to `public/outbound-films.json` and need `npm run deploy`.

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
