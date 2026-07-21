import Link from "next/link";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-cinema-border/40 bg-cinema-dark">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="text-center sm:text-left">
            <p className="font-display text-lg text-cinema-text">BangHeroes</p>
            <p className="mt-1 max-w-sm text-sm text-cinema-muted">
              Search models online, import videos to the library, and browse
              what others have added.
            </p>
          </div>

          <nav className="flex flex-wrap justify-center gap-6">
            <Link
              href="/"
              className="text-sm text-cinema-muted transition-colors hover:text-cinema-accent"
            >
              Search
            </Link>
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
