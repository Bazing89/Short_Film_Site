import Link from "next/link";

const navLinks = [
  { href: "/videos", label: "Videos" },
  { href: "/models", label: "Models" },
  { href: "/bop-models", label: "BOP Models" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-cinema-border/50 bg-cinema-black/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="font-display text-xl tracking-wide text-cinema-text transition-colors hover:text-cinema-accent sm:text-2xl"
        >
          BangHeroes
        </Link>

        <nav className="flex flex-wrap items-center justify-end gap-4 sm:gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-cinema-muted transition-colors hover:text-cinema-accent"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
