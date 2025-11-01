// filepath: test/when.command.test.ts
import { describe, expect, it, vi } from "vitest";
import WhenCommand from "../src/commands/when.js";
// Mock decorators and framework Command before importing
vi.mock("@sapphire/decorators", () => ({
  ApplyOptions: (_opts: any) => (target: any) => target,
}));
vi.mock("@sapphire/framework", () => ({
  Command: class Command {},
}));

describe("When command", () => {
  it("replies with two select components (first, last) and logs activity", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const interaction: any = {
      guildId: "g-when",
      channel: { id: "c-when" },
      options: { getRole: vi.fn(() => null) },
      user: { id: "user-1" },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    // call the command method directly
    await WhenCommand.prototype.chatInputRun.call(
      { name: "when" } as any,
      interaction as any,
    );

    expect(interaction.reply).toHaveBeenCalled();
    const arg = interaction.reply.mock.calls[0][0];
    expect(arg.content).toContain("Select a date range");
    expect(Array.isArray(arg.components)).toBe(true);
    // there should be two rows (first, last)
    expect(arg.components.length).toBe(2);

    // Should have logged with the [when] prefix
    const hadWhenLog = (logSpy.mock.calls as any[]).some(
      (args) => args[0] === "[when]",
    );
    expect(hadWhenLog).toBe(true);

    logSpy.mockRestore();
  });
});
