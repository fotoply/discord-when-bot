import { describe, it, expect, vi } from "vitest";

describe("InteractionCreate last select missing first date branch", () => {
  it("replies asking to pick the first date first when no first is stored", async () => {
    const mod = await import("../src/listeners/interactionCreate.js");
    const InteractionCreateListener = mod.default;
    const listener = new InteractionCreateListener({} as any, {} as any);

    const reply = vi.fn().mockResolvedValue(undefined);
    const interaction: any = {
      isStringSelectMenu: () => true,
      customId: "when:last",
      values: ["2025-08-31"],
      user: { id: "no-first" },
      reply,
      inGuild: () => true,
      channel: { isTextBased: () => true, id: "c" },
    };

    await listener.run(interaction);

    expect(reply).toHaveBeenCalled();
    const arg = reply.mock.calls[0]![0];
    expect(arg.content).toMatch(/Please pick the first date first/);
  });
});
