import type { Metadata } from "next";
import { ModelsCatalog } from "@/components/ModelsCatalog";

export const metadata: Metadata = {
  title: "BOP Models",
  description: "Browse models from the MyFPO catalog.",
};

export default function BopModelsPage() {
  return (
    <ModelsCatalog
      site="fpo"
      title="BOP Models"
      subtitle="Performers featured in MyFPO (fpo.xxx) videos."
    />
  );
}
