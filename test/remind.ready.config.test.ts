import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ConfigCommand from "../src/commands/config.js";
import { ReadyNotifySettings } from "../src/store/config.js";

vi.mock("@sapphire/decorators", () => ({
  ApplyOptions: (_opts: any) => (target: any) => target,
}));
vi.mock("@sapphire/framework", () => ({
  Command: class Command {},
  ApplicationCommandRegistry: class {
    registerChatInputCommand() {}
  },
}));

function makeInteraction(overrides?: Partial<any>) {
  const base = {
    options: {
      getSubcommand: () => "ready",
      getString: (name: string) => {
        if (name === "action") return "show";
        if (name === "enabled") return undefined;
        if (name === "delay") return undefined;
        return undefined;
      },
      getInteger: () => undefined,
    },
    member: { permissions: { has: () => true } },
    guild: { id: "g1" },
    channel: { id: "c1" },
    reply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  };
  return Object.assign(base, overrides);
}

describe("/config ready", () => {
  beforeEach(() => {
    // Clear any pre-existing settings for this test channel
    ReadyNotifySettings.setEnabled("g1", "c1", true);
    ReadyNotifySettings.setDelayMs("g1", "c1", 300000);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows current settings when no args are provided", async () => {
    const interaction = makeInteraction();
    await ConfigCommand.prototype.chatInputRun.call({}, interaction as any);
    const call = (interaction.reply as any).mock.calls[0][0];
    expect(call.content).toContain("enabled");
    expect(call.content).toContain("delay: 5 minute(s)");
  });

  it("parses human-friendly delay strings and defaults to minutes when unit missing", async () => {
    const interactions: any[] = [
      makeInteraction({
        options: {
          getSubcommand: () => "ready",
          getString: (name: string) => {
            if (name === "action") return "set";
            return name === "delay" ? "5" : undefined;
          },
          getInteger: () => undefined,
        },
      }),
      makeInteraction({
        options: {
          getSubcommand: () => "ready",
          getString: (name: string) => {
            if (name === "action") return "set";
            return name === "delay" ? "30s" : undefined;
          },
          getInteger: () => undefined,
        },
      }),
      makeInteraction({
        options: {
          getSubcommand: () => "ready",
          getString: (name: string) => {
            if (name === "action") return "set";
            return name === "delay" ? "1h" : undefined;
          },
          getInteger: () => undefined,
        },
      }),
    ];

    // Execute each and check updated setting
    await ConfigCommand.prototype.chatInputRun.call({}, interactions[0] as any);
    expect(ReadyNotifySettings.get("g1", "c1").delayMs).toBe(5 * 60 * 1000);

    await ConfigCommand.prototype.chatInputRun.call({}, interactions[1] as any);
    expect(ReadyNotifySettings.get("g1", "c1").delayMs).toBe(30 * 1000);

    await ConfigCommand.prototype.chatInputRun.call({}, interactions[2] as any);
    expect(ReadyNotifySettings.get("g1", "c1").delayMs).toBe(60 * 60 * 1000);
  });

  it("updates enabled flag", async () => {
    const interaction = makeInteraction({
      options: {
        getSubcommand: () => "ready",
        getString: (name: string) => {
          if (name === "action") return "set";
          return name === "enabled" ? "false" : undefined;
        },
        getInteger: () => undefined,
      },
    });
    await ConfigCommand.prototype.chatInputRun.call({}, interaction as any);
    expect(ReadyNotifySettings.get("g1", "c1").enabled).toBe(false);
  });

  it("rejects invalid delay", async () => {
    const interaction = makeInteraction({
      options: {
        getSubcommand: () => "ready",
        getString: (name: string) => {
          if (name === "action") return "set";
          return name === "delay" ? "abc" : undefined;
        },
        getInteger: () => undefined,
      },
    });
    await ConfigCommand.prototype.chatInputRun.call({}, interaction as any);
    const arg = interaction.reply.mock.calls[0]![0];
    expect(arg.content).toMatch(/Invalid delay/);
  });
});
