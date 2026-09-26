import type { Metadata, Viewport } from "next";
import { RegisterServiceWorker } from "@/components/register-sw";
import "./globals.css";

export const metadata: Metadata = {
  title: "Boolionaire",
  description: "每日棋盤：擲兩粒骰行棋、起地標、踩中攻擊格就打對手。",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "Boolionaire",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#049CD8",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className="h-full antialiased">
      <body className="flex min-h-full flex-col overscroll-none bg-[#1E3A8A] select-none">
        {/* Rounded display and body fonts; the browser falls back to system fonts offline. */}
        <link
          rel="stylesheet"
          precedence="default"
          href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&family=M+PLUS+Rounded+1c:wght@500;800&display=swap"
        />
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
