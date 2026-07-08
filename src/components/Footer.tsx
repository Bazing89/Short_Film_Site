import Link from "next/link";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-cinema-border/50 bg-cinema-dark">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="text-center sm:text-left">
            <p className="font-display text-lg text-cinema-text">GirlCumXXX</p>
            <p className="mt-1 text-sm text-cinema-muted">
              Original short films, streaming free.
            </p>
          </div>

          <nav className="flex gap-6">
            <Link
              href="/films"
              className="text-sm text-cinema-muted transition-colors hover:text-cinema-accent"
            >
              Films
            </Link>
            <Link
              href="/about"
              className="text-sm text-cinema-muted transition-colors hover:text-cinema-accent"
            >
              About
            </Link>
            <Link
              href="/contact"
              className="text-sm text-cinema-muted transition-colors hover:text-cinema-accent"
            >
              Contact
            </Link>
          </nav>
        </div>

        <div className="mt-8 border-t border-cinema-border/30 pt-8 text-center">
          <p className="text-xs text-cinema-muted">
            &copy; {year} GirlCumXXX. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
