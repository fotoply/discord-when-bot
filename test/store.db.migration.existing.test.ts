import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("store/db migration when view_mode already exists", () => {
  it("no-ops when re-imported on the same DB path", async () => {
    vi.resetModules();
    const tmp = path.join(
      process.cwd(),
      "test-data",
      `when.test.reimport.${Date.now()}.db`,
    );
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {}
    process.env.WHEN_DB_PATH = tmp;

    // First import should create tables and add view_mode
    const mod1 = await import("../src/store/db.js");
    const { db } = mod1 as any;
    const cols1 = db.prepare("PRAGMA table_info(polls)").all() as Array<{
      name: string;
    }>;
    expect(cols1.some((c) => c.name === "view_mode")).toBe(true);

    // Re-import module; migration should detect column and not attempt ALTER again
    vi.resetModules();
    process.env.WHEN_DB_PATH = tmp;
    const mod2 = await import("../src/store/db.js");
    const db2 = (mod2 as any).db;
    const cols2 = db2.prepare("PRAGMA table_info(polls)").all() as Array<{
      name: string;
    }>;
    expect(cols2.some((c) => c.name === "view_mode")).toBe(true);
  });
});
