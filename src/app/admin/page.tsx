import type { Metadata } from "next";
import { AdminPanel } from "@/components/AdminPanel";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <p className="mb-2 text-xs uppercase tracking-[0.2em] text-cinema-accent">
        Private
      </p>
      <h1 className="font-display text-3xl text-cinema-text sm:text-4xl">
        Admin
      </h1>
      <p className="mt-3 mb-10 max-w-2xl text-sm text-cinema-muted">
        Import outbound video links and model profiles. Password protected.
        Requires the Cloudflare Worker (`npm run preview` or deploy). Bunny
        downloads stay in the local Python tool.
      </p>
      <AdminPanel />
    </div>
  );
}
