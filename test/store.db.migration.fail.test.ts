import { describe, it, expect, vi } from "vitest";

// This test simulates a failure during the migration PRAGMA read to cover the catch branch
// in src/store/db.ts. We mock better-sqlite3 before importing the module.

describe("store/db migration failure path", () => {
  it("swallows errors when PRAGMA table_info fails", async () => {
    vi.resetModules();
    vi.doMock("better-sqlite3", () => {
      class FakeStmt {
        all() {
          throw new Error("pragma failed");
        }
        run() {
          return;
        }
      }
      class FakeDB {
        constructor(_p: string) {}
        pragma(_q: string) {
          return 1 as any;
        }
        exec(_s: string) {
          return;
        }
        prepare(sql: string) {
          if (/PRAGMA\s+table_info/i.test(sql)) return new FakeStmt() as any;
          return new FakeStmt() as any;
        }
      }
      return { __esModule: true, default: FakeDB } as any;
    });

    const mod = await import("../src/store/db.js");
    const { db } = mod as any;
    // basic sanity: db is defined and exposes expected methods
    expect(db).toBeDefined();
    expect(typeof db.prepare).toBe("function");
  });
});
