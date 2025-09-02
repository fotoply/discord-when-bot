import {beforeEach, describe, expect, it, vi} from 'vitest';

// Import production listeners/commands to drive via a small mocked framework router
import InteractionCreateMod from '../src/listeners/interactionCreate.js';
import ReadyMod from '../src/listeners/ready.js';
import WhenCommandMod from '../src/commands/when.js';
import PollCommandMod from '../src/commands/poll.js';
import {Polls} from '../src/store/polls.js';
import {buildFutureDates} from '../src/util/date.js';

// A very small event bus to mimic Discord client's interaction events
class EventBus {
  private handlers: Array<(i: any) => Promise<void> | void> = [];
  onInteraction(handler: (i: any) => Promise<void> | void) {
    this.handlers.push(handler);
  }
  async emitInteraction(i: any) {
    for (const h of this.handlers) {
      // run sequentially for determinism
      await h(i);
    }
  }
}

// Fake text channel that records messages
class FakeChannel {
  public id: string;
  public sent: Array<{ content: string; components?: any[]; id: string }>;
  private seq = 0;
  constructor(id: string) {
    this.id = id;
    this.sent = [];
  }
  isTextBased() { return true; }
  async send(payload: { content: string; components?: any[] }) {
    const id = `m-${++this.seq}`;
    this.sent.push({ ...payload, id });
    return { id };
  }
}

// Minimal framework router that hooks production listeners and routes slash commands
class MockFramework {
  public bus = new EventBus();
  public interactionListener: any;
  public readyListener: any;
  public channels = new Map<string, FakeChannel>();
  private commands = new Map<string, any>();

  constructor() {
    // Hook project listeners to the bus
    this.interactionListener = new (InteractionCreateMod as any)({}, {});
    this.bus.onInteraction((i) => this.interactionListener.run(i));

    this.readyListener = new (ReadyMod as any)({}, {});

    // Register available slash commands
    this.commands.set('when', (WhenCommandMod as any));
    this.commands.set('poll', (PollCommandMod as any));
  }

  getChannel(id: string) {
    if (!this.channels.has(id)) this.channels.set(id, new FakeChannel(id));
    return this.channels.get(id)!;
  }

  async emitReady() {
    // Provide a minimal client with channels.fetch
    const client = {
      channels: {
        fetch: vi.fn().mockImplementation(async (cid: string) => this.channels.get(cid) ?? null),
      },
    } as any;
    await this.readyListener.run(client);
  }

  async emitSlash(commandName: string, options?: { channelId?: string; userId?: string }) {
    const CmdClass = this.commands.get(commandName);
    if (!CmdClass) throw new Error(`Unknown command: ${commandName}`);

    const channel = this.getChannel(options?.channelId ?? 'chan-1');

    // Simulate a chat input interaction and let the command handle it
    const interaction: any = {
      commandName,
      reply: vi.fn().mockResolvedValue(undefined),
      channel,
      // compat flags used in some code paths; not strictly necessary for When command
      inGuild: () => true,
    };

    // In Sapphire this would be invoked by the framework; we call through a tiny router
    await (CmdClass as any).prototype.chatInputRun.call({ name: commandName }, interaction);

    return interaction;
  }

  async emitSelect(customId: string, values: string[], userId: string, channelId = 'chan-1') {
    const channel = this.getChannel(channelId);
    const interaction: any = {
      isStringSelectMenu: () => true,
      isButton: () => false,
      customId,
      values,
      user: { id: userId },
      inGuild: () => true,
      channel,
      update: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
    };
    await this.bus.emitInteraction(interaction);
    return interaction;
  }

  async emitButton(customId: string, userId: string, extras?: Partial<any>) {
    const interaction: any = {
      isButton: () => true,
      isStringSelectMenu: () => false,
      customId,
      user: { id: userId },
      update: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
      ...extras,
    };
    await this.bus.emitInteraction(interaction);
    return interaction;
  }
}

// Reset DB-backed stores between tests by creating a fresh Poll and closing others if needed
const resetState = () => {
  // No explicit clear API; rely on isolated DB per worker from setup.ts
};

describe('Full-flow: start bot, create poll, users vote, and close', () => {
  let fw: MockFramework;

  beforeEach(() => {
    vi.restoreAllMocks();
    resetState();
    fw = new MockFramework();
  });

  it('simulates /when -> selects -> poll message -> multiple votes -> close', async () => {
    // 1) Bot ready path (verifies open polls, none at start)
    await fw.emitReady();

    // 2) User executes /when (framework routes to command handler)
    const slash = await fw.emitSlash('when', { channelId: 'chan-a', userId: 'creatorA' });
    expect(slash.reply).toHaveBeenCalled();
    const firstReply = slash.reply.mock.calls[0][0];
    expect(firstReply.content).toContain('Select a date range');
    expect(Array.isArray(firstReply.components)).toBe(true);

    // Choose first/last dates like the UI would present
    const future = buildFutureDates(20);
    const first = future[0]!;
    const last = future[Math.min(1, future.length - 1)]!;

    // 3) User picks first date
    const firstSelect = await fw.emitSelect('when:first', [first], 'creatorA', 'chan-a');
    expect(firstSelect.update).toHaveBeenCalled();
    const firstUpdateArg = firstSelect.update.mock.calls[0][0];
    expect(Array.isArray(firstUpdateArg.components)).toBe(true);

    // 4) User picks last; listener should post a poll message to channel
    const lastSelect = await fw.emitSelect('when:last', [last], 'creatorA', 'chan-a');
    expect(lastSelect.update).toHaveBeenCalled();
    const updArg = lastSelect.update.mock.calls[0][0];
    expect(updArg.content).toContain('Poll created!');

    // Channel should now have one poll message
    const chan = fw.getChannel('chan-a');
    expect(chan.sent.length).toBe(1);
    const posted = chan.sent[0]!;
    expect(posted.content).toContain('Availability poll by');
    expect(Array.isArray(posted.components)).toBe(true);

    // Find the created poll id from the store
    const open = Polls.allOpen();
    expect(open.length).toBe(1);
    const poll = open[0]!;

    // 5) Simulate two users voting on the first real date
    const firstRealDate = poll.dates.find((d) => d !== '__none__')!;

    const btnId = `when:toggle:${poll.id}:${firstRealDate}`;

    const u2 = await fw.emitButton(btnId, 'user-2');
    expect(u2.update).toHaveBeenCalled();

    const u3 = await fw.emitButton(btnId, 'user-3');
    expect(u3.update).toHaveBeenCalled();

    const counts = Polls.counts(poll.id)!;
    expect(counts[firstRealDate]).toBe(2);

    // 6) Creator closes the poll via button
    const closeBtnId = `when:close:${poll.id}`;
    const closeIx = await fw.emitButton(closeBtnId, poll.creatorId);
    expect(closeIx.update).toHaveBeenCalled();

    // Poll should be closed and components removed in the update payload
    expect(Polls.isClosed(poll.id)).toBe(true);
  });
});
