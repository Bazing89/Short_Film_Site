import type { Metadata } from "next";
import { ModelsCatalog } from "@/components/ModelsCatalog";

export const metadata: Metadata = {
  title: "Models",
  description: "Browse models and actors across the BangHeroes catalog.",
};

export default function ModelsPage() {
  return (
    <ModelsCatalog
      title="Models"
      subtitle="Actors and performers across every source in the catalog."
    />
  );
}
