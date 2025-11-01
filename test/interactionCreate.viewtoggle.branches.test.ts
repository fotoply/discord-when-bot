import { beforeEach, describe, expect, it, vi } from "vitest";
import { Polls } from "../src/store/polls.js";

let listener: any;

describe("InteractionCreate view toggle branches", () => {
  beforeEach(async () => {
    const mod = await import("../src/listeners/interactionCreate.js");
    const InteractionCreateListener = mod.default;
    listener = new InteractionCreateListener({} as any, {} as any);
  });

  it("replies Poll not found for view toggle with missing poll", async () => {
    const interaction: any = {
      isButton: () => true,
      customId: "when:view:missing",
      reply: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    };

    await listener.run(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    const arg = interaction.reply.mock.calls[0][0];
    expect(arg.content).toMatch(/Poll not found/);
  });

  it("replies This poll is closed for view toggle on closed poll", async () => {
    const poll = Polls.createPoll({
      channelId: "c-vt",
      creatorId: "cv",
      dates: ["2025-08-30"],
    });
    Polls.close(poll.id);

    const interaction: any = {
      isButton: () => true,
      customId: `when:view:${poll.id}`,
      reply: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    };

    await listener.run(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    const arg = interaction.reply.mock.calls[0][0];
    expect(arg.content).toMatch(/This poll is closed/);
  });
});
