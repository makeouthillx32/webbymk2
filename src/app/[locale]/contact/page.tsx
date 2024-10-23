import Breadcrumb from "@/components/Common/Breadcrumb";
import Contact from "@/components/Contact";
import { Metadata } from "next";
import { getScopedI18n } from "@/locales/server";

export const metadata: Metadata = {
  title: "Kontakt | Formen Werkstatt",
  description: "This is Contact Page for Startup Nextjs Template",
  // other metadata
};

const ContactPage = async () => {
  const t = await getScopedI18n("contact");

  return (
    <>
      <Breadcrumb pageName={t("title")} description={t("paragraph")} />

      <Contact />
    </>
  );
};

export default ContactPage;
