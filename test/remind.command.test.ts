import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock decorators and framework Command base like other command tests
vi.mock("@sapphire/decorators", () => ({
  ApplyOptions: (_opts: any) => (target: any) => target,
}));
vi.mock("@sapphire/framework", () => ({
  Command: class Command {},
  ApplicationCommandRegistry: class {
    registerChatInputCommand() {}
  },
}));

// Mock sendReminders utility to observe calls
vi.mock("../src/util/reminders.js", () => {
  const fn = vi.fn(async () => {});
  return { sendReminders: fn };
});

import RemindCommand from "../src/commands/remind.js";
import { ReminderSettings, ChannelConfig } from "../src/store/config.js";

async function getSendRemindersMock() {
  const mod = await import("../src/util/reminders.js");
  return (mod as any).sendReminders as ReturnType<typeof vi.fn>;
}

describe("Remind command", () => {
  beforeEach(async () => {
    const send = await getSendRemindersMock();
    send.mockReset();
  });

  it("rejects non-admin users", async () => {
    const interaction: any = {
      options: { getSubcommand: () => "now" },
      member: { permissions: { has: () => false } },
      guild: { id: "g1" },
      channel: { id: "c1" },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    const thisArg: any = { isAdmin: () => false };
    await RemindCommand.prototype.chatInputRun.call(
      thisArg,
      interaction as any,
    );

    expect(interaction.reply).toHaveBeenCalled();
    const arg = (interaction.reply.mock.calls[0]![0] as any).content as string;
    expect(arg).toMatch(/Only an administrator/);
  });

  it("rejects when guild is missing", async () => {
    const interaction: any = {
      options: { getSubcommand: () => "now" },
      member: { permissions: { has: () => true } },
      guild: undefined,
      channel: { id: "c1" },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    const thisArg: any = { isAdmin: () => true };
    await RemindCommand.prototype.chatInputRun.call(
      thisArg,
      interaction as any,
    );
    const arg = (interaction.reply.mock.calls[0]![0] as any).content as string;
    expect(arg).toMatch(/must be used in a guild text channel/);
  });

  it("rejects when channel is missing", async () => {
    const interaction: any = {
      options: { getSubcommand: () => "now" },
      member: { permissions: { has: () => true } },
      guild: { id: "g" },
      channel: undefined,
      reply: vi.fn().mockResolvedValue(undefined),
    };

    const thisArg: any = { isAdmin: () => true };
    await RemindCommand.prototype.chatInputRun.call(
      thisArg,
      interaction as any,
    );
    const arg = (interaction.reply.mock.calls[0]![0] as any).content as string;
    expect(arg).toMatch(/must be used in a guild text channel/);
  });

  it("triggers reminders now in the current channel for admins", async () => {
    const interaction: any = {
      options: { getSubcommand: () => "now" },
      member: { permissions: { has: () => true } },
      guild: { id: "g2" },
      channel: { id: "chan-now" },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    const thisArg: any = { isAdmin: () => true, container: { client: {} } };

    await RemindCommand.prototype.chatInputRun.call(
      thisArg,
      interaction as any,
    );

    const sendReminders = await getSendRemindersMock();
    expect(sendReminders).toHaveBeenCalled();
    const args = sendReminders.mock.calls[0]!;
    expect(args[2]).toEqual({ channelId: "chan-now", force: true });
    const replyArg = (interaction.reply.mock.calls[0]![0] as any)
      .content as string;
    expect(replyArg).toMatch(/Triggered reminders/);
  });

  it("uses deferReply and editReply when available", async () => {
    const interaction: any = {
      options: { getSubcommand: () => "now" },
      member: { permissions: { has: () => true } },
      guild: { id: "g2" },
      channel: { id: "chan-defer" },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
    };

    const thisArg: any = { isAdmin: () => true, container: { client: {} } };

    await RemindCommand.prototype.chatInputRun.call(
      thisArg,
      interaction as any,
    );

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it("shows and updates per-channel config", async () => {
    const guildId = "g3";
    const channelId = "chan-conf";

    // Ensure clean slate even if a previous test run left persisted values
    for (const key of [
      "reminders.enabled",
      "reminders.intervalHours",
      "reminders.lastSent",
      "reminders.startTime",
    ]) {
      ChannelConfig.delete(guildId, channelId, key);
    }
    // Explicitly set defaults for this test to avoid flakiness across runs
    ReminderSettings.setEnabled(guildId, channelId, true);
    ReminderSettings.setIntervalHours(guildId, channelId, 24);

    const baseInteraction: any = {
      member: { permissions: { has: () => true } },
      guild: { id: guildId },
      channel: { id: channelId },
      reply: vi.fn().mockResolvedValue(undefined),
      options: {
        getSubcommand: () => "config",
        getString: (_: string) => null,
        getInteger: (_: string) => undefined,
      },
    };

    const thisArg: any = { isAdmin: () => true };

    // Show current defaults
    await RemindCommand.prototype.chatInputRun.call(
      thisArg,
      baseInteraction as any,
    );
    let content = (baseInteraction.reply.mock.calls[0]![0] as any)
      .content as string;
    expect(content).toContain("enabled: true");
    expect(content).toContain("intervalHours: 24");

    // Update enabled=false and interval=12
    const updateInteraction: any = {
      ...baseInteraction,
      reply: vi.fn().mockResolvedValue(undefined),
      options: {
        getSubcommand: () => "config",
        getString: (name: string) => (name === "enabled" ? "false" : null),
        getInteger: (_: string) => 12,
      },
    };

    await RemindCommand.prototype.chatInputRun.call(
      thisArg,
      updateInteraction as any,
    );
    content = (updateInteraction.reply.mock.calls[0]![0] as any)
      .content as string;
    expect(content).toContain("enabled: false");
    expect(content).toContain("intervalHours: 12");

    // Verify persisted values via ReminderSettings
    const cfg = ReminderSettings.get(guildId, channelId);
    expect(cfg.enabled).toBe(false);
    expect(cfg.intervalHours).toBe(12);
  });

  it("sets and clears start_time", async () => {
    const guildId = "g4";
    const channelId = "chan-timeconf";

    // Clean slate
    for (const key of [
      "reminders.enabled",
      "reminders.intervalHours",
      "reminders.lastSent",
      "reminders.startTime",
    ]) {
      ChannelConfig.delete(guildId, channelId, key);
    }

    const thisArg: any = { isAdmin: () => true };

    // Set start_time to 10:00
    const setInteraction: any = {
      member: { permissions: { has: () => true } },
      guild: { id: guildId },
      channel: { id: channelId },
      reply: vi.fn().mockResolvedValue(undefined),
      options: {
        getSubcommand: () => "config",
        getString: (name: string) => (name === "start_time" ? "10:00" : null),
        getInteger: (_: string) => undefined,
      },
    };

    await RemindCommand.prototype.chatInputRun.call(
      thisArg,
      setInteraction as any,
    );
    let content = (setInteraction.reply.mock.calls[0]![0] as any)
      .content as string;
    expect(content).toContain("startTime: 10:00");

    // Clear start_time
    const clearInteraction: any = {
      ...setInteraction,
      reply: vi.fn().mockResolvedValue(undefined),
      options: {
        getSubcommand: () => "config",
        getString: (name: string) => (name === "start_time" ? "clear" : null),
        getInteger: (_: string) => undefined,
      },
    };

    await RemindCommand.prototype.chatInputRun.call(
      thisArg,
      clearInteraction as any,
    );
    content = (clearInteraction.reply.mock.calls[0]![0] as any)
      .content as string;
    expect(content).not.toContain("startTime:");

    const cfg = ReminderSettings.get(guildId, channelId);
    expect(cfg.startTime).toBeUndefined();
  });

  it("shows config when enabled=show or start_time=show provided", async () => {
    const guildId = "g5";
    const channelId = "chan-show";
    ReminderSettings.setEnabled(guildId, channelId, true);
    ReminderSettings.setIntervalHours(guildId, channelId, 24);

    const thisArg: any = { isAdmin: () => true };

    // enabled=show
    const showEnabled: any = {
      member: { permissions: { has: () => true } },
      guild: { id: guildId },
      channel: { id: channelId },
      reply: vi.fn().mockResolvedValue(undefined),
      options: {
        getSubcommand: () => "config",
        getString: (name: string) => (name === "enabled" ? "show" : null),
        getInteger: (_: string) => undefined,
      },
    };
    await RemindCommand.prototype.chatInputRun.call(
      thisArg,
      showEnabled as any,
    );
    let content = (showEnabled.reply.mock.calls[0]![0] as any)
      .content as string;
    expect(content).toContain("Current reminder settings");

    // start_time=show
    const showStart: any = {
      ...showEnabled,
      reply: vi.fn().mockResolvedValue(undefined),
      options: {
        getSubcommand: () => "config",
        getString: (name: string) => (name === "start_time" ? "show" : null),
        getInteger: (_: string) => undefined,
      },
    };
    await RemindCommand.prototype.chatInputRun.call(thisArg, showStart as any);
    content = (showStart.reply.mock.calls[0]![0] as any).content as string;
    expect(content).toContain("Current reminder settings");
  });

  it("rejects invalid start_time format and non-zero minutes", async () => {
    const guildId = "g6";
    const channelId = "chan-invalid-time";

    const thisArg: any = { isAdmin: () => true };

    const badFormat: any = {
      member: { permissions: { has: () => true } },
      guild: { id: guildId },
      channel: { id: channelId },
      reply: vi.fn().mockResolvedValue(undefined),
      options: {
        getSubcommand: () => "config",
        getString: (name: string) => (name === "start_time" ? "25:99" : null),
        getInteger: (_: string) => undefined,
      },
    };

    await RemindCommand.prototype.chatInputRun.call(thisArg, badFormat as any);
    let content = (badFormat.reply.mock.calls[0]![0] as any).content as string;
    expect(content).toMatch(/must be in HH:mm/);

    const badMinutes: any = {
      ...badFormat,
      reply: vi.fn().mockResolvedValue(undefined),
      options: {
        getSubcommand: () => "config",
        getString: (name: string) => (name === "start_time" ? "09:30" : null),
        getInteger: (_: string) => undefined,
      },
    };

    await RemindCommand.prototype.chatInputRun.call(thisArg, badMinutes as any);
    content = (badMinutes.reply.mock.calls[0]![0] as any).content as string;
    expect(content).toMatch(/minutes must be :00/);
  });

  it("clamps interval_hours to at least 1", async () => {
    const guildId = "g7";
    const channelId = "chan-interval-clamp";

    const thisArg: any = { isAdmin: () => true };
    const zeroInterval: any = {
      member: { permissions: { has: () => true } },
      guild: { id: guildId },
      channel: { id: channelId },
      reply: vi.fn().mockResolvedValue(undefined),
      options: {
        getSubcommand: () => "config",
        getString: (_: string) => null,
        getInteger: (_: string) => 0,
      },
    };

    await RemindCommand.prototype.chatInputRun.call(
      thisArg,
      zeroInterval as any,
    );
    const content = (zeroInterval.reply.mock.calls[0]![0] as any)
      .content as string;
    expect(content).toContain("intervalHours: 1");
  });

  it("isAdmin internal logic returns false when member or permissions invalid", async () => {
    const interaction: any = {
      options: { getSubcommand: () => "now" },
      member: undefined,
      guild: { id: "g" },
      channel: { id: "c" },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    // Use the real isAdmin method from the prototype to exercise its branches
    const thisArg: any = { isAdmin: (RemindCommand.prototype as any).isAdmin };
    await RemindCommand.prototype.chatInputRun.call(
      thisArg,
      interaction as any,
    );

    const arg = (interaction.reply.mock.calls[0]![0] as any).content as string;
    expect(arg).toMatch(/Only an administrator/);
  });

  it("registerApplicationCommands registers builder and respects GUILD_ID", async () => {
    // Capture builder function and options passed
    const registry = { registerChatInputCommand: vi.fn() } as any;

    // Without GUILD_ID
    delete process.env.GUILD_ID;
    RemindCommand.prototype.registerApplicationCommands.call(
      { name: "remind", description: "desc" },
      registry,
    );
    expect(registry.registerChatInputCommand).toHaveBeenCalled();
    const [builderFn, opt] = registry.registerChatInputCommand.mock.calls[0]!;
    expect(opt).toBeUndefined();

    // Exercise the builder chain to improve coverage
    const chain: any = {
      setName: vi.fn().mockReturnThis(),
      setDescription: vi.fn().mockReturnThis(),
      addSubcommand: vi.fn((fn: any) => {
        fn(chain);
        return chain;
      }),
      addStringOption: vi.fn((fn: any) => {
        fn({
          setName: vi.fn().mockReturnThis(),
          setDescription: vi.fn().mockReturnThis(),
          setRequired: vi.fn().mockReturnThis(),
          addChoices: vi.fn().mockReturnThis(),
        });
        return chain;
      }),
      addIntegerOption: vi.fn((fn: any) => {
        fn({
          setName: vi.fn().mockReturnThis(),
          setDescription: vi.fn().mockReturnThis(),
          setRequired: vi.fn().mockReturnThis(),
        });
        return chain;
      }),
    };
    builderFn(chain);
    expect(chain.setName).toHaveBeenCalledWith("remind");

    // With GUILD_ID
    registry.registerChatInputCommand.mockClear();
    process.env.GUILD_ID = "guild-123";
    RemindCommand.prototype.registerApplicationCommands.call(
      { name: "remind", description: "desc" },
      registry,
    );
    const [, opt2] = registry.registerChatInputCommand.mock.calls[0]!;
    expect(opt2).toEqual({ guildIds: ["guild-123"] });
    delete process.env.GUILD_ID;
  });

  it("replies Unknown subcommand for unexpected subcommand names", async () => {
    const interaction: any = {
      options: { getSubcommand: () => "bogus" },
      member: { permissions: { has: () => true } },
      guild: { id: "gX" },
      channel: { id: "cX" },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    const thisArg: any = { isAdmin: () => true };
    await RemindCommand.prototype.chatInputRun.call(
      thisArg,
      interaction as any,
    );

    expect(interaction.reply).toHaveBeenCalled();
    const msg = (interaction.reply.mock.calls[0]![0] as any).content as string;
    expect(msg).toMatch(/Unknown subcommand/);
  });
});
