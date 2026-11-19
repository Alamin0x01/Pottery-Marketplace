const OFFSET_MS = 6 * 60 * 60 * 1000; // Bangladesh Standard Time is UTC+6 all year (no daylight saving)
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The last `days` calendar days in Bangladesh time, oldest first, as `{ date: 'YYYY-MM-DD', start, end }`
 * where start/end are UTC `Date`s (end is exclusive). Used to bucket orders by local day.
 */
export function dhakaDayRanges(now = new Date(), days = 14) {
  const todayStart = Math.floor((now.getTime() + OFFSET_MS) / DAY_MS) * DAY_MS; // local midnight, in shifted ms
  const ranges = [];
  for (let i = days - 1; i >= 0; i--) {
    const start = todayStart - i * DAY_MS;
    ranges.push({
      date: new Date(start).toISOString().slice(0, 10),
      start: new Date(start - OFFSET_MS),
      end: new Date(start + DAY_MS - OFFSET_MS),
    });
  }
  return ranges;
}
