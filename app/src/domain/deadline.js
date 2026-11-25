// Response deadlines for data subject requests. Pure functions, dates are ISO calendar dates (YYYY-MM-DD) in UTC.
// The rule sets are the general statutory periods; a privacy officer can pick "custom" for anything else.
// Not legal advice: the desk counts the time, the officer decides which rule applies.

/**
 * period: the basic period; extension: the most the law allows on top (needs a reason and a notice to the requester);
 * unit 'months' counts calendar months (GDPR "one month"), 'days' counts days.
 */
export const LAWS = Object.freeze({
  gdpr: { id: 'gdpr', name: 'GDPR (EU)', period: 1, unit: 'months', extension: 2, extensionUnit: 'months', note: 'Art. 12(3): one month, +2 months for complex or numerous requests' },
  'uk-gdpr': { id: 'uk-gdpr', name: 'UK GDPR', period: 1, unit: 'months', extension: 2, extensionUnit: 'months', note: 'Art. 12(3) UK GDPR: one month, +2 months' },
  ccpa: { id: 'ccpa', name: 'CCPA / CPRA (California)', period: 45, unit: 'days', extension: 45, extensionUnit: 'days', note: '45 days, +45 days with notice' },
  lgpd: { id: 'lgpd', name: 'LGPD (Brazil)', period: 15, unit: 'days', extension: 0, extensionUnit: 'days', note: '15 days for a complete access declaration' },
  custom: { id: 'custom', name: 'Custom period', period: 30, unit: 'days', extension: 0, extensionUnit: 'days', note: 'Set the number of days yourself' },
});
export const DEFAULT_LAW = 'gdpr';

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse an ISO date; null when it is not a real calendar date. */
export function parseDate(s) {
  const m = DATE.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
}

export const isoDate = (d) => d.toISOString().slice(0, 10);

export function addDays(date, n) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

/** Add calendar months; a day that does not exist in the target month moves to its last day (31 Jan + 1 month = 28 Feb). */
export function addMonths(date, n) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(date.getUTCDate(), last)));
}

const add = (date, n, unit) => (unit === 'months' ? addMonths(date, n) : addDays(date, n));

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export const daysBetween = (from, to) => Math.round((to.getTime() - from.getTime()) / 86400000);

/**
 * The basic deadline and the latest deadline after an extension.
 * @param {{law: string, receivedOn: string, customDays?: number}} c
 * @returns {{due: string, latest: string, extendable: boolean}}
 */
export function deadlines({ law, receivedOn, customDays }) {
  const rule = LAWS[law] || LAWS[DEFAULT_LAW];
  const start = parseDate(receivedOn);
  if (!start) throw new RangeError(`"${receivedOn}" is not a date (YYYY-MM-DD).`);
  const period = law === 'custom' ? Math.max(1, Math.min(365, Math.round(Number(customDays) || rule.period))) : rule.period;
  const due = add(start, period, rule.unit);
  const latest = rule.extension ? add(due, rule.extension, rule.extensionUnit) : due;
  return { due: isoDate(due), latest: isoDate(latest), extendable: rule.extension > 0 };
}

/**
 * Where a request stands against its deadline today.
 * `dueOn` is the effective deadline (extended or not); `closedOn` is set once the response went out.
 * @returns {{state: 'running'|'due-soon'|'breached'|'met'|'met-late', daysLeft: number|null}}
 */
export function clock({ dueOn, closedOn = null, today, dueSoonDays = 7 }) {
  const due = parseDate(dueOn);
  const now = parseDate(today);
  if (!due || !now) throw new RangeError('clock needs two ISO dates.');
  if (closedOn) {
    const done = parseDate(closedOn);
    return { state: done && done.getTime() > due.getTime() ? 'met-late' : 'met', daysLeft: null };
  }
  const daysLeft = daysBetween(now, due);
  if (daysLeft < 0) return { state: 'breached', daysLeft };
  return { state: daysLeft <= dueSoonDays ? 'due-soon' : 'running', daysLeft };
}
