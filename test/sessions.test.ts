import { describe, expect, it } from "vitest";
import { Sessions } from "../src/store/sessions.js";

describe("Sessions store", () => {
  it("stores, retrieves, and clears first date", () => {
    const uid = "user1";
    expect(Sessions.getFirst(uid)).toBeUndefined();
    Sessions.setFirst(uid, "2025-08-30");
    expect(Sessions.getFirst(uid)).toBe("2025-08-30");
    Sessions.clear(uid);
    expect(Sessions.getFirst(uid)).toBeUndefined();
  });
});
