import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock decorators and framework Command base like other command tests
vi.mock('@sapphire/decorators', () => ({ ApplyOptions: (_opts: any) => (target: any) => target }));
vi.mock('@sapphire/framework', () => ({
  Command: class Command {},
  ApplicationCommandRegistry: class {
    registerChatInputCommand() {}
  },
}));

// Mock sendReminders utility to observe calls
vi.mock('../src/util/reminders.js', () => {
  const fn = vi.fn(async () => {});
  return { sendReminders: fn };
});

import RemindCommand from '../src/commands/remind.js';
import { ReminderSettings, ChannelConfig } from '../src/store/config.js';

async function getSendRemindersMock() {
  const mod = await import('../src/util/reminders.js');
  return (mod as any).sendReminders as ReturnType<typeof vi.fn>;
}

describe('Remind command', () => {
  beforeEach(async () => {
    const send = await getSendRemindersMock();
    send.mockReset();
  });

  it('rejects non-admin users', async () => {
    const interaction: any = {
      options: { getSubcommand: () => 'now' },
      member: { permissions: { has: () => false } },
      guild: { id: 'g1' },
      channel: { id: 'c1' },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    const thisArg: any = { isAdmin: () => false };
    await RemindCommand.prototype.chatInputRun.call(thisArg, interaction as any);

    expect(interaction.reply).toHaveBeenCalled();
    const arg = (interaction.reply.mock.calls[0]![0] as any).content as string;
    expect(arg).toMatch(/Only an administrator/);
  });

  it('triggers reminders now in the current channel for admins', async () => {
    const interaction: any = {
      options: { getSubcommand: () => 'now' },
      member: { permissions: { has: () => true } },
      guild: { id: 'g2' },
      channel: { id: 'chan-now' },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    const thisArg: any = { isAdmin: () => true, container: { client: {} } };

    await RemindCommand.prototype.chatInputRun.call(thisArg, interaction as any);

    const sendReminders = await getSendRemindersMock();
    expect(sendReminders).toHaveBeenCalled();
    const args = sendReminders.mock.calls[0]!;
    expect(args[2]).toEqual({ channelId: 'chan-now', force: true });
    const replyArg = (interaction.reply.mock.calls[0]![0] as any).content as string;
    expect(replyArg).toMatch(/Triggered reminders/);
  });

  it('shows and updates per-channel config', async () => {
    const guildId = 'g3';
    const channelId = 'chan-conf';

    // Ensure clean slate even if a previous test run left persisted values
    for (const key of ['reminders.enabled','reminders.intervalHours','reminders.lastSent','reminders.startTime']) {
      ChannelConfig.delete(guildId, channelId, key);
    }
    // Explicitly set defaults for this test to avoid flakiness across runs
    ReminderSettings.setEnabled(guildId, channelId, true);
    ReminderSettings.setIntervalHours(guildId, channelId, 24);

    const baseInteraction: any = {
      member: { permissions: { has: () => true } },
      guild: { id: guildId },
      channel: { id: channelId },
      reply: vi.fn().mockResolvedValue(undefined),
      options: {
        getSubcommand: () => 'config',
        getString: (_: string) => null,
        getInteger: (_: string) => undefined,
      },
    };

    const thisArg: any = { isAdmin: () => true };

    // Show current defaults
    await RemindCommand.prototype.chatInputRun.call(thisArg, baseInteraction as any);
    let content = (baseInteraction.reply.mock.calls[0]![0] as any).content as string;
    expect(content).toContain('enabled: true');
    expect(content).toContain('intervalHours: 24');

    // Update enabled=false and interval=12
    const updateInteraction: any = {
      ...baseInteraction,
      reply: vi.fn().mockResolvedValue(undefined),
      options: {
        getSubcommand: () => 'config',
        getString: (name: string) => (name === 'enabled' ? 'false' : null),
        getInteger: (_: string) => 12,
      },
    };

    await RemindCommand.prototype.chatInputRun.call(thisArg, updateInteraction as any);
    content = (updateInteraction.reply.mock.calls[0]![0] as any).content as string;
    expect(content).toContain('enabled: false');
    expect(content).toContain('intervalHours: 12');

    // Verify persisted values via ReminderSettings
    const cfg = ReminderSettings.get(guildId, channelId);
    expect(cfg.enabled).toBe(false);
    expect(cfg.intervalHours).toBe(12);
  });

  it('sets and clears start_time', async () => {
    const guildId = 'g4';
    const channelId = 'chan-timeconf';

    // Clean slate
    for (const key of ['reminders.enabled','reminders.intervalHours','reminders.lastSent','reminders.startTime']) {
      ChannelConfig.delete(guildId, channelId, key);
    }

    const thisArg: any = { isAdmin: () => true };

    // Set start_time to 10:00
    const setInteraction: any = {
      member: { permissions: { has: () => true } },
      guild: { id: guildId },
      channel: { id: channelId },
      reply: vi.fn().mockResolvedValue(undefined),
      options: {
        getSubcommand: () => 'config',
        getString: (name: string) => (name === 'start_time' ? '10:00' : null),
        getInteger: (_: string) => undefined,
      },
    };

    await RemindCommand.prototype.chatInputRun.call(thisArg, setInteraction as any);
    let content = (setInteraction.reply.mock.calls[0]![0] as any).content as string;
    expect(content).toContain('startTime: 10:00');

    // Clear start_time
    const clearInteraction: any = {
      ...setInteraction,
      reply: vi.fn().mockResolvedValue(undefined),
      options: {
        getSubcommand: () => 'config',
        getString: (name: string) => (name === 'start_time' ? 'clear' : null),
        getInteger: (_: string) => undefined,
      },
    };

    await RemindCommand.prototype.chatInputRun.call(thisArg, clearInteraction as any);
    content = (clearInteraction.reply.mock.calls[0]![0] as any).content as string;
    expect(content).not.toContain('startTime:');

    const cfg = ReminderSettings.get(guildId, channelId);
    expect(cfg.startTime).toBeUndefined();
  });
});
