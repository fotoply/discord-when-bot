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
import { ReminderSettings } from '../src/store/config.js';

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
    const baseInteraction: any = {
      member: { permissions: { has: () => true } },
      guild: { id: 'g3' },
      channel: { id: 'chan-conf' },
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
        getString: (_: string) => 'false',
        getInteger: (_: string) => 12,
      },
    };

    await RemindCommand.prototype.chatInputRun.call(thisArg, updateInteraction as any);
    content = (updateInteraction.reply.mock.calls[0]![0] as any).content as string;
    expect(content).toContain('enabled: false');
    expect(content).toContain('intervalHours: 12');

    // Verify persisted values via ReminderSettings
    const cfg = ReminderSettings.get('g3', 'chan-conf');
    expect(cfg.enabled).toBe(false);
    expect(cfg.intervalHours).toBe(12);
  });
});
