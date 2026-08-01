import { describe, expect, it } from "vitest";

import {
  HOLIDAYS,
  isSelectableLeaveDate,
  normalizeBudget,
  normalizeYear,
  recommendLeavePlans,
  yearDates,
} from "../src/domain/calendar";

describe("holiday planning domain", () => {
  it("contains every official holiday and statutory holiday in the published years", () => {
    expect(HOLIDAYS[2026]).toHaveLength(18);
    expect(HOLIDAYS[2027]).toHaveLength(17);
    expect(HOLIDAYS[2026]).toContainEqual({
      date: "2026-09-22",
      name: "休日",
      note: "祝日法第3条第3項による休日",
    });
    expect(HOLIDAYS[2027]).toContainEqual({
      date: "2027-03-22",
      name: "休日",
      note: "振替休日",
    });
  });

  it("builds valid leap-aware year ranges", () => {
    expect(yearDates(2026)).toHaveLength(365);
    expect(yearDates(2026).at(0)).toBe("2026-01-01");
    expect(yearDates(2027).at(-1)).toBe("2027-12-31");
  });

  it("normalizes the supported year and bounded leave budget", () => {
    expect(normalizeYear(2027)).toBe(2027);
    expect(normalizeYear(2030)).toBe(2026);
    expect(normalizeBudget(0)).toBe(1);
    expect(normalizeBudget(9)).toBe(5);
    expect(normalizeBudget("3.9")).toBe(3);
    expect(normalizeBudget("unknown")).toBe(2);
  });

  it("accepts only real working weekdays in the selected year", () => {
    expect(isSelectableLeaveDate(2026, "2026-04-30")).toBe(true);
    expect(isSelectableLeaveDate(2026, "2026-05-03")).toBe(false);
    expect(isSelectableLeaveDate(2026, "2026-05-06")).toBe(false);
    expect(isSelectableLeaveDate(2026, "2026-99-99")).toBe(false);
    expect(isSelectableLeaveDate(2026, "2027-04-30")).toBe(false);
  });

  it("finds the September 2026 bridge with two leave days", () => {
    const plans = recommendLeavePlans(2026, 2, "2026-09-01");
    expect(plans[0]).toMatchObject({
      start: "2026-09-19",
      end: "2026-09-27",
      days: 9,
      leaveDates: ["2026-09-24", "2026-09-25"],
    });
    expect(plans[0]?.holidayNames).toEqual(["敬老の日", "休日", "秋分の日"]);
  });

  it("finds the 2027 Golden Week bridge and safely resets an invalid start date", () => {
    const goldenWeek = recommendLeavePlans(2027, 2, "2027-04-01");
    expect(goldenWeek).toContainEqual({
      start: "2027-05-01",
      end: "2027-05-09",
      days: 9,
      leaveDates: ["2027-05-06", "2027-05-07"],
      holidayNames: ["憲法記念日", "みどりの日", "こどもの日"],
    });
    expect(recommendLeavePlans(2027, 1, "2027-99-99").length).toBeGreaterThan(0);
  });
});
