import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Oficio AI",
  description: "Bilingual AI receptionist and job dashboard for home-service businesses."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

