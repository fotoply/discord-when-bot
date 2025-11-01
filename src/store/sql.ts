// Centralized typed helpers over better-sqlite3 for stronger row typing
import { db } from "./db.js";

// Return a single row cast to T (or undefined). Callers define T per-query.
export function queryOne<T>(sql: string, ...params: any[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

// Return all rows cast to T[]. Callers define T per-query.
export function queryAll<T>(sql: string, ...params: any[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

// Execute a statement without caring about return payload.
export function exec(sql: string, ...params: any[]): void {
  db.prepare(sql).run(...params);
}
