import { modelDetailPath, type ModelSummary } from "@/data/models";

interface ModelCardProps {
  model: ModelSummary & { profileUrl?: string };
  site?: "fpo";
  external?: boolean;
}

export function ModelCard({ model, site, external }: ModelCardProps) {
  const href =
    external && model.profileUrl
      ? model.profileUrl
      : modelDetailPath(model.name, site);

  return (
    <a
      href={href}
      className="group flex flex-col gap-3"
      {...(external && model.profileUrl
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg border border-cinema-border/50 bg-cinema-card transition-colors group-hover:border-cinema-accent/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={model.poster}
          alt={model.name}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-cinema-black/70 via-transparent to-transparent" />
        <span className="absolute bottom-2 right-2 rounded bg-cinema-black/80 px-2 py-0.5 text-[10px] text-cinema-text">
          {model.videoCount > 0
            ? `${model.videoCount} video${model.videoCount !== 1 ? "s" : ""}`
            : external
              ? "Profile"
              : "0 videos"}
        </span>
      </div>
      <p className="text-center text-sm font-medium text-cinema-text capitalize transition-colors group-hover:text-cinema-accent">
        {model.name}
      </p>
    </a>
  );
}
