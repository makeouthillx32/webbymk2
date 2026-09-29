const MAX_SEARCH_LENGTH = 64;

export function normalizeChatSearchQuery(rawQuery: string) {
  return rawQuery.trim().replace(/[%_]/g, "").slice(0, MAX_SEARCH_LENGTH);
}
