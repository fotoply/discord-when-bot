import { beforeEach, describe, expect, it, vi } from "vitest";
import ConfigCommand from "../src/commands/config.js";
import { ChannelConfig, ReminderSettings } from "../src/store/config.js";

vi.mock("@sapphire/decorators", () => ({
  ApplyOptions: (_opts: any) => (target: any) => target,
}));
vi.mock("@sapphire/framework", () => ({
  Command: class Command {},
  ApplicationCommandRegistry: class {
    registerChatInputCommand() {}
  },
}));

describe("/config reminders", () => {
  const guildId = "cfg-g";
  const channelId = "cfg-c";

  beforeEach(() => {
    for (const key of [
      "reminders.enabled",
      "reminders.intervalHours",
      "reminders.lastSent",
      "reminders.startTime",
    ]) {
      ChannelConfig.delete(guildId, channelId, key);
    }
  });

  it("rejects non-admin users", async () => {
    const interaction: any = {
      options: {
        getSubcommand: () => "reminders",
        getString: (name: string) => (name === "action" ? "show" : null),
      },
      member: { permissions: { has: () => false } },
      guild: { id: guildId },
      channel: { id: channelId },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await ConfigCommand.prototype.chatInputRun.call({}, interaction as any);

    expect((interaction.reply.mock.calls[0]![0] as any).content).toMatch(
      /Only an administrator/,
    );
  });

  it("shows reminder settings", async () => {
    const interaction: any = {
      options: {
        getSubcommand: () => "reminders",
        getString: (name: string) => (name === "action" ? "show" : null),
      },
      member: { permissions: { has: () => true } },
      guild: { id: guildId },
      channel: { id: channelId },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await ConfigCommand.prototype.chatInputRun.call({}, interaction as any);

    const content = (interaction.reply.mock.calls[0]![0] as any).content;
    expect(content).toContain("Current reminder settings");
    expect(content).toContain("enabled: true");
    expect(content).toContain("intervalHours: 24");
  });

  it("updates reminder settings and supports start_time clear", async () => {
    const setIx: any = {
      options: {
        getSubcommand: () => "reminders",
        getString: (name: string) => {
          if (name === "action") return "set";
          if (name === "enabled") return "false";
          if (name === "start_time") return "10:00";
          return null;
        },
        getInteger: (name: string) => (name === "interval_hours" ? 12 : null),
      },
      member: { permissions: { has: () => true } },
      guild: { id: guildId },
      channel: { id: channelId },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await ConfigCommand.prototype.chatInputRun.call({}, setIx as any);

    let cfg = ReminderSettings.get(guildId, channelId);
    expect(cfg.enabled).toBe(false);
    expect(cfg.intervalHours).toBe(12);
    expect(cfg.startTime).toBe("10:00");

    const clearIx: any = {
      ...setIx,
      reply: vi.fn().mockResolvedValue(undefined),
      options: {
        getSubcommand: () => "reminders",
        getString: (name: string) => {
          if (name === "action") return "set";
          if (name === "start_time") return "clear";
          return null;
        },
        getInteger: () => undefined,
      },
    };

    await ConfigCommand.prototype.chatInputRun.call({}, clearIx as any);
    cfg = ReminderSettings.get(guildId, channelId);
    expect(cfg.startTime).toBeUndefined();
  });

  it("validates start_time and clamps interval", async () => {
    const badFormat: any = {
      options: {
        getSubcommand: () => "reminders",
        getString: (name: string) => {
          if (name === "action") return "set";
          if (name === "start_time") return "25:00";
          return null;
        },
        getInteger: () => undefined,
      },
      member: { permissions: { has: () => true } },
      guild: { id: guildId },
      channel: { id: channelId },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await ConfigCommand.prototype.chatInputRun.call({}, badFormat as any);
    expect((badFormat.reply.mock.calls[0]![0] as any).content).toMatch(
      /must be in HH:mm/,
    );

    const badMinutes: any = {
      ...badFormat,
      reply: vi.fn().mockResolvedValue(undefined),
      options: {
        getSubcommand: () => "reminders",
        getString: (name: string) => {
          if (name === "action") return "set";
          if (name === "start_time") return "09:30";
          return null;
        },
        getInteger: () => undefined,
      },
    };

    await ConfigCommand.prototype.chatInputRun.call({}, badMinutes as any);
    expect((badMinutes.reply.mock.calls[0]![0] as any).content).toMatch(
      /minutes must be :00/,
    );

    const clampInterval: any = {
      ...badFormat,
      reply: vi.fn().mockResolvedValue(undefined),
      options: {
        getSubcommand: () => "reminders",
        getString: (name: string) => (name === "action" ? "set" : null),
        getInteger: (name: string) => (name === "interval_hours" ? 0 : null),
      },
    };

    await ConfigCommand.prototype.chatInputRun.call({}, clampInterval as any);
    const cfg = ReminderSettings.get(guildId, channelId);
    expect(cfg.intervalHours).toBe(1);
  });

  it("registers builder and respects GUILD_ID", async () => {
    const registry = { registerChatInputCommand: vi.fn() } as any;

    delete process.env.GUILD_ID;
    ConfigCommand.prototype.registerApplicationCommands.call(
      { name: "config", description: "desc" },
      registry,
    );
    const [builderFn, opt] = registry.registerChatInputCommand.mock.calls[0]!;
    expect(opt).toBeUndefined();

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
      addRoleOption: vi.fn((fn: any) => {
        fn({
          setName: vi.fn().mockReturnThis(),
          setDescription: vi.fn().mockReturnThis(),
          setRequired: vi.fn().mockReturnThis(),
        });
        return chain;
      }),
    };

    builderFn(chain);
    expect(chain.setName).toHaveBeenCalledWith("config");

    registry.registerChatInputCommand.mockClear();
    process.env.GUILD_ID = "guild-123";
    ConfigCommand.prototype.registerApplicationCommands.call(
      { name: "config", description: "desc" },
      registry,
    );
    expect(registry.registerChatInputCommand.mock.calls[0]![1]).toEqual({
      guildIds: ["guild-123"],
    });
    delete process.env.GUILD_ID;
  });

  it("replies unknown subcommand for unexpected values", async () => {
    const interaction: any = {
      options: {
        getSubcommand: () => "unknown",
        getString: (name: string) => (name === "action" ? "show" : null),
      },
      member: { permissions: { has: () => true } },
      guild: { id: guildId },
      channel: { id: channelId },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await ConfigCommand.prototype.chatInputRun.call({}, interaction as any);

    expect((interaction.reply.mock.calls[0]![0] as any).content).toMatch(
      /Unknown subcommand/,
    );
  });
});


