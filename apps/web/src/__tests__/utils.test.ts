import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatDue, isDueToday, isOverdue, STATUS_COLORS, STATUS_LABELS, ACCENT_COLORS } from "@/lib/utils";

describe("formatDue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-21T12:00:00Z"));
  });

  it("returns empty string for undefined", () => {
    expect(formatDue(undefined)).toBe("");
  });

  it("returns 'Overdue' for dates in the past within 1 day", () => {
    expect(formatDue("2026-02-21T08:00:00Z")).toBe("Overdue");
  });

  it("returns 'Xd overdue' for dates more than 1 day past", () => {
    expect(formatDue("2026-02-18T12:00:00Z")).toBe("3d overdue");
  });

  it("returns '< 1h' for less than an hour ahead", () => {
    expect(formatDue("2026-02-21T12:30:00Z")).toBe("< 1h");
  });

  it("returns hours for same-day future", () => {
    expect(formatDue("2026-02-21T18:00:00Z")).toBe("6h");
  });

  it("returns 'Tomorrow' for 1 day ahead", () => {
    expect(formatDue("2026-02-22T17:00:00Z")).toBe("Tomorrow");
  });

  it("returns 'Xd' for 2-6 days ahead", () => {
    expect(formatDue("2026-02-25T12:00:00Z")).toBe("4d");
  });

  it("returns formatted date for 7+ days ahead", () => {
    const result = formatDue("2026-03-15T12:00:00Z");
    expect(result).toMatch(/Mar\s+15/);
  });

  it("uses floor instead of round for hours", () => {
    // 29 minutes ahead should be "< 1h", not "1h"
    expect(formatDue("2026-02-21T12:29:00Z")).toBe("< 1h");
  });
});

describe("isDueToday", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-21T12:00:00Z"));
  });

  it("returns false for undefined", () => {
    expect(isDueToday(undefined)).toBe(false);
  });

  it("returns true for today", () => {
    expect(isDueToday("2026-02-21T17:00:00Z")).toBe(true);
  });

  it("returns false for tomorrow", () => {
    expect(isDueToday("2026-02-22T12:00:00Z")).toBe(false);
  });

  it("returns false for yesterday", () => {
    expect(isDueToday("2026-02-20T12:00:00Z")).toBe(false);
  });
});

describe("isOverdue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-21T12:00:00Z"));
  });

  it("returns false for undefined", () => {
    expect(isOverdue(undefined)).toBe(false);
  });

  it("returns true for past dates", () => {
    expect(isOverdue("2026-02-20T12:00:00Z")).toBe(true);
  });

  it("returns false for future dates", () => {
    expect(isOverdue("2026-02-22T12:00:00Z")).toBe(false);
  });
});

describe("STATUS_COLORS", () => {
  it("has all four statuses", () => {
    expect(STATUS_COLORS.backlog).toBe("#9E9E9E");
    expect(STATUS_COLORS.doing).toBe("#00BCD4");
    expect(STATUS_COLORS.waiting).toBe("#FFD600");
    expect(STATUS_COLORS.done).toBe("#4CAF50");
  });
});

describe("STATUS_LABELS", () => {
  it("has human-readable labels", () => {
    expect(STATUS_LABELS.backlog).toBe("Backlog");
    expect(STATUS_LABELS.doing).toBe("Doing");
    expect(STATUS_LABELS.waiting).toBe("Waiting");
    expect(STATUS_LABELS.done).toBe("Done");
  });
});

describe("ACCENT_COLORS", () => {
  it("has 10 colors", () => {
    expect(ACCENT_COLORS).toHaveLength(10);
  });

  it("starts with cyan", () => {
    expect(ACCENT_COLORS[0]).toBe("#00BCD4");
  });
});
