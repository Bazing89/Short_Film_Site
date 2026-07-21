"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ModelDetail } from "@/components/ModelDetail";

function LegacyModelRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug") || "";

  useEffect(() => {
    if (!slug) return;
    const site = searchParams.get("site");
    const target =
      site === "fpo"
        ? `/models/${encodeURIComponent(slug)}?site=fpo`
        : `/models/${encodeURIComponent(slug)}`;
    router.replace(target);
  }, [router, searchParams, slug]);

  if (slug) {
    return (
      <p className="mx-auto max-w-7xl px-4 py-20 text-center text-sm text-cinema-muted">
        Redirecting to model page…
      </p>
    );
  }

  return <ModelDetail />;
}

export default function LegacyModelPage() {
  return (
    <Suspense
      fallback={
        <p className="mx-auto max-w-7xl px-4 py-20 text-center text-sm text-cinema-muted">
          Loading model…
        </p>
      }
    >
      <LegacyModelRedirect />
    </Suspense>
  );
}
