import { Metadata } from "next";
import { getScopedI18n } from "@/locales/server";
import Breadcrumb from "@/components/Common/Breadcrumb";
import SectionTitle from "@/components/Common/SectionTitle";
import ImageAccordion from "@/components/Common/ImageAccordion";

export const metadata: Metadata = {
  // other metadata
};

export default async function AboutPage() {
  const t = await getScopedI18n("about");

  return (
    <>
      <Breadcrumb pageName={t("title")} description={t("paragraph")} />

      <section
        id="uber-uns"
        className="relative bg-gray-light py-16 dark:bg-bg-color-dark md:py-20 lg:py-28"
      >
        <div className="container">
          <SectionTitle
            title=""
            paragraph={t("description")}
            width="full"
            center
          />
          <ImageAccordion />
        </div>
      </section>
    </>
  );
}
