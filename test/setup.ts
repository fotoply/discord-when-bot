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

// Export a helper to restore original exit if needed
export function restoreProcessExit() {
  Object.defineProperty(process, 'exit', { value: originalExit });
}

