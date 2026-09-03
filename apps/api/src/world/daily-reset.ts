/** UTC calendar arithmetic, independent of server timezone and DST. */
export function nextUtcMidnight(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
}
