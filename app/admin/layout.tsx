import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Elle Jew Admin",
  description: "Painel administrativo da Elle Jew",
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
  manifest: "/admin.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Elle Jew Admin",
  },
  icons: {
    icon: [
      { url: "/admin-icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/admin-icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/admin-icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#13212b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
