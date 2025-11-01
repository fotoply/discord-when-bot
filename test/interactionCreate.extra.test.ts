// filepath: test/interactionCreate.extra.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Polls } from "../src/store/polls.js";
import { Sessions } from "../src/store/sessions.js";

let listener: any;

beforeEach(async () => {
  Sessions.clear("admin-user");
  const mod = await import("../src/listeners/interactionCreate.js");
  const InteractionCreateListener = mod.default;
  listener = new InteractionCreateListener({} as any, {} as any);
});

describe("InteractionCreate extra branches", () => {
  it("allows admin (non-creator) to close a poll", async () => {
    const poll = Polls.createPoll({
      channelId: "c-admin",
      creatorId: "orig",
      dates: ["2025-08-30"],
    });

    const interaction: any = {
      isButton: () => true,
      customId: `when:close:${poll.id}`,
      user: { id: "admin-user" },
      member: { permissions: { has: (_: any) => true } }, // is admin
      reply: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    };

    await listener.run(interaction);

    expect(interaction.update).toHaveBeenCalled();
    expect(Polls.isClosed(poll.id)).toBe(true);
  });

  it("replies when trying to close an already closed poll", async () => {
    const poll = Polls.createPoll({
      channelId: "c-already",
      creatorId: "creatorX",
      dates: ["2025-08-30"],
    });
    Polls.close(poll.id);

    const interaction: any = {
      isButton: () => true,
      customId: `when:close:${poll.id}`,
      user: { id: "creatorX" },
      reply: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    };

    await listener.run(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    const arg = interaction.reply.mock.calls[0][0];
    expect(arg.content).toMatch(/already closed/);
  });

  it("handles modal submit where followUp rejects (followUp.catch path)", async () => {
    // ensure any previous sessions cleared
    const interaction: any = {
      isModalSubmit: () => true,
      customId: "when:date-range",
      fields: {
        getTextInputValue: (k: string) =>
          k === "first-date" ? "2025-08-30" : "2025-08-31",
      },
      channelId: "chan-modal-2",
      user: { id: "modal-user-2" },
      reply: vi.fn().mockResolvedValue(undefined),
      fetchReply: vi.fn().mockResolvedValue({ id: "created-msg-2" }),
      followUp: vi.fn().mockRejectedValue(new Error("boom")),
    };

    await listener.run(interaction);

    // Poll should have been created and message id set despite followUp rejection
    const polls = Array.from(Polls["polls"].values() as any) as any[];
    const found = polls.find((p) => p.creatorId === "modal-user-2");
    expect(found).toBeTruthy();
    expect(found.messageId).toBe("created-msg-2");
    expect(interaction.followUp).toHaveBeenCalled();
  });
});
