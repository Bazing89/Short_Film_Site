import type { Metadata } from "next";
import { FilmsCatalog } from "@/components/FilmsCatalog";

export const metadata: Metadata = {
  title: "Films",
  description: "Browse videos from the Bunny Stream collection.",
};

export default function FilmsPage() {
  return <FilmsCatalog />;
}
