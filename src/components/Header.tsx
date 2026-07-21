import Link from "next/link";

const navLinks = [
  { href: "/", label: "Search" },
  { href: "/search", label: "Model search" },
  { href: "/videos", label: "Videos" },
  { href: "/models", label: "Models" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-cinema-border/40 bg-cinema-black/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cinema-accent to-cinema-glow text-sm font-bold text-white shadow-md shadow-cinema-accent/20">
            B
          </span>
          <span className="font-display text-xl tracking-wide text-cinema-text transition-colors group-hover:text-cinema-accent sm:text-2xl">
            BangHeroes
          </span>
        </Link>

        <nav className="flex flex-wrap items-center justify-end gap-1 sm:gap-2">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm text-cinema-muted transition-colors hover:bg-cinema-card/80 hover:text-cinema-accent"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
