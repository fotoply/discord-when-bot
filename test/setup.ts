// Test setup: stub process.exit so tests can detect calls without terminating the runner
const originalExit = process.exit;
Object.defineProperty(process, 'exit', {
  configurable: true,
  value: (code?: number) => {
    (global as any).__process_exit_called = true;
    (global as any).__process_exit_code = code;
    // don't actually exit in tests
    return undefined as never;
  },
});

// Ensure each test worker uses an isolated sqlite database file
import path from 'node:path';
const workerId = process.env.VITEST_WORKER_ID; // provided by Vitest when using threads
const testDbPath = path.join(
  process.cwd(),
  'test-data',
  `when.test.${workerId ?? process.pid}.db`,
);
process.env.WHEN_DB_PATH = process.env.WHEN_DB_PATH || testDbPath;

// Export a helper to restore original exit if needed
export function restoreProcessExit() {
  Object.defineProperty(process, 'exit', { value: originalExit });
}
