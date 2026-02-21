import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase before importing store
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => ({ data: [], error: null }) }),
    }),
    channel: () => ({
      on: () => ({ on: () => ({ on: () => ({ on: () => ({ subscribe: vi.fn() }) }) }) }),
    }),
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  },
}));

vi.mock("@/lib/files", () => ({
  deleteProjectFiles: vi.fn(),
}));

import { parseTaskInput } from "@/lib/store";

describe("parseTaskInput", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-21T12:00:00Z"));
  });

  it("parses a plain title", () => {
    const result = parseTaskInput("Fix login bug");
    expect(result.title).toBe("Fix login bug");
  });

  it("preserves original text when title would be empty after parsing", () => {
    const result = parseTaskInput("due today");
    // The title should fall back to original text since stripping "due today" leaves empty
    expect(result.title).toBeTruthy();
    expect(result.due_at).toBeDefined();
  });

  it("parses 'due today'", () => {
    const result = parseTaskInput("Fix bug due today");
    expect(result.title).toBe("Fix bug");
    expect(result.due_at).toBeDefined();
    const date = new Date(result.due_at!);
    expect(date.getDate()).toBe(21);
    expect(date.getHours()).toBe(17);
  });

  it("parses 'due tomorrow'", () => {
    const result = parseTaskInput("Fix bug due tomorrow");
    expect(result.title).toBe("Fix bug");
    const date = new Date(result.due_at!);
    expect(date.getDate()).toBe(22);
  });

  it("parses 'due in N days'", () => {
    const result = parseTaskInput("Fix bug due in 3 days");
    expect(result.title).toBe("Fix bug");
    const date = new Date(result.due_at!);
    expect(date.getDate()).toBe(24);
  });

  it("cleans trailing commas from title", () => {
    const result = parseTaskInput("Fix bug, due today");
    expect(result.title).not.toMatch(/,\s*$/);
  });

  it("collapses multiple spaces", () => {
    const result = parseTaskInput("Fix   the   bug");
    expect(result.title).toBe("Fix the bug");
  });

  it("trims whitespace", () => {
    const result = parseTaskInput("  Fix bug  ");
    expect(result.title).toBe("Fix bug");
  });
});
