import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "BOP Models",
  description: "BOP Models — coming soon.",
};

export default function BopModelsPage() {
  return (
    <>
      <PageHeader title="BOP Models" />
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <p className="text-center text-sm text-cinema-muted">Coming soon.</p>
      </div>
    </>
  );
}
