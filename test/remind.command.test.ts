import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sapphire/decorators", () => ({
  ApplyOptions: (_opts: any) => (target: any) => target,
}));
vi.mock("@sapphire/framework", () => ({
  Command: class Command {},
  ApplicationCommandRegistry: class {
    registerChatInputCommand() {}
  },
}));

vi.mock("../src/util/reminders.js", () => {
  const fn = vi.fn(async () => {});
  return { sendReminders: fn };
});

import RemindCommand from "../src/commands/remind.js";

async function getSendRemindersMock() {
  const mod = await import("../src/util/reminders.js");
  return (mod as any).sendReminders as ReturnType<typeof vi.fn>;
}

describe("/remind", () => {
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

    await RemindCommand.prototype.chatInputRun.call({}, interaction as any);

    const arg = (interaction.reply.mock.calls[0]![0] as any).content as string;
    expect(arg).toMatch(/Only an administrator/);
  });

  it("rejects when guild or channel is missing", async () => {
    const missingGuild: any = {
      options: { getSubcommand: () => "now" },
      member: { permissions: { has: () => true } },
      guild: undefined,
      channel: { id: "c1" },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await RemindCommand.prototype.chatInputRun.call({}, missingGuild as any);
    expect((missingGuild.reply.mock.calls[0]![0] as any).content).toMatch(
      /must be used in a guild text channel/,
    );

    const missingChannel: any = {
      ...missingGuild,
      guild: { id: "g1" },
      channel: undefined,
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await RemindCommand.prototype.chatInputRun.call({}, missingChannel as any);
    expect((missingChannel.reply.mock.calls[0]![0] as any).content).toMatch(
      /must be used in a guild text channel/,
    );
  });

  it("triggers reminders for admins", async () => {
    const interaction: any = {
      options: { getSubcommand: () => "now" },
      member: { permissions: { has: () => true } },
      guild: { id: "g2" },
      channel: { id: "chan-now" },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await RemindCommand.prototype.chatInputRun.call(
      { container: { client: {} } },
      interaction as any,
    );

    const sendReminders = await getSendRemindersMock();
    expect(sendReminders).toHaveBeenCalled();
    expect(sendReminders.mock.calls[0]![2]).toEqual({
      channelId: "chan-now",
      force: true,
    });
    expect((interaction.reply.mock.calls[0]![0] as any).content).toMatch(
      /Triggered reminders/,
    );
  });

  it("uses deferReply + editReply when available", async () => {
    const interaction: any = {
      options: { getSubcommand: () => "now" },
      member: { permissions: { has: () => true } },
      guild: { id: "g2" },
      channel: { id: "chan-defer" },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await RemindCommand.prototype.chatInputRun.call(
      { container: { client: {} } },
      interaction as any,
    );

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it("registers command and respects GUILD_ID", async () => {
    const registry = { registerChatInputCommand: vi.fn() } as any;

    delete process.env.GUILD_ID;
    RemindCommand.prototype.registerApplicationCommands.call(
      { name: "remind", description: "desc" },
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
    };
    builderFn(chain);
    expect(chain.setName).toHaveBeenCalledWith("remind");

    registry.registerChatInputCommand.mockClear();
    process.env.GUILD_ID = "guild-123";
    RemindCommand.prototype.registerApplicationCommands.call(
      { name: "remind", description: "desc" },
      registry,
    );
    expect(registry.registerChatInputCommand.mock.calls[0]![1]).toEqual({
      guildIds: ["guild-123"],
    });
    delete process.env.GUILD_ID;
  });

  it("replies Unknown subcommand for unexpected names", async () => {
    const interaction: any = {
      options: { getSubcommand: () => "bogus" },
      member: { permissions: { has: () => true } },
      guild: { id: "gX" },
      channel: { id: "cX" },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await RemindCommand.prototype.chatInputRun.call({}, interaction as any);

    expect((interaction.reply.mock.calls[0]![0] as any).content).toMatch(
      /Unknown subcommand/,
    );
  });
});
