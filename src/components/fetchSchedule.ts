export const fetchSchedule = async (week: number, day: string) => {
  try {
    const response = await fetch(`/api/schedule?week=${week}&day=${day}`);

    if (!response.ok) {
      console.warn(`No schedule found for week ${week}, day ${day}. Status: ${response.status}`);
      return { schedule: [] };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching schedule:", error);
    return { schedule: [] }; // Fallback in case of network or JSON parse error
  }
};
