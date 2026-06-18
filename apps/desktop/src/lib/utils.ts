export function partOfDayFromHour(hour = new Date().getHours()): string {
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export function nowIso(): string {
  return new Date().toISOString();
}
