import type { Metadata } from "next";
import { ModelsCatalog } from "@/components/ModelsCatalog";

export const metadata: Metadata = {
  title: "Models",
  description: "Browse models in the video library — search performers and watch their imported videos.",
};

export default function ModelsPage() {
  return (
    <ModelsCatalog
      title="Models"
      subtitle="Search performers and browse videos imported to the library."
    />
  );
}
