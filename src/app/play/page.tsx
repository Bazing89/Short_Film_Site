"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { filmWatchPath } from "@/data/films";
import { fetchFilm } from "@/lib/filmsApi";

function PlayRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id") || "";
  const [message, setMessage] = useState("Redirecting…");

  useEffect(() => {
    if (!id) {
      router.replace("/films");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const film = await fetchFilm(id);
        if (cancelled) return;
        if (film) {
          router.replace(filmWatchPath(film));
        } else {
          // Fall back to id-only watch path (Worker canonicalizes the slug)
          router.replace(`/watch/${encodeURIComponent(id)}`);
        }
      } catch {
        if (!cancelled) {
          setMessage("Could not resolve video — trying watch page…");
          router.replace(`/watch/${encodeURIComponent(id)}`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, router]);

  return (
    <p className="mx-auto max-w-7xl px-4 py-20 text-center text-sm text-cinema-muted">
      {message}
    </p>
  );
}

/** Legacy `/play?id=` URLs redirect to canonical `/watch/{slug}/{id}` pages. */
export default function PlayPage() {
  return (
    <Suspense
      fallback={
        <p className="mx-auto max-w-7xl px-4 py-20 text-center text-sm text-cinema-muted">
          Redirecting…
        </p>
      }
    >
      <PlayRedirect />
    </Suspense>
  );
}
