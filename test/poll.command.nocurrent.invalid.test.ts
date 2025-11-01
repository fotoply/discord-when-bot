import { describe, it, expect, vi } from "vitest";
import PollCommand from "../src/commands/poll.js";

vi.mock("@sapphire/decorators", () => ({
  ApplyOptions: (_opts: any) => (target: any) => target,
}));
vi.mock("@sapphire/framework", () => ({ Command: class Command {} }));

describe("Poll command repost invalid when no channel and no current channel", () => {
  it("replies asking for text channel when no destination and no current channel", async () => {
    const fakeCmd: any = {};
    const interaction: any = {
      options: {
        getSubcommand: () => "repost",
        getString: () => "does-not-exist", // trigger poll not found first, we need an existing id
        getChannel: () => null,
      },
      user: { id: "u" },
      reply: vi.fn().mockResolvedValue(undefined),
      channel: null,
    };

    // First, ensure unknown id replies Poll not found
    await PollCommand.prototype.chatInputRun.call(fakeCmd, interaction as any);
    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toMatch(
      /Poll not found/,
    );

    // Now simulate valid id but no channel anywhere to reach invalid dest branch
    const pollsMod = await import("../src/store/polls.js");
    const poll = pollsMod.Polls.createPoll({
      channelId: "c",
      creatorId: "creator",
      dates: ["2025-08-30"],
    });
    interaction.options.getString = () => poll.id;
    interaction.user.id = "creator";
    interaction.reply.mockClear();

    await PollCommand.prototype.chatInputRun.call(fakeCmd, interaction as any);
    expect(interaction.reply).toHaveBeenCalled();
    const arg = interaction.reply.mock.calls[0][0];
    expect(arg.content).toMatch(/Please specify a text channel/);
  });
});
