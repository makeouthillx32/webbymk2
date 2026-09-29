// src/app/contact/layout.tsx
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Support",
  description: "Get in touch with the Unenter team.",
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
