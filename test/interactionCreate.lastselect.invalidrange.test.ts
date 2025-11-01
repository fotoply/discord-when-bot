// filepath: test/interactionCreate.lastselect.invalidrange.test.ts
import { describe, expect, it, vi } from "vitest";
import { Sessions } from "../src/store/sessions.js";

describe("Last select invalid range branch", () => {
  it("replies Invalid range when buildDateRange returns null for last select", async () => {
    // Mock date util so buildDateRange returns null
    vi.doMock("../src/util/date.js", () => ({
      isValidISODate: (_: any) => true,
      buildDateRange: (_a: any, _b: any) => null,
      buildFutureDates: (_: any) => ["2025-08-30", "2025-08-31"],
      formatDateLabel: (s: string) => s,
    }));

    const mod = await import("../src/listeners/interactionCreate.js");
    const InteractionCreateListener = mod.default;
    const listener = new InteractionCreateListener({} as any, {} as any);

    Sessions.setFirst("lr-user", "2025-08-30");

    const interaction: any = {
      isStringSelectMenu: () => true,
      customId: "when:last",
      isButton: () => false,
      values: ["2025-08-31"],
      user: { id: "lr-user" },
      inGuild: () => true,
      channel: { id: "chan-lr", isTextBased: () => true, send: vi.fn() },
      reply: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    };

    await listener.run(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    const arg = interaction.reply.mock.calls[0][0];
    expect(arg.content).toMatch(/Invalid range/);

    vi.unmock("../src/util/date.js");
  });
});
