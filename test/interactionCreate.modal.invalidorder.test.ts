import { describe, it, expect, vi } from 'vitest';

// Mock date util so buildDateRange returns null (invalid order)
vi.mock('../src/util/date.js', () => ({
  isValidISODate: (_: any) => true,
  buildDateRange: (_a: string, _b: string) => null,
  buildFutureDates: (n: number) => Array.from({ length: n }, (_, i) => `2025-11-${String(1+i).padStart(2,'0')}`),
  formatDateLabel: (iso: string) => iso,
}));

describe('InteractionCreate modal invalid order branch', () => {
  it('replies that first date must be on or before last date', async () => {
    const mod = await import('../src/listeners/interactionCreate.js');
    const InteractionCreateListener = mod.default;
    const listener = new InteractionCreateListener({} as any, {} as any);

    const reply = vi.fn().mockResolvedValue(undefined);
    const interaction: any = {
      isModalSubmit: () => true,
      customId: 'when:date-range',
      fields: { getTextInputValue: (k: string) => (k === 'first-date' ? '2025-10-31' : '2025-10-01') },
      user: { id: 'u-modal-order' },
      reply,
    };

    await listener.run(interaction);

    expect(reply).toHaveBeenCalled();
    const arg = reply.mock.calls[0]![0];
    expect(arg.content).toMatch(/First date must be on or before last date/);
  });
});
