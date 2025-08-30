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

// Prevent real network login to Discord during tests by stubbing Client.login
// We do this here so it applies before any modules that construct a discord client are imported.
try {
  // Importing only for side-effects; TypeScript will allow this in test environment
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const discord = require('discord.js');
  if (discord && discord.Client && !(discord.Client.prototype as any).__mock_login_applied) {
    (discord.Client.prototype as any).__original_login = discord.Client.prototype.login;
    (discord.Client.prototype as any).login = function (_token?: string) {
      // resolve immediately to avoid network calls during tests
      return Promise.resolve('ok');
    };
    (discord.Client.prototype as any).__mock_login_applied = true;
  }
} catch (e) {
  // If discord.js isn't available at setup time, tests that need it will mock as necessary.
}

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
