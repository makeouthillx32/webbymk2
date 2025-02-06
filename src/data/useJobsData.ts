import { useScopedI18n } from "@/locales/client";
import { Jobs } from "@/types";

const useJobsData = (): Jobs => {
  const t = useScopedI18n("jobs");

  return {
    title: t("title"),
    paragraph: t("paragraph"),
    ads: [
      {
        title: t("ads.0.title"),
        slug: "jobs",
        image: t("ads.0.image"),
        description: t("ads.0.description"),
        paragraph: t("ads.0.paragraph"),
      },
      {
        title: t("ads.1.title"),
        slug: "jobs",
        image: t("ads.1.image"),
        description: t("ads.1.description"),
        paragraph: t("ads.1.paragraph"),
      },
    ],
  };
};

export default useJobsData;
