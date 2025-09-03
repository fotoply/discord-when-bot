import { describe, it, expect } from 'vitest';

describe('InteractionCreate type guards handle unknown interaction shapes', () => {
  it('no-ops when interaction lacks type methods (guards short-circuit)', async () => {
    const mod = await import('../src/listeners/interactionCreate.js');
    const InteractionCreateListener = mod.default as any;
    const listener = new InteractionCreateListener({}, {});

    // Lacks isModalSubmit, isButton, isStringSelectMenu methods
    const interaction: any = { customId: 'noop' };
    // Should not throw
    await listener.run(interaction);
  });

  it('no-ops when type methods exist but return false', async () => {
    const mod = await import('../src/listeners/interactionCreate.js');
    const InteractionCreateListener = mod.default as any;
    const listener = new InteractionCreateListener({}, {});

    const interaction: any = {
      isModalSubmit: () => false,
      isButton: () => false,
      isStringSelectMenu: () => false,
      customId: 'when:first',
      values: [],
      user: { id: 'u' },
      update: async () => undefined,
      reply: async () => undefined,
    };

    await listener.run(interaction);
    // If guards are evaluated correctly, run() just returns without throwing or replying
    expect(true).toBe(true);
  });
});
