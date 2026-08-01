export type Holiday = { date: string; name: string; note: string };
export type LeavePlan = {
  start: string;
  end: string;
  days: number;
  leaveDates: string[];
  holidayNames: string[];
};

export const SUPPORTED_YEARS = [2026, 2027] as const;
export type SupportedYear = (typeof SUPPORTED_YEARS)[number];

export const HOLIDAYS: Record<SupportedYear, Holiday[]> = {
  2026: [
    { date: "2026-01-01", name: "元日", note: "" },
    { date: "2026-01-12", name: "成人の日", note: "" },
    { date: "2026-02-11", name: "建国記念の日", note: "" },
    { date: "2026-02-23", name: "天皇誕生日", note: "" },
    { date: "2026-03-20", name: "春分の日", note: "" },
    { date: "2026-04-29", name: "昭和の日", note: "" },
    { date: "2026-05-03", name: "憲法記念日", note: "" },
    { date: "2026-05-04", name: "みどりの日", note: "" },
    { date: "2026-05-05", name: "こどもの日", note: "" },
    { date: "2026-05-06", name: "休日", note: "振替休日" },
    { date: "2026-07-20", name: "海の日", note: "" },
    { date: "2026-08-11", name: "山の日", note: "" },
    { date: "2026-09-21", name: "敬老の日", note: "" },
    { date: "2026-09-22", name: "休日", note: "祝日法第3条第3項による休日" },
    { date: "2026-09-23", name: "秋分の日", note: "" },
    { date: "2026-10-12", name: "スポーツの日", note: "" },
    { date: "2026-11-03", name: "文化の日", note: "" },
    { date: "2026-11-23", name: "勤労感謝の日", note: "" },
  ],
  2027: [
    { date: "2027-01-01", name: "元日", note: "" },
    { date: "2027-01-11", name: "成人の日", note: "" },
    { date: "2027-02-11", name: "建国記念の日", note: "" },
    { date: "2027-02-23", name: "天皇誕生日", note: "" },
    { date: "2027-03-21", name: "春分の日", note: "" },
    { date: "2027-03-22", name: "休日", note: "振替休日" },
    { date: "2027-04-29", name: "昭和の日", note: "" },
    { date: "2027-05-03", name: "憲法記念日", note: "" },
    { date: "2027-05-04", name: "みどりの日", note: "" },
    { date: "2027-05-05", name: "こどもの日", note: "" },
    { date: "2027-07-19", name: "海の日", note: "" },
    { date: "2027-08-11", name: "山の日", note: "" },
    { date: "2027-09-20", name: "敬老の日", note: "" },
    { date: "2027-09-23", name: "秋分の日", note: "" },
    { date: "2027-10-11", name: "スポーツの日", note: "" },
    { date: "2027-11-03", name: "文化の日", note: "" },
    { date: "2027-11-23", name: "勤労感謝の日", note: "" },
  ],
};

const dayMilliseconds = 86_400_000;
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
const dateTime = (value: string) => Date.parse(`${value}T00:00:00Z`);

export const normalizeYear = (value: unknown): SupportedYear =>
  Number(value) === 2027 ? 2027 : 2026;

export const normalizeBudget = (value: unknown) => {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) ? Math.min(5, Math.max(1, number)) : 2;
};

export const yearDates = (year: SupportedYear) => {
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const dates: string[] = [];
  for (let time = start; time < end; time += dayMilliseconds) dates.push(iso(time));
  return dates;
};

export const isWeekend = (value: string) => {
  const day = new Date(dateTime(value)).getUTCDay();
  return day === 0 || day === 6;
};

const holidayMap = (year: SupportedYear) =>
  new Map(HOLIDAYS[year].map((holiday) => [holiday.date, holiday]));

const unique = <T>(values: T[]) => [...new Set(values)];

export const recommendLeavePlans = (
  year: SupportedYear,
  budget: number,
  after = `${year}-01-01`,
) => {
  const boundedBudget = normalizeBudget(budget);
  const dates = yearDates(year);
  const dateSet = new Set(dates);
  const holidays = holidayMap(year);
  const baseOff = (value: string) => isWeekend(value) || holidays.has(value);
  const normalizedAfter = dateSet.has(after) ? after : `${year}-01-01`;
  const firstIndex = dates.findIndex((value) => value >= normalizedAfter);
  const plans = new Map<string, LeavePlan>();

  for (let start = firstIndex; start < dates.length; start += 1) {
    const leaveDates: string[] = [];
    for (let end = start; end < Math.min(dates.length, start + 17); end += 1) {
      const value = dates[end] ?? "";
      if (!baseOff(value)) leaveDates.push(value);
      if (leaveDates.length > boundedBudget) break;
      if (leaveDates.length === 0) continue;

      let extendedStart = start;
      let extendedEnd = end;
      while (extendedStart > firstIndex && baseOff(dates[extendedStart - 1] ?? ""))
        extendedStart -= 1;
      while (extendedEnd + 1 < dates.length && baseOff(dates[extendedEnd + 1] ?? ""))
        extendedEnd += 1;
      const days = extendedEnd - extendedStart + 1;
      if (days < 3) continue;

      const selected = [...leaveDates];
      const key = `${dates[extendedStart]}:${dates[extendedEnd]}`;
      const plan = {
        start: dates[extendedStart] ?? "",
        end: dates[extendedEnd] ?? "",
        days,
        leaveDates: selected,
        holidayNames: unique(
          dates
            .slice(extendedStart, extendedEnd + 1)
            .map((date) => holidays.get(date)?.name ?? "")
            .filter(Boolean),
        ),
      };
      const existing = plans.get(key);
      if (!existing || plan.leaveDates.length < existing.leaveDates.length) plans.set(key, plan);
    }
  }

  return [...plans.values()]
    .sort(
      (left, right) =>
        right.days - left.days ||
        left.leaveDates.length - right.leaveDates.length ||
        left.start.localeCompare(right.start),
    )
    .slice(0, 6);
};

export const isSelectableLeaveDate = (year: SupportedYear, value: string) =>
  /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
  yearDates(year).includes(value) &&
  !isWeekend(value) &&
  !holidayMap(year).has(value);
