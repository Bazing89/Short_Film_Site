import type { FilmCredit } from "@/data/films";

interface CreditsListProps {
  credits: FilmCredit[];
}

export function CreditsList({ credits }: CreditsListProps) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {credits.map((credit) => (
        <div
          key={`${credit.role}-${credit.name}`}
          className="flex flex-col rounded-md border border-cinema-border/30 bg-cinema-card/50 px-4 py-3"
        >
          <dt className="text-xs font-medium uppercase tracking-wider text-cinema-accent">
            {credit.role}
          </dt>
          <dd className="mt-1 text-sm text-cinema-text">{credit.name}</dd>
        </div>
      ))}
    </dl>
  );
}
