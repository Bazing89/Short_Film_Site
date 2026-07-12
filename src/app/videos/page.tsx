import type { Metadata } from "next";
import { VideosCatalog } from "@/components/VideosCatalog";

export const metadata: Metadata = {
  title: "Videos",
  description: "Browse the full BangHeroes video catalog.",
};

export default function VideosPage() {
  return <VideosCatalog />;
}
