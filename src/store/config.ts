import { db } from "./db.js";

export type ChannelKV = Record<string, string>;

export const ChannelConfig = {
  // Get a specific key value for a channel
  get(guildId: string, channelId: string, key: string): string | undefined {
    const row = db
      .prepare(
        "SELECT value FROM channel_config WHERE guild_id = ? AND channel_id = ? AND key = ?"
      )
      .get(guildId, channelId, key) as { value: string } | undefined;
    return row?.value;
  },

  // Set a specific key value for a channel
  set(guildId: string, channelId: string, key: string, value: string) {
    db.prepare(
      "INSERT INTO channel_config (guild_id, channel_id, key, value) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, channel_id, key) DO UPDATE SET value = excluded.value"
    ).run(guildId, channelId, key, value);
  },

  // Get all keys for a channel
  all(guildId: string, channelId: string): ChannelKV {
    const rows = db
      .prepare(
        "SELECT key, value FROM channel_config WHERE guild_id = ? AND channel_id = ?"
      )
      .all(guildId, channelId) as Array<{ key: string; value: string }>;
    const out: ChannelKV = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  },

  // Remove a key
  delete(guildId: string, channelId: string, key: string) {
    db.prepare(
      "DELETE FROM channel_config WHERE guild_id = ? AND channel_id = ? AND key = ?"
    ).run(guildId, channelId, key);
  },
};

export type RemindersConfig = {
  enabled: boolean; // default true
  intervalHours: number; // default 24
  lastSent?: number; // epoch ms
  startTime?: string; // optional HH:mm (minutes should be 00 to align with hourly scheduler)
};

export const ReminderSettings = {
  get(guildId: string, channelId: string): RemindersConfig {
    const enabledStr = ChannelConfig.get(guildId, channelId, "reminders.enabled");
    const intervalStr = ChannelConfig.get(guildId, channelId, "reminders.intervalHours");
    const lastStr = ChannelConfig.get(guildId, channelId, "reminders.lastSent");
    const startStr = ChannelConfig.get(guildId, channelId, "reminders.startTime");
    const enabled = enabledStr === undefined ? true : enabledStr === "true";
    const interval = intervalStr ? Math.max(1, parseInt(intervalStr, 10) || 24) : 24;
    const lastSent = lastStr ? Number(lastStr) || undefined : undefined;
    const startTime = startStr || undefined;
    return { enabled, intervalHours: interval, lastSent, startTime };
  },
  setEnabled(guildId: string, channelId: string, enabled: boolean) {
    ChannelConfig.set(guildId, channelId, "reminders.enabled", enabled ? "true" : "false");
  },
  setIntervalHours(guildId: string, channelId: string, hours: number) {
    const v = Math.max(1, Math.floor(hours));
    ChannelConfig.set(guildId, channelId, "reminders.intervalHours", String(v));
  },
  setLastSentNow(guildId: string, channelId: string) {
    ChannelConfig.set(guildId, channelId, "reminders.lastSent", String(Date.now()));
  },
  setStartTime(guildId: string, channelId: string, hhmm: string) {
    ChannelConfig.set(guildId, channelId, "reminders.startTime", hhmm);
  },
  clearStartTime(guildId: string, channelId: string) {
    ChannelConfig.delete(guildId, channelId, "reminders.startTime");
  },
};
