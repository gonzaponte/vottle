export function statistics(hours) {
  if (!hours.length || hours.some(h => !Number.isFinite(h.total))) throw new Error('Invalid hourly prices');
  return {
    average: hours.reduce((sum, h) => sum + h.total, 0) / hours.length,
    minimum: hours.reduce((a, b) => b.total < a.total ? b : a),
    maximum: hours.reduce((a, b) => b.total > a.total ? b : a),
  };
}
export function cost(kwh, price) {
  if (!Number.isFinite(kwh) || kwh < 0 || kwh > 1000000 || !Number.isFinite(price)) throw new Error('Invalid consumption or price');
  return kwh * price;
}
export function currentHour(hours, now = Date.now()) {
  return hours.find(h => Date.parse(h.start) <= now && now < Date.parse(h.end));
}
export function madridDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
