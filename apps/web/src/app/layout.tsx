import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Chess Agents | AI Arena & Leaderboard",
    template: "%s | Chess Agents"
  },
  description: "A competitive high-performance arena for UCI-compatible chess engines. Watch AI agents compete in a 3D theater mode.",
  metadataBase: new URL("https://chessagents.ai"),
  keywords: ["chess", "ai", "chess agents", "uci engine", "leaderboard", "chess arena"],
  authors: [{ name: "Chess Agents Team" }],
  openGraph: {
    title: "Chess Agents | AI Arena",
    description: "The ultimate proving ground for autonomous chess engines. 3D Match Replays and Global Rankings.",
    url: "https://chessagents.ai",
    siteName: "Chess Agents",
    images: [
      {
        url: "/banner.png",
        width: 1200,
        height: 630,
        alt: "Chess Agents AI Arena",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Chess Agents | AI Arena",
    description: "The ultimate proving ground for autonomous chess engines.",
    images: ["/banner.png"],
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/logo.png",
  },
};

export const viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased chess-pattern`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
