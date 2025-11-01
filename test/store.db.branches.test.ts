import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const originalEnv = { ...process.env };

function freshImport<T = any>(modulePath: string): Promise<T> {
  vi.resetModules();
  return import(modulePath) as any;
}

describe.sequential("store/db branches", () => {
  beforeEach(() => {
    // restore env before each test
    Object.assign(process.env, originalEnv);
  });
  afterEach(() => {
    // restore env after each test
    Object.assign(process.env, originalEnv);
  });

  it("uses default db path when WHEN_DB_PATH is not set (RHS of ||)", async () => {
    const prev = process.env.WHEN_DB_PATH;
    delete process.env.WHEN_DB_PATH;

    const mod = await freshImport("../src/store/db.js");
    const db = (mod as any).db;
    expect(db).toBeDefined();

    // default path should be under data/when.db
    const defaultPath = path.join(process.cwd(), "data", "when.db");
    expect(fs.existsSync(defaultPath)).toBe(true);

    try {
      if (db && typeof db.close === "function") db.close();
    } catch {}

    // restore env
    if (prev !== undefined) process.env.WHEN_DB_PATH = prev;
    else delete process.env.WHEN_DB_PATH;
  });

  it("creates parent directory when it does not exist (mkdir branch)", async () => {
    const tmpDir = path.join(
      process.cwd(),
      "test-data",
      `isolated-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const tmpDb = path.join(tmpDir, "when.temp.db");

    // ensure directory does not exist
    try {
      if (fs.existsSync(tmpDir))
        fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
    expect(fs.existsSync(tmpDir)).toBe(false);

    process.env.WHEN_DB_PATH = tmpDb;

    const mod = await freshImport("../src/store/db.js");
    const db = (mod as any).db;

    // directory should have been created and file should exist
    expect(fs.existsSync(tmpDir)).toBe(true);
    expect(fs.existsSync(tmpDb)).toBe(true);

    try {
      if (db && typeof db.close === "function") db.close();
    } catch {}
    try {
      if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);
    } catch {}
    try {
      if (fs.existsSync(tmpDir))
        fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("does not attempt to create directory when it already exists (no-mkdir branch)", async () => {
    const existingDir = path.join(process.cwd(), "test-data");
    const tempDb = path.join(existingDir, `when.already.${process.pid}.db`);

    // ensure parent dir exists
    try {
      if (!fs.existsSync(existingDir))
        fs.mkdirSync(existingDir, { recursive: true });
    } catch {}

    process.env.WHEN_DB_PATH = tempDb;

    const mod = await freshImport("../src/store/db.js");
    const db = (mod as any).db;

    // Existing directory remains and DB file exists
    expect(fs.existsSync(existingDir)).toBe(true);
    expect(fs.existsSync(tempDb)).toBe(true);

    try {
      if (db && typeof db.close === "function") db.close();
    } catch {}
    try {
      if (fs.existsSync(tempDb)) fs.unlinkSync(tempDb);
    } catch {}
  });
});
