import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-7xl flex-col items-center justify-center px-4 py-20 text-center sm:px-6 lg:px-8">
      <p className="text-xs font-medium uppercase tracking-[0.3em] text-cinema-accent">
        404
      </p>
      <h1 className="font-display mt-4 text-3xl text-cinema-text sm:text-4xl">
        Film Not Found
      </h1>
      <p className="mt-4 max-w-md text-cinema-muted">
        The film you&apos;re looking for doesn&apos;t exist or may have been
        removed from the collection.
      </p>
      <Link
        href="/films"
        className="mt-8 inline-flex items-center gap-2 rounded-sm bg-cinema-accent px-6 py-3 text-sm font-medium uppercase tracking-widest text-cinema-black transition-colors hover:bg-cinema-accent-hover"
      >
        Browse Films
      </Link>
    </div>
  );
}
