import { beforeEach, describe, expect, it, vi } from "vitest";
import { Polls } from "../src/store/polls.js";

let listener: any;

describe("InteractionCreate view toggle success", () => {
  beforeEach(async () => {
    const mod = await import("../src/listeners/interactionCreate.js");
    const InteractionCreateListener = mod.default;
    listener = new InteractionCreateListener({} as any, {} as any);
  });

  it("toggles view and updates message for open poll", async () => {
    const poll = Polls.createPoll({
      channelId: "c-vts",
      creatorId: "creatorV",
      dates: ["2025-08-30", "2025-08-31"],
    });
    const interaction: any = {
      isButton: () => true,
      customId: `when:view:${poll.id}`,
      user: { id: "creatorV" },
      reply: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    };

    await listener.run(interaction);

    expect(interaction.update).toHaveBeenCalled();
  });
});
