// src/app/contact/page.tsx
import type { Metadata } from "next";
import ContactPage from "@/zones/labs/contact/ContactPage";

export const metadata: Metadata = {
  title: "Contact Support & Inquiries | Unenter Labs",
  description:
    "Get in touch with Unenter Labs customer care, order support, analytical batch verification, and Blurton Livestock & Rescue inquiries.",
};

export default function ContactPageRoute() {
  return <ContactPage />;
}
