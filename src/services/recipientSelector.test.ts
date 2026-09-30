import { describe, test, expect } from "vitest";
import { selectRecipients, type Candidate } from "./recipientSelector";

// Builds a candidate with defaults.
function candidate(id: string, over: Partial<Candidate> = {}): Candidate {
  return { id, isBot: false, roleIds: [], joinedAt: 0, ...over };
}

describe("selectRecipients", () => {
  test("removes bots and the sender", () => {
    const result = selectRecipients({
      candidates: [
        candidate("bot", { isBot: true }),
        candidate("sender"),
        candidate("member"),
      ],
      senderId: "sender",
      excludedRoleIds: [],
      limit: 250,
      lastActive: () => 0,
    });
    expect(result.recipients.map((c) => c.id)).toEqual(["member"]);
    expect(result.senderSkipped).toBe(true);
  });

  test("removes excluded-role members and counts them", () => {
    const result = selectRecipients({
      candidates: [
        candidate("staff", { roleIds: ["excluded"] }),
        candidate("member"),
      ],
      senderId: "sender",
      excludedRoleIds: ["excluded"],
      limit: 250,
      lastActive: () => 0,
    });
    expect(result.recipients.map((c) => c.id)).toEqual(["member"]);
    expect(result.excludedCount).toBe(1);
    expect(result.eligibleCount).toBe(1);
  });

  test("excluded members do not use up capacity (limit carries to next eligible)", () => {
    const result = selectRecipients({
      candidates: [
        candidate("staff", { roleIds: ["excluded"], joinedAt: 100 }),
        candidate("a", { joinedAt: 90 }),
        candidate("b", { joinedAt: 80 }),
      ],
      senderId: "sender",
      excludedRoleIds: ["excluded"],
      limit: 2,
      lastActive: () => 0,
    });
    // staff removed first, so both a and b are picked (not just a).
    expect(result.recipients.map((c) => c.id)).toEqual(["a", "b"]);
  });

  test("orders by most recent activity", () => {
    const activity: Record<string, number> = { a: 100, b: 300, c: 200 };
    const result = selectRecipients({
      candidates: [candidate("a"), candidate("b"), candidate("c")],
      senderId: "sender",
      excludedRoleIds: [],
      limit: 250,
      lastActive: (id) => activity[id] ?? 0,
    });
    expect(result.recipients.map((c) => c.id)).toEqual(["b", "c", "a"]);
  });

  test("members with no activity fall back to most recent join date", () => {
    const result = selectRecipients({
      candidates: [
        candidate("old", { joinedAt: 100 }),
        candidate("new", { joinedAt: 300 }),
        candidate("mid", { joinedAt: 200 }),
      ],
      senderId: "sender",
      excludedRoleIds: [],
      limit: 250,
      lastActive: () => 0,
    });
    expect(result.recipients.map((c) => c.id)).toEqual(["new", "mid", "old"]);
  });

  test("members with activity come before those without", () => {
    const result = selectRecipients({
      candidates: [
        candidate("inactive", { joinedAt: 999 }),
        candidate("active", { joinedAt: 1 }),
      ],
      senderId: "sender",
      excludedRoleIds: [],
      limit: 250,
      lastActive: (id) => (id === "active" ? 50 : 0),
    });
    expect(result.recipients.map((c) => c.id)).toEqual(["active", "inactive"]);
  });

  test("orders stably by ID on a full tie", () => {
    const result = selectRecipients({
      candidates: [candidate("z"), candidate("a"), candidate("m")],
      senderId: "sender",
      excludedRoleIds: [],
      limit: 250,
      lastActive: () => 0,
    });
    expect(result.recipients.map((c) => c.id)).toEqual(["a", "m", "z"]);
  });

  test("respects a limit of 1", () => {
    const result = selectRecipients({
      candidates: [candidate("a"), candidate("b")],
      senderId: "sender",
      excludedRoleIds: [],
      limit: 1,
      lastActive: (id) => (id === "a" ? 100 : 50),
    });
    expect(result.recipients).toHaveLength(1);
    expect(result.recipients[0].id).toBe("a");
  });

  test("respects a limit of 250", () => {
    const many = Array.from({ length: 300 }, (_, i) =>
      candidate(`u${String(i).padStart(3, "0")}`, { joinedAt: i }),
    );
    const result = selectRecipients({
      candidates: many,
      senderId: "sender",
      excludedRoleIds: [],
      limit: 250,
      lastActive: () => 0,
    });
    expect(result.recipients).toHaveLength(250);
    expect(result.eligibleCount).toBe(300);
  });
});
