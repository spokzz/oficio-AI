import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Oficio AI",
  description: "Bilingual AI receptionist and job dashboard for home-service businesses.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Oficio AI"
  }
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#fe741d"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
