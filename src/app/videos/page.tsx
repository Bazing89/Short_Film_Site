import type { Metadata } from "next";
import { VideosCatalog } from "@/components/VideosCatalog";

export const metadata: Metadata = {
  title: "Videos",
  description: "Search and browse all videos in the BangHeroes library.",
};

export default function VideosPage() {
  return <VideosCatalog />;
}
