export function statistics(hours) {
  if (!hours.length || hours.some((h) => !Number.isFinite(h.total)))
    throw new Error("Invalid hourly prices");
  return {
    average: hours.reduce((sum, h) => sum + h.total, 0) / hours.length,
    minimum: hours.reduce((a, b) => (b.total < a.total ? b : a)),
    maximum: hours.reduce((a, b) => (b.total > a.total ? b : a)),
  };
}
export function cost(kwh, price) {
  if (
    !Number.isFinite(kwh) ||
    kwh < 0 ||
    kwh > 1000000 ||
    !Number.isFinite(price)
  )
    throw new Error("Invalid consumption or price");
  return kwh * price;
}
export function currentHour(hours, now = Date.now()) {
  return hours.find(
    (h) => Date.parse(h.start) <= now && now < Date.parse(h.end),
  );
}
export function madridDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// Calendar arithmetic on ISO dates, independent of the browser's timezone and DST.
export function shiftDate(day, offset) {
  const instant = new Date(day + "T12:00:00Z");
  instant.setUTCDate(instant.getUTCDate() + offset);
  return instant.toISOString().slice(0, 10);
}
export function historicalRange(bundle, selected) {
  const from = shiftDate(selected.date, -7),
    to = shiftDate(selected.date, -1);
  const days = new Map();
  for (const day of [...(bundle.history ?? []), ...bundle.days]) {
    if (
      day.status === "available" &&
      day.demo === selected.demo &&
      day.date >= from &&
      day.date <= to
    )
      days.set(day.date, day);
  }
  const buckets = Array.from({ length: 24 }, () => ({
    min: Infinity,
    max: -Infinity,
    dates: new Set(),
  }));
  for (const day of days.values())
    for (const hour of day.hours) {
      const bucket = buckets[Number(hour.start.slice(11, 13))];
      if (!bucket || !Number.isFinite(hour.total)) continue;
      bucket.min = Math.min(bucket.min, hour.total);
      bucket.max = Math.max(bucket.max, hour.total);
      bucket.dates.add(day.date);
    }
  return {
    from,
    to,
    days: days.size,
    hours: selected.hours.map((hour) => {
      const bucket = buckets[Number(hour.start.slice(11, 13))];
      return bucket.dates.size
        ? { min: bucket.min, max: bucket.max, days: bucket.dates.size }
        : null;
    }),
  };
}
export function sharedBounds(bundle) {
  const values = [];
  for (const day of bundle.days.filter((day) => day.status === "available")) {
    for (const hour of day.hours)
      for (const key of ["total", "peajes", "cargos", "regulated", "remaining"])
        if (Number.isFinite(hour[key])) values.push(hour[key]);
    for (const range of historicalRange(bundle, day).hours)
      if (range) values.push(range.min, range.max);
  }
  if (!values.length) return { min: 0, max: 0.01 };
  const min = Math.min(...values),
    max = Math.max(...values);
  const padding = Math.max((max - min) * 0.05, 0.001);
  return { min: min - padding, max: max + padding };
}

export function trendWindow(bundle, count, today = madridDate()) {
  if (!Number.isInteger(count) || count < 1 || count > 90)
    throw new Error("Choose 1–90 days");
  const end = bundle.days[0]?.demo ? bundle.days[0].date : today;
  const byDate = new Map((bundle.trends ?? []).map((row) => [row.date, row]));
  return Array.from({ length: count }, (_, index) => {
    const date = shiftDate(end, index - count + 1),
      row = byDate.get(date);
    return row?.status === "available" && row.demo === bundle.days[0]?.demo
      ? row
      : { date, status: "unavailable" };
  });
}
