import { getStreamEmbedUrl, type Film } from "@/data/films";

interface VideoPlayerProps {
  film: Film;
}

export function VideoPlayer({ film }: VideoPlayerProps) {
  const embedUrl = getStreamEmbedUrl(film);
  const isPlaceholder =
    film.streamId.startsWith("YOUR_STREAM") ||
    embedUrl.includes("YOUR_CUSTOMER_CODE");

  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-cinema-border/50 bg-cinema-card">
      <div className="relative aspect-video w-full">
        {isPlaceholder ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-cinema-dark p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-cinema-accent/50">
              <svg
                className="h-8 w-8 text-cinema-accent"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <div>
              <p className="font-display text-lg text-cinema-text">
                Video Player Placeholder
              </p>
              <p className="mt-2 max-w-md text-sm text-cinema-muted">
                Replace <code className="text-cinema-accent">streamId</code> in{" "}
                <code className="text-cinema-accent">src/data/films.ts</code> with
                your Cloudflare Stream video ID to enable playback.
              </p>
            </div>
          </div>
        ) : (
          <iframe
            src={embedUrl}
            title={`${film.title} — video player`}
            className="absolute inset-0 h-full w-full border-0"
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        )}
      </div>
    </div>
  );
}
