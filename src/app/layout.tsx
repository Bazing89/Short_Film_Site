import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "GirlCumXXX",
    template: "%s | GirlCumXXX",
  },
  description:
    "A curated collection of original short films. Premium indie cinema, streaming free.",
  keywords: ["short films", "indie cinema", "filmmaker", "streaming"],
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
