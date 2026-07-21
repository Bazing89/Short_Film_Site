import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://bangheroes.com"
  ),
  title: {
    default: "BangHeroes — Model Search & Video Library",
    template: "%s | BangHeroes",
  },
  description:
    "Search models online across tube sites, import videos to the library, and browse what others have added.",
  keywords: ["model search", "video library", "performer search", "BangHeroes"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-cinema-black text-cinema-text">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
