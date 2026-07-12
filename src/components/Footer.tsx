import Link from "next/link";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-cinema-border/50 bg-cinema-dark">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="text-center sm:text-left">
            <p className="font-display text-lg text-cinema-text">BangHeroes</p>
            <p className="mt-1 text-sm text-cinema-muted">
              Original short films, streaming free.
            </p>
          </div>

          <nav className="flex flex-wrap justify-center gap-6">
            <Link
              href="/videos"
              className="text-sm text-cinema-muted transition-colors hover:text-cinema-accent"
            >
              Videos
            </Link>
            <Link
              href="/models"
              className="text-sm text-cinema-muted transition-colors hover:text-cinema-accent"
            >
              Models
            </Link>
            <Link
              href="/bop-models"
              className="text-sm text-cinema-muted transition-colors hover:text-cinema-accent"
            >
              BOP Models
            </Link>
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

        <div className="mt-8 flex flex-col items-center gap-3 border-t border-cinema-border/30 pt-8 sm:flex-row sm:justify-between">
          <p className="text-xs text-cinema-muted">
            &copy; {year} BangHeroes. All rights reserved.
          </p>
          <Link
            href="/admin"
            className="text-xs uppercase tracking-wider text-cinema-muted/70 transition-colors hover:text-cinema-accent"
          >
            Admin
          </Link>
        </div>
      </div>
    </footer>
  );
}
