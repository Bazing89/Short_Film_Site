import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-cinema-border/50 bg-cinema-black/90 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="font-display text-xl tracking-wide text-cinema-text transition-colors hover:text-cinema-accent sm:text-2xl"
        >
          GirlCumXXX
        </Link>
      </div>
    </header>
  );
}
