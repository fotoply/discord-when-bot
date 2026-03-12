import { describe, it, expect, vi } from "vitest";

vi.mock("@sapphire/decorators", () => ({
  ApplyOptions: (_opts: any) => (target: any) => target,
}));
vi.mock("@sapphire/framework", () => ({
  Command: class Command {},
  ApplicationCommandRegistry: class {
    registerChatInputCommand() {}
  },
}));

import RemindCommand from "../src/commands/remind.js";
import { Polls } from "../src/store/polls.js";
import { ChannelConfig } from "../src/store/config.js";

function clearReminderConfig(guildId: string, channelId: string) {
  for (const key of [
    "reminders.enabled",
    "reminders.intervalHours",
    "reminders.lastSent",
    "reminders.startTime",
  ]) {
    ChannelConfig.delete(guildId, channelId, key);
  }
}

describe("Remind command integration", () => {
  it("/remind now sends a reminder for each open poll in the current channel", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const guildId = `g-remind-int-${suffix}`;
    const channelId = `c-remind-int-${suffix}`;
    const otherChannelId = `c-remind-other-${suffix}`;

    clearReminderConfig(guildId, channelId);
    clearReminderConfig(guildId, otherChannelId);

    const pollA = Polls.createPoll({
      channelId,
      creatorId: "creator-int-a",
      dates: ["2026-03-12"],
    });
    const pollB = Polls.createPoll({
      channelId,
      creatorId: "creator-int-b",
      dates: ["2026-03-13"],
    });
    const pollOther = Polls.createPoll({
      channelId: otherChannelId,
      creatorId: "creator-int-c",
      dates: ["2026-03-14"],
    });

    try {
      const sendTarget = vi
        .fn()
        .mockResolvedValueOnce({ id: `r-a-${suffix}` })
        .mockResolvedValueOnce({ id: `r-b-${suffix}` });
      const sendOther = vi.fn().mockResolvedValue({ id: `r-c-${suffix}` });

      const targetChannel = {
        id: channelId,
        guild: {
          id: guildId,
          members: {
            cache: new Map<string, any>([
              ["u1", { id: "u1", user: { bot: false } }],
              ["u2", { id: "u2", user: { bot: false } }],
            ]),
            fetch: vi.fn(),
          },
        },
        send: sendTarget,
        messages: { delete: vi.fn() },
      } as any;
      const otherChannel = {
        id: otherChannelId,
        guild: {
          id: guildId,
          members: {
            cache: new Map<string, any>([
              ["u9", { id: "u9", user: { bot: false } }],
              ["u10", { id: "u10", user: { bot: false } }],
            ]),
            fetch: vi.fn(),
          },
        },
        send: sendOther,
        messages: { delete: vi.fn() },
      } as any;

      const interaction: any = {
        options: { getSubcommand: () => "now" },
        member: { permissions: { has: () => true } },
        guild: { id: guildId },
        channel: { id: channelId },
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
      };
      const thisArg: any = {
        container: {
          client: {
            channels: {
              fetch: vi.fn((id: string) => {
                if (id === channelId) return Promise.resolve(targetChannel);
                if (id === otherChannelId) return Promise.resolve(otherChannel);
                return Promise.resolve(null);
              }),
            },
          },
        },
      };

      await RemindCommand.prototype.chatInputRun.call(thisArg, interaction);

      expect(sendTarget).toHaveBeenCalledTimes(2);
      expect(sendOther).not.toHaveBeenCalled();
      expect(interaction.deferReply).toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith({
        content: "Triggered reminders for this channel (if needed).",
      });
    } finally {
      Polls.delete(pollA.id);
      Polls.delete(pollB.id);
      Polls.delete(pollOther.id);
      clearReminderConfig(guildId, channelId);
      clearReminderConfig(guildId, otherChannelId);
    }
  });
});

