import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Polls, NONE_SELECTION } from '../src/store/polls.js';
import { Sessions } from '../src/store/sessions.js';

let listener: any;

describe('InteractionCreate listener', () => {
  beforeEach(async () => {
    // Clear any session state between tests and dynamically import the listener
    Sessions.clear('user-first');
    const mod = await import('../src/listeners/interactionCreate.js');
    const InteractionCreateListener = mod.default;
    listener = new InteractionCreateListener({} as any, {} as any);
  });

  it('handleFirstSelect updates session and calls update with two components', async () => {
    const interaction: any = {
      isStringSelectMenu: () => true,
      isButton: () => false,
      customId: 'when:first',
      values: ['2025-08-30'],
      user: { id: 'user-first' },
      update: vi.fn().mockResolvedValue(undefined),
    };

    await listener.run(interaction);

    expect(Sessions.getFirst('user-first')).toBe('2025-08-30');
    expect(interaction.update).toHaveBeenCalled();
    const arg = interaction.update.mock.calls[0][0];
    expect(Array.isArray(arg.components)).toBe(true);
    expect(arg.components.length).toBe(2);
  });

  it('handleLastSelect creates poll in channel and clears session', async () => {
    // set first in session
    Sessions.setFirst('u-last', '2025-08-30');

    const sendSpy = vi.fn().mockResolvedValue({ id: 'posted-1' });
    const channel: any = { id: 'chan-1', isTextBased: () => true, send: sendSpy };

    const interaction: any = {
      isStringSelectMenu: () => true,
      customId: 'when:last',
      isButton: () => false,
      values: ['2025-08-31'],
      user: { id: 'u-last' },
      inGuild: () => true,
      channel,
      update: vi.fn().mockResolvedValue(undefined),
    };

    await listener.run(interaction);

    // interaction should have posted to channel
    expect(sendSpy).toHaveBeenCalled();
    // user session cleared
    expect(Sessions.getFirst('u-last')).toBeUndefined();
    // the interaction.update call indicates the handler informed the user
    expect(interaction.update).toHaveBeenCalled();
    const arg = interaction.update.mock.calls[0][0];
    expect(arg.content).toContain('Poll created!');
  });

  it('handleToggle toggles a user selection and calls update', async () => {
    const poll = Polls.createPoll({ channelId: 'c-toggle', creatorId: 'creator', dates: ['2025-08-30'] });
    const interaction: any = {
      isButton: () => true,
      customId: `when:toggle:${poll.id}:2025-08-30`,
      user: { id: 'some-user' },
      update: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await listener.run(interaction);

    expect(interaction.update).toHaveBeenCalled();
    const counts = Polls.counts(poll.id)!;
    expect(counts['2025-08-30']).toBe(1);

    // toggling again should unselect
    await listener.run(interaction);
    const counts2 = Polls.counts(poll.id)!;
    expect(counts2['2025-08-30']).toBe(0);
  });

  it('handleToggle replies when poll closed', async () => {
    const poll = Polls.createPoll({ channelId: 'c-close', creatorId: 'creator2', dates: ['2025-08-30'] });
    // close poll
    Polls.close(poll.id);
    const interaction: any = {
      isButton: () => true,
      customId: `when:toggle:${poll.id}:2025-08-30`,
      user: { id: 'userX' },
      update: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await listener.run(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    const arg = interaction.reply.mock.calls[0][0];
    expect(arg.content).toMatch(/closed/);
  });

  it('handleToggleAll toggles all and calls update', async () => {
    const poll = Polls.createPoll({ channelId: 'c-all', creatorId: 'creator3', dates: ['2025-08-30', '2025-08-31'] });
    const interaction: any = {
      isButton: () => true,
      customId: `when:toggleAll:${poll.id}`,
      user: { id: 'userAll' },
      update: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await listener.run(interaction);

    expect(interaction.update).toHaveBeenCalled();
    const counts = Polls.counts(poll.id)!;
    expect(counts['2025-08-30']).toBe(1);
    expect(counts['2025-08-31']).toBe(1);

    // toggling again should remove
    await listener.run(interaction);
    const counts2 = Polls.counts(poll.id)!;
    expect(counts2['2025-08-30']).toBe(0);
  });

  it('handleClose only allows creator to close', async () => {
    const poll = Polls.createPoll({ channelId: 'c-close2', creatorId: 'creator4', dates: ['2025-08-30'] });

    const notCreator: any = {
      isButton: () => true,
      customId: `when:close:${poll.id}`,
      user: { id: 'someoneElse' },
      reply: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    };

    await listener.run(notCreator);
    expect(notCreator.reply).toHaveBeenCalled();
    expect(Polls.isClosed(poll.id)).toBe(false);

    const creator: any = {
      isButton: () => true,
      customId: `when:close:${poll.id}`,
      user: { id: 'creator4' },
      reply: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    };

    await listener.run(creator);
    expect(creator.update).toHaveBeenCalled();
    expect(Polls.isClosed(poll.id)).toBe(true);
  });

  it('handleDateRangeModal creates a poll and responds', async () => {
    const replySpy = vi.fn().mockResolvedValue(undefined);
    const fetchReply = vi.fn().mockResolvedValue({ id: 'created-msg' });
    const followUp = vi.fn().mockResolvedValue(undefined);

    const interaction: any = {
      isModalSubmit: () => true,
      customId: 'when:date-range',
      fields: {
        getTextInputValue: (k: string) => (k === 'first-date' ? '2025-08-30' : '2025-09-01'),
      },
      channelId: 'chan-modal',
      user: { id: 'modal-user' },
      reply: replySpy,
      fetchReply,
      followUp,
    };

    await listener.run(interaction);

    expect(replySpy).toHaveBeenCalled();
    expect(fetchReply).toHaveBeenCalled();
    expect(followUp).toHaveBeenCalled();

    // A poll should have been created and have its messageId set
    const polls = Array.from(Polls['polls'].values() as any) as any[];
    const found = polls.find((p) => p.creatorId === 'modal-user');
    expect(found).toBeTruthy();
    expect(found.messageId).toBe('created-msg');
  });
});
