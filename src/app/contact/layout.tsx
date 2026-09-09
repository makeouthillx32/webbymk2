// src/app/contact/layout.tsx
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Support | Unenter Labs",
  description: "Customer care and laboratory research inquiries.",
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
