/**
 * Minimal 5-field cron expression parser + next-run computation.
 *
 * Supports the standard crontab syntax: "minute hour day-of-month month day-of-week".
 * Supported tokens per field:
 *   - star          → all values
 *   - "n"           → single value (e.g. "5")
 *   - "a-b"         → range (e.g. "1-5")
 *   - "a,b,c"       → list (comma-separated values/ranges)
 *   - star/n        → step (every n within the field's range)
 *   - "a-b/n"       → stepped range
 *
 * Day-of-week: 0-6 (0 = Sunday) and 7 is also accepted as Sunday.
 *
 * NOT supported: names (JAN, MON), @reboot, @daily, macros, seconds field, L/W/#.
 *
 * This is deliberately small — enough to express "every 30 min", "hourly at :15",
 * "daily at 3am", "weekdays at 9am". For anything more complex, use an interval.
 */

export interface ParsedCron {
  minute: number[];
  hour: number[];
  dom: number[];
  month: number[];
  dow: number[];
  /** Original expression, for logging. */
  raw: string;
}

const FIELD_RANGES: Record<string, [number, number]> = {
  minute: [0, 59],
  hour: [0, 23],
  dom: [1, 31],
  month: [1, 12],
  dow: [0, 7], // 0 and 7 both mean Sunday; we normalize 7→0 after parse
};

/**
 * Parse a single field into a sorted unique array of valid values.
 * Throws on malformed input.
 */
function parseField(field: string, name: string, [min, max]: [number, number]): number[] {
  if (field === "*") {
    const out: number[] = [];
    for (let i = min; i <= max; i++) out.push(i);
    return out;
  }

  const values = new Set<number>();
  for (const part of field.split(",")) {
    // Detect a step: "base/step"
    const stepSlash = part.indexOf("/");
    let step = 1;
    let rangePart = part;
    if (stepSlash !== -1) {
      const stepStr = part.slice(stepSlash + 1);
      step = parseInt(stepStr, 10);
      if (!Number.isFinite(step) || step < 1) {
        throw new Error(`cron field "${name}": invalid step "${stepStr}"`);
      }
      rangePart = part.slice(0, stepSlash);
    }

    // Resolve the range bounds.
    let lo: number;
    let hi: number;
    if (rangePart === "*") {
      lo = min;
      hi = max;
    } else if (rangePart.includes("-")) {
      const [a, b] = rangePart.split("-");
      lo = parseInt(a, 10);
      hi = parseInt(b, 10);
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < min || hi > max || lo > hi) {
        throw new Error(`cron field "${name}": invalid range "${rangePart}"`);
      }
    } else {
      // Single value. Without a step, this is just one value. With a step
      // ("5/10"), it means "from 5 to max, every 10".
      lo = parseInt(rangePart, 10);
      if (!Number.isFinite(lo) || lo < min || lo > max) {
        throw new Error(`cron field "${name}": invalid value "${rangePart}"`);
      }
      hi = stepSlash !== -1 ? max : lo;
    }

    for (let v = lo; v <= hi; v += step) {
      values.add(v);
    }
  }

  const arr = Array.from(values).sort((a, b) => a - b);
  if (arr.length === 0) {
    throw new Error(`cron field "${name}": field produced no values`);
  }
  return arr;
}

/**
 * Parse a 5-field cron expression. Throws on malformed input.
 */
export function parseCron(expr: string): ParsedCron {
  const raw = expr.trim();
  const fields = raw.split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`cron expression must have 5 fields, got ${fields.length}: "${raw}"`);
  }
  const [mField, hField, domField, monField, dowField] = fields;

  let dow = parseField(dowField, "dow", FIELD_RANGES.dow);
  // Normalize 7 → 0 (both mean Sunday).
  if (dow.includes(7)) {
    dow = dow.filter((v) => v !== 7);
    if (!dow.includes(0)) dow.push(0);
    dow.sort((a, b) => a - b);
  }

  return {
    minute: parseField(mField, "minute", FIELD_RANGES.minute),
    hour: parseField(hField, "hour", FIELD_RANGES.hour),
    dom: parseField(domField, "dom", FIELD_RANGES.dom),
    month: parseField(monField, "month", FIELD_RANGES.month),
    dow,
    raw,
  };
}

/**
 * Compute the next firing time >= `afterMs` (ms-epoch) for a parsed cron.
 * Walks forward minute-by-minute up to ~4 years; throws if no match in that
 * window (indicates an impossible expression, e.g. Feb 30).
 */
export function nextCronRun(parsed: ParsedCron, afterMs: number): number {
  // Start at the top of the next minute AFTER `afterMs`. We round up to the
  // next minute boundary so we never re-fire the same minute.
  const after = new Date(afterMs);
  const start = new Date(
    after.getUTCFullYear(),
    after.getUTCMonth(),
    after.getUTCDate(),
    after.getUTCHours(),
    after.getUTCMinutes() + 1,
    0,
    0,
  );

  // Guard: cap iterations to avoid an infinite loop on impossible expressions.
  // 4 years of minutes ≈ 2.1M. We allow 3M to be safe.
  let iterations = 0;
  const MAX_ITER = 3_000_000;

  while (iterations < MAX_ITER) {
    iterations++;

    if (!parsed.month.includes(start.getUTCMonth() + 1)) {
      // Advance to the first day of the next month.
      start.setUTCMonth(start.getUTCMonth() + 1, 1);
      start.setUTCHours(0, 0, 0, 0);
      continue;
    }

    if (!parsed.dom.includes(start.getUTCDate())) {
      start.setUTCDate(start.getUTCDate() + 1);
      start.setUTCHours(0, 0, 0, 0);
      continue;
    }

    // JS getUTCDay: 0=Sunday..6=Saturday. Matches our normalized dow array.
    if (!parsed.dow.includes(start.getUTCDay())) {
      start.setUTCDate(start.getUTCDate() + 1);
      start.setUTCHours(0, 0, 0, 0);
      continue;
    }

    if (!parsed.hour.includes(start.getUTCHours())) {
      start.setUTCHours(start.getUTCHours() + 1, 0, 0, 0);
      continue;
    }

    if (!parsed.minute.includes(start.getUTCMinutes())) {
      start.setUTCMinutes(start.getUTCMinutes() + 1, 0, 0);
      continue;
    }

    // All fields match. Return ms-epoch.
    return start.getTime();
  }

  throw new Error(
    `cron expression "${parsed.raw}" produced no next-run within ${MAX_ITER} iterations (impossible schedule?)`,
  );
}
