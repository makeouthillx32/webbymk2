import { useScopedI18n } from "@/locales/client";
import { Menu } from "@/types";

const useMenuData = (): Menu[] => {
  const t = useScopedI18n("menu");

  return [
    {
      title: t("services"),
      newTab: false,
    },
    {
      title: t("about"),
      path: "/about",
      newTab: false,
    },
    {
      title: "Jobs",
      path: "/jobs",
      newTab: false,
    },
    {
      title: t("contact"),
      path: "/contact",
      newTab: false,
    },
  ];
};

export default useMenuData;
