import { modelDetailPath, type ModelSummary } from "@/data/models";

interface ModelCardProps {
  model: ModelSummary;
  site?: "fpo";
}

export function ModelCard({ model, site }: ModelCardProps) {
  return (
    <a
      href={modelDetailPath(model.name, site)}
      className="group flex flex-col gap-3"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border border-cinema-border/40 bg-cinema-card transition-all duration-300 group-hover:border-cinema-accent/50 group-hover:shadow-lg group-hover:shadow-cinema-accent/5">
        {model.poster ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={model.poster}
            alt={model.name}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-cinema-dark text-xs text-cinema-muted">
            No image
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-cinema-black/70 via-transparent to-transparent" />
        <span className="absolute bottom-2 right-2 rounded bg-cinema-black/80 px-2 py-0.5 text-[10px] text-cinema-text">
          {model.videoCount} video{model.videoCount !== 1 ? "s" : ""}
        </span>
      </div>
      <p className="text-center text-sm font-medium text-cinema-text capitalize transition-colors group-hover:text-cinema-accent">
        {model.name}
      </p>
    </a>
  );
}
