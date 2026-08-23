import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title:       "Unenter Status",
  description: "Live status for unenter.live services",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
