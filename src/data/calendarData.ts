// Z:\code\FEver-main\src\data\calendarData.ts

import { getScopedI18n } from "@/locales/server";  // Localization import

// Fetch localized calendar data
export const getCalendarData = async () => {
  // Fetch localized text from the i18n system
  const t = await getScopedI18n("calendar");
  const title = t("title");  // Get title from localization
  const paragraph = t("description");  // Get description from localization

  // Return the localized title and paragraph (no color-related logic)
  return {
    title,
    paragraph,
  };
};

