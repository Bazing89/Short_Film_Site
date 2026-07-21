import type { Metadata } from "next";
import { ModelSearchHome } from "@/components/ModelSearchHome";

export const metadata: Metadata = {
  title: "Model Search & Video Library",
  description:
    "Search models online across tube sites, import videos to the library, and browse what others have added on BangHeroes.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return <ModelSearchHome />;
}
