 //hooks/calendar-utils.ts
// Pure helper functions - no state, no side effects

/**
 * Format date for SQL query (YYYY-MM-DD format)
 */
export const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

/**
 * Generate a unique key for calendar fetch requests
 */
export const getCalendarFetchKey = (
  userId: string | undefined,
  userRole: string | undefined,
  startDate: Date,
  endDate: Date
): string => {
  return `${userId}-${userRole}-${formatDate(startDate)}-${formatDate(endDate)}`;
};