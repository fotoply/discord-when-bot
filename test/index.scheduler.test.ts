import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Prevent dotenv from loading during tests
vi.doMock("dotenv/config", () => ({}));

describe("index scheduler and helper coverage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.DISCORD_TOKEN;
    vi.unmock("@sapphire/framework");
    vi.unmock("../src/util/reminders.js");
  });

  it("schedules hourly reminders: initial timeout then interval tick", async () => {
    process.env.DISCORD_TOKEN = "token";

    // Mock SapphireClient to avoid real side-effects
    vi.doMock("@sapphire/framework", () => ({
      SapphireClient: class {
        user = { tag: "bot#0001", id: "1" };
        login() {
          return Promise.resolve("ok");
        }
      },
    }));

    // Mock reminders util to observe calls
    const sendMock = vi.fn(async () => {});
    vi.doMock("../src/util/reminders.js", () => ({ sendReminders: sendMock }));

    // Import entry; this kicks off scheduleHourlyReminders
    const entry = await import("../src/index.js");

    // Let microtasks run (client.login then log)
    await Promise.resolve();

    // Run the initial setTimeout callback regardless of its computed delay
    vi.runOnlyPendingTimers();
    // The first sendReminders should have been called once (initial fire)
    expect(sendMock).toHaveBeenCalledTimes(1);

    // Allow the finally() to schedule setInterval
    await Promise.resolve();

    // Advance time by 1 hour to trigger one interval tick
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(sendMock).toHaveBeenCalledTimes(2);

    // Call exported helper without overrides to cover fallback branches
    await (entry as any).sendReminders();
    expect(sendMock).toHaveBeenCalledTimes(3);
  });
});
