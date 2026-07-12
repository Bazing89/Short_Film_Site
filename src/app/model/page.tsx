import type { Metadata } from "next";
import { ModelDetail } from "@/components/ModelDetail";

export const metadata: Metadata = {
  title: "Model",
  description: "Videos featuring this model.",
};

export default function ModelPage() {
  return <ModelDetail />;
}
