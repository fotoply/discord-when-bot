import { describe, expect, it, vi } from "vitest";
import PollCommand from "../src/commands/poll.js";
import { DefaultRole } from "../src/store/config.js";

vi.mock("@sapphire/decorators", () => ({
  ApplyOptions: (_opts: any) => (target: any) => target,
}));
vi.mock("@sapphire/framework", () => ({
  Command: class Command {},
  ApplicationCommandRegistry: class {
    registerChatInputCommand() {}
    registerContextMenuCommand() {}
  },
}));

describe("/poll defaultrole", () => {
  it("shows unset, sets role, shows set, clears", async () => {
    const fakeCmd: any = {};
    const guildId = "g-1";
    const channelId = "c-1";
    const adminMember = {
      permissions: { has: (x: any) => x === "Administrator" },
    };

    // 1) Show when unset
    const showIx: any = {
      options: {
        getSubcommand: () => "defaultrole",
        getString: (name: string) => (name === "action" ? "show" : null),
      },
      guild: { id: guildId },
      channel: { id: channelId },
      member: adminMember,
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await PollCommand.prototype.chatInputRun.call(fakeCmd, showIx);
    const showReply = showIx.reply.mock.calls[0][0];
    expect(showReply.content).toMatch(/No default role/);

    // 2) Set role via getRole option
    const setIx: any = {
      options: {
        getSubcommand: () => "defaultrole",
        getString: (name: string) => (name === "action" ? "set" : null),
        getRole: (name: string) =>
          name === "role" ? { id: "role-1", name: "R1" } : null,
      },
      guild: { id: guildId },
      channel: { id: channelId },
      member: adminMember,
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await PollCommand.prototype.chatInputRun.call(fakeCmd, setIx);
    const setReply = setIx.reply.mock.calls[0][0];
    expect(setReply.content).toContain("<@&role-1>");
    expect(DefaultRole.get(guildId, channelId)).toBe("role-1");

    // 3) Show now reflects set
    const show2Ix: any = {
      options: {
        getSubcommand: () => "defaultrole",
        getString: (name: string) => (name === "action" ? "show" : null),
      },
      guild: { id: guildId },
      channel: { id: channelId },
      member: adminMember,
      reply: vi.fn().mockResolvedValue(undefined),
    };
    await PollCommand.prototype.chatInputRun.call(fakeCmd, show2Ix);
    const show2Reply = show2Ix.reply.mock.calls[0][0];
    expect(show2Reply.content).toContain("<@&role-1>");

    // 4) Clear
    const clearIx: any = {
      options: {
        getSubcommand: () => "defaultrole",
        getString: (name: string) => (name === "action" ? "clear" : null),
      },
      guild: { id: guildId },
      channel: { id: channelId },
      member: adminMember,
      reply: vi.fn().mockResolvedValue(undefined),
    };
    await PollCommand.prototype.chatInputRun.call(fakeCmd, clearIx);
    expect(DefaultRole.get(guildId, channelId)).toBeUndefined();
  });
});
