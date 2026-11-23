import test from "node:test";
import assert from "node:assert/strict";
import {
  statistics,
  cost,
  currentHour,
  madridDate,
} from "../web/assets/calculations.mjs";
test("statistics include negative prices and stable ties", () => {
  const hours = [{ total: 0.1 }, { total: -0.03 }, { total: 0.1 }];
  const result = statistics(hours);
  assert.equal(result.minimum, hours[1]);
  assert.equal(result.maximum, hours[0]);
  assert.ok(Math.abs(result.average - 0.17 / 3) < 1e-12);
  assert.throws(() => statistics([]));
});
test("energy costs exclude any fixed charge", () => {
  assert.equal(cost(0, 0.2), 0);
  assert.equal(cost(3, 0.2), 0.6000000000000001);
  assert.equal(cost(2, -0.01), -0.02);
  for (const value of [-1, Infinity, NaN, 1000001])
    assert.throws(() => cost(value, 0.1));
});
test("distinct instants in duplicated DST civil hours", () => {
  const hours = [
    { start: "2026-10-25T02:00:00+02:00", end: "2026-10-25T01:00:00Z" },
    { start: "2026-10-25T02:00:00+01:00", end: "2026-10-25T02:00:00Z" },
  ];
  assert.equal(
    currentHour(hours, Date.parse("2026-10-25T01:30:00Z")),
    hours[1],
  );
  assert.equal(
    currentHour(hours, Date.parse("2026-10-25T02:00:00Z")),
    undefined,
  );
  assert.equal(madridDate(new Date("2026-07-01T23:30:00Z")), "2026-07-02");
});

test("historical range excludes selected/future days and uses local hours", async () => {
  const { historicalRange, sharedBounds } =
    await import("../web/assets/calculations.mjs");
  const make = (date, values) => ({
    date,
    status: "available",
    demo: false,
    hours: values.map(([time, total]) => ({
      start: `${date}T${time}:00:00+01:00`,
      total,
      remaining: total - 0.01,
      regulated: 0.01,
    })),
  });
  const today = make("2026-11-02", [["02", 0.2]]),
    tomorrow = make("2026-11-03", [["02", 0.3]]);
  const history = [
    make("2026-10-25", [["02", -9]]),
    make("2026-10-26", [["02", -0.1]]),
    make("2026-11-01", [["02", 0.1]]),
  ];
  const bundle = { days: [today, tomorrow], history };
  const range = historicalRange(bundle, today);
  assert.equal(range.from, "2026-10-26");
  assert.equal(range.to, "2026-11-01");
  assert.deepEqual(range.hours, [{ min: -0.1, max: 0.1, days: 2 }]);
  assert.deepEqual(historicalRange(bundle, tomorrow).hours, [
    { min: 0.1, max: 0.2, days: 2 },
  ]);
  const bounds = sharedBounds(bundle);
  assert.ok(bounds.min < -0.1);
  assert.ok(bounds.max > 0.3);
  assert.ok(bounds.min > -1);
  assert.equal(historicalRange({ days: [today] }, today).days, 0);
  assert.deepEqual(historicalRange({ days: [today] }, today).hours, [null]);
});
test("DST repetitions share extrema without counting a day twice; missing spring hour stays empty", async () => {
  const { historicalRange, shiftDate } =
    await import("../web/assets/calculations.mjs");
  const day = {
    date: "2026-10-25",
    status: "available",
    demo: false,
    hours: [
      { start: "2026-10-25T02:00:00+02:00", total: -0.02 },
      { start: "2026-10-25T02:00:00+01:00", total: 0.25 },
    ],
  };
  const selected = { ...day, date: "2026-10-26" };
  assert.deepEqual(
    historicalRange({ days: [selected], history: [day, day] }, selected).hours,
    [
      { min: -0.02, max: 0.25, days: 1 },
      { min: -0.02, max: 0.25, days: 1 },
    ],
  );
  const spring = {
    ...day,
    date: "2026-03-29",
    hours: [{ start: "2026-03-29T03:00:00+02:00", total: 0.1 }],
  };
  assert.equal(
    historicalRange(
      { days: [], history: [spring] },
      { ...selected, date: "2026-03-30" },
    ).hours[0],
    null,
  );
  assert.equal(shiftDate("2027-01-01", -7), "2026-12-25");
  assert.equal(shiftDate("2026-03-30", -1), "2026-03-29");
});

test("trends use calendar windows, exclude tomorrow, and preserve missing dates", async () => {
  const { trendWindow } = await import("../web/assets/calculations.mjs");
  const bundle = {
    days: [{ date: "2026-11-01", demo: true }],
    trends: [
      {
        date: "2026-10-31",
        status: "available",
        min: -0.1,
        mean: 0,
        max: 0.1,
        demo: true,
      },
      { date: "2026-11-02", status: "available", demo: true },
    ],
  };
  const rows = trendWindow(bundle, 3);
  assert.deepEqual(
    rows.map((r) => r.date),
    ["2026-10-30", "2026-10-31", "2026-11-01"],
  );
  assert.equal(rows[0].status, "unavailable");
  assert.equal(rows[1].min, -0.1);
  assert.equal(
    trendWindow({ ...bundle, trends: undefined }, 1)[0].status,
    "unavailable",
  );
  for (const n of [0, 91, 1.5, NaN])
    assert.throws(() => trendWindow(bundle, n));
});
