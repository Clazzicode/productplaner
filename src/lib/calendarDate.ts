/** A date picked in an HTML date field is stored at UTC midnight. Display its
 * calendar day in UTC so viewers west of Greenwich do not see yesterday. */
export function formatCalendarDate(
  value: Date | string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(undefined, {
    ...options,
    timeZone: "UTC",
  }).format(typeof value === "string" ? new Date(value) : value);
}
