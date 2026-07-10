# Shortfilmsite

A modern, cinematic website for showcasing and streaming your original short films. Built with Next.js, TypeScript, and Tailwind CSS — deploy-ready for Cloudflare Pages with Cloudflare Stream video hosting.

## Features

- **Cinematic dark design** — premium indie film aesthetic
- **Homepage** with hero section, featured film, and film grid
- **Film detail pages** with embedded video player, synopsis, and credits
- **Films listing**, **About**, and **Contact** pages
- **Admin-friendly data** — all film metadata in a single TypeScript file
- **Cloudflare Stream ready** — placeholder video IDs you can swap for real embeds
- **Fully responsive** — mobile-first layout with subtle hover animations

## Tech Stack

- [Next.js 15](https://nextjs.org/) (App Router)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [Cloudflare Pages](https://pages.cloudflare.com/) + [Cloudflare Stream](https://www.cloudflare.com/products/cloudflare-stream/)

## Admin: queue videos into Bunny Stream

Footer → **Admin** (password `7777` by default).

1. Copy `.dev.vars.example` → `.dev.vars` and set your Bunny Stream **library API key**
2. Build + run the Worker (API only works through Wrangler, not plain `next dev`):

```bash
cp .dev.vars.example .dev.vars
# edit .dev.vars — set BUNNY_API_KEY from Bunny → Stream → Library → API

npm run preview
# or: npm run deploy
```

3. Open `/admin`, log in, paste **direct video file URLs** (one per line)
4. Bunny fetches each URL into collection `98f0b8d8-336d-4ab9-9c2c-513c29815305`

The public site loads videos dynamically from that collection via `GET /api/films` (no hardcoded count). Titles are cleaned from filenames (`.mp4` and trailing IDs/numbers removed).

### Cloudflare Build variable (required for Git auto-deploy)

If your Cloudflare UI only has **Build environment variables** (not Worker runtime secrets), set:

| Name | Value |
|------|--------|
| `BUNNY_API_KEY` | Bunny Stream library AccessKey |
| `ADMIN_PASSWORD` | `7777` (optional) |

Encrypt them, then redeploy. On each build, `scripts/inject-build-env.mjs` bakes those values into the Worker so `/api/films` works at runtime.

**Do not commit the API key into git.** Keep it only as a Cloudflare Build variable (or local `.dev.vars`).

Production secrets (if you have Worker runtime secrets available):

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put BUNNY_API_KEY
```

Optional thumbnail CDN host (Bunny Stream pull zone hostname):

```toml
# wrangler.toml [vars]
BUNNY_CDN_HOSTNAME = "vz-xxxxx.b-cdn.net"
```

**Note:** Bunny URL-fetch needs a publicly reachable media file URL (often `.mp4`). HTML page links from tube sites usually fail.

### Local: yt-dlp → Bunny upload

Use the [`python-script/`](python-script/) folder to queue links, download one-by-one with `yt-dlp`, and upload to Bunny:

```bash
# 1. Put URLs in python-script/queue.txt (one per line)
# 2. Run:
python3 python-script/download_to_bunny.py

# or interactive:
python3 python-script/download_to_bunny.py --interactive
```

See [`python-script/README.md`](python-script/README.md).

## Getting Started

### Prerequisites

- Node.js 18.17 or later
- npm (or yarn/pnpm)

### Install & Run

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm run start
```

## Managing Your Films

All film data lives in **`src/data/films.ts`**. This is the only file you need to edit to add, update, or remove films.

Each film entry includes:

| Field | Description |
|-------|-------------|
| `title` | Film title |
| `slug` | URL-friendly identifier (used in `/films/[slug]`) |
| `description` | Short description for cards |
| `synopsis` | Full synopsis for the detail page |
| `poster` | Poster image URL (local or remote) |
| `streamId` | Cloudflare Stream video ID |
| `embedUrl` | Optional full embed URL (overrides `streamId`) |
| `runtime` | e.g. `"14 min"` |
| `year` | Release year |
| `genre` | Genre label |
| `credits` | Array of `{ role, name }` objects |
| `featured` | Set `true` on one film to feature it on the homepage |

### Adding a New Film

1. Open `src/data/films.ts`
2. Add a new object to the `films` array
3. Set a unique `slug` (lowercase, hyphenated)
4. Save — the film automatically appears on the homepage and `/films` page

### Setting the Featured Film

Set `featured: true` on exactly one film. The homepage hero section will showcase that film.

## Replacing Placeholder Videos with Cloudflare Stream

The site ships with placeholder Stream IDs. Follow these steps to connect your real videos.

### Step 1: Upload Videos to Cloudflare Stream

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Go to **Stream** → **Upload**
3. Upload each short film
4. Copy the **Video ID** for each upload

### Step 2: Find Your Customer Code

When you view a video's embed code in the Stream dashboard, the URL looks like:

```
https://customer-abc123xyz.cloudflarestream.com/<VIDEO_ID>/iframe
```

The `abc123xyz` part is your **customer code**.

### Step 3: Update `src/data/films.ts`

**Option A — Update the global customer code** (recommended if all videos share one account):

```typescript
export const CLOUDFLARE_STREAM_CUSTOMER_CODE = "abc123xyz";
```

Then replace each placeholder `streamId`:

```typescript
streamId: "a1b2c3d4e5f6g7h8i9j0",  // your actual video ID
```

**Option B — Use a full embed URL per film** (if videos are on different accounts):

```typescript
embedUrl: "https://customer-abc123xyz.cloudflarestream.com/a1b2c3d4e5f6g7h8i9j0/iframe",
```

When `embedUrl` is set, it takes precedence over `streamId`.

### Step 4: Verify Locally

```bash
npm run dev
```

Visit a film detail page (e.g. `/films/midnight-on-mercer`) and confirm the video player loads.

## Replacing Poster Images

Poster images currently use Unsplash placeholders. Replace them with your own:

- **Remote URLs**: Update the `poster` field with any HTTPS image URL
- **Local images**: Place files in `public/posters/` and reference them as `/posters/your-film.jpg`

If using remote images from a new domain, add the hostname to `next.config.ts` under `images.remotePatterns`.

## Deploying to Cloudflare Pages

### Option A: Git Integration (Recommended)

1. Push this repo to GitHub or GitLab
2. In the [Cloudflare Dashboard](https://dash.cloudflare.com/), go to **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
3. Select your repository
4. Configure build settings:

   | Setting | Value |
   |---------|-------|
   | Framework preset | Next.js (Static HTML Export) |
   | Build command | `npm run build` |
   | Build output directory | `out` |
   | Node.js version | `18` or later |

5. Deploy

### Option B: CLI Deploy

```bash
# Install dependencies
npm install

# Build static site
npm run build

# Preview locally
npm run pages:preview

# Deploy
npm run pages:deploy
```

### Environment Variables

This project does not require environment variables for basic operation. Film data is stored locally in `src/data/films.ts`.

If you later add a contact form backend or analytics, set environment variables in the Cloudflare Pages dashboard under **Settings** → **Environment variables**.

## Project Structure

```
src/
├── app/
│   ├── page.tsx              # Homepage
│   ├── films/
│   │   ├── page.tsx          # Films listing
│   │   └── [slug]/page.tsx   # Film detail page
│   ├── about/page.tsx        # About page
│   ├── contact/page.tsx      # Contact page
│   ├── layout.tsx            # Root layout
│   └── globals.css           # Global styles & theme
├── components/
│   ├── Header.tsx            # Navigation header
│   ├── Footer.tsx            # Site footer
│   ├── Hero.tsx              # Homepage hero section
│   ├── FilmCard.tsx          # Film grid card
│   ├── VideoPlayer.tsx       # Cloudflare Stream embed
│   ├── CreditsList.tsx       # Film credits display
│   └── PageHeader.tsx        # Page title + back link
└── data/
    └── films.ts              # ← Edit this to manage films
```

## Customization

- **Site name**: Update in `src/app/layout.tsx` (metadata) and `src/components/Header.tsx`
- **Colors**: Edit CSS variables in `src/app/globals.css`
- **About page**: Replace placeholder bio in `src/app/about/page.tsx`
- **Contact page**: Update email and social links in `src/app/contact/page.tsx`

## License

Private project — all film content rights reserved by the filmmaker.
