import { describe, expect, it, vi } from "vitest";
import { entriesThisMonth, monthStartIst, slaState, timerMinutes, weeklyHours, weekStartIst, marginPct, hoursFor } from "@/lib/rules";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ isUuid: () => true, rows: vi.fn(), tx: vi.fn(), one: vi.fn(), run: vi.fn(), asService: vi.fn(), currentContext: vi.fn() }));

describe("month and week boundaries use India time", () => {
  it("month starts at 00:00 IST on the 1st", () => {
    expect(monthStartIst(new Date("2026-11-09T10:00:00Z")).toISOString()).toBe("2026-10-31T18:30:00.000Z");
  });
  it("an entry at 00:30 IST on the 1st counts in the new month", () => {
    const now = new Date("2026-11-09T10:00:00Z");
    const inside = { at: "2026-10-31T19:00:00Z" };
    const outside = { at: "2026-10-31T18:00:00Z" };
    expect(entriesThisMonth([inside, outside], now)).toEqual([inside]);
  });
  it("week starts Monday IST", () => {
    expect(weekStartIst(new Date("2026-11-09T10:00:00Z")).toISOString()).toBe("2026-11-08T18:30:00.000Z");
  });
});

describe("weekly hours", () => {
  it("buckets into the right weeks, oldest first", () => {
    const now = new Date("2026-11-11T10:00:00Z");
    const w = weeklyHours([{ at: "2026-11-10T10:00:00Z", minutes: 60 }, { at: "2026-11-03T10:00:00Z", minutes: 30 }, { at: "2026-10-01T10:00:00Z", minutes: 600 }], 2, now);
    expect(w.map((x) => x.hours)).toEqual([0.5, 1]);
  });
});

describe("timer", () => {
  it("rounds to minutes, never under 1, never over 600", () => {
    const s = new Date("2026-11-09T10:00:00Z");
    expect(timerMinutes(s, new Date("2026-11-09T10:00:10Z"))).toBe(1);
    expect(timerMinutes(s, new Date("2026-11-09T10:45:00Z"))).toBe(45);
    expect(timerMinutes(s, new Date("2026-11-10T10:00:00Z"))).toBe(600);
  });
});

describe("sla state", () => {
  const now = new Date("2026-11-09T10:00:00Z");
  it("past, soon, ok", () => {
    expect(slaState({ slaAt: "2026-11-09T09:00:00Z", status: "doing" }, now)).toBe("past");
    expect(slaState({ slaAt: "2026-11-10T09:00:00Z", status: "doing" }, now)).toBe("soon");
    expect(slaState({ slaAt: "2026-11-12T09:00:00Z", status: "doing" }, now)).toBe("ok");
  });
});

describe("csv", () => {
  it("escapes formulas, quotes and commas", async () => {
    const { csvCell, hoursCsv } = await import("@/lib/ops");
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell(-3)).toBe("-3");
    const csv = hoursCsv([{ id: "1", name: "Shah family", planUsd: 79, hours: 2.25, budget: 6, margin: 77, breakEven: 20.5, over: false, late: 1, weeks: [{ weekStart: "2026-11-02T18:30:00.000Z", hours: 1.5 }] }]);
    expect(csv.split("\r\n")[0]).toContain("Hours this month");
    expect(csv.split("\r\n")[1]).toBe("Shah family,79,2.25,6,77,20.5,no,1,1.5");
  });
});

describe("margin updates with hours", () => {
  it("logging time lowers margin", () => {
    expect(marginPct(79, hoursFor([{ minutes: 60 }]))).toBeGreaterThan(marginPct(79, hoursFor([{ minutes: 600 }])));
  });
});
