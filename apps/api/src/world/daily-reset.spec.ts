import { nextUtcMidnight } from './daily-reset';

describe('UTC daily reset schedule', () => {
  it.each([
    ['2026-09-03T23:59:59.999Z', '2026-09-04T00:00:00.000Z'],
    ['2026-09-04T00:00:00.000Z', '2026-09-05T00:00:00.000Z'],
    ['2026-12-31T23:00:00.000Z', '2027-01-01T00:00:00.000Z'],
    ['2028-02-28T23:00:00.000Z', '2028-02-29T00:00:00.000Z'],
    ['2026-03-29T01:30:00+02:00', '2026-03-29T00:00:00.000Z'],
  ])('uses the next UTC midnight after %s', (now, expected) => {
    expect(nextUtcMidnight(new Date(now)).toISOString()).toBe(expected);
  });
});
