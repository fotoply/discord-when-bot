import { describe, it, expect } from 'vitest';
import Listener from '../src/listeners/interactionCreate.js';

describe('InteractionCreate type guards handle unknown interaction shapes', () => {
  it('no-ops when interaction lacks type methods (guards short-circuit)', async () => {
    const listener = new Listener({} as any, {} as any);
    const interaction: any = {};
    await listener.run(interaction);
    expect(true).toBe(true);
  });

  it('no-ops when type methods exist but return false', async () => {
    const listener = new Listener({} as any, {} as any);
    const interaction: any = {
      isModalSubmit: () => false,
      isButton: () => false,
      isStringSelectMenu: () => false,
    };
    await listener.run(interaction);
    expect(true).toBe(true);
  });
});

