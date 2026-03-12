import type {
  Client,
  GuildMember,
  SendableChannels,
  TextBasedChannel,
} from "discord.js";
import { ReminderSettings } from "../store/config.js";

function log(...args: any[]) {
  // Always log reminders activity by default
  // eslint-disable-next-line no-console
  console.log("[reminders]", ...args);
}

export type SendRemindersOptions = {
  channelId?: string; // if provided, only send for polls in this channel
  force?: boolean; // if true, bypass interval throttle
};

function parseStart(
  hhmm: string | undefined,
): { h: number; m: number } | undefined {
  if (!hhmm) return undefined;
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return { h, m: min };
}

function isDueAtThisTick(
  now: Date,
  start: { h: number; m: number },
  intervalHours: number,
  lastSent?: number,
): boolean {
  // We schedule on UTC boundaries only
  const nowMin = now.getUTCMinutes();
  if (nowMin !== start.m) return false; // only fire on the minute specified (recommend 00)

  // Find the last slot time <= now based on start + n*interval
  // Compute minutes since start of day
  const minutesToday = now.getUTCHours() * 60 + nowMin;
  const startMinutes = start.h * 60 + start.m;
  const intervalMinutes = Math.max(60, intervalHours * 60);

  let k: number;
  if (minutesToday < startMinutes) {
    // Before today's first slot -> use yesterday's slots
    const total = 24 * 60 - (startMinutes - minutesToday);
    k = Math.floor(total / intervalMinutes);
  } else {
    k = Math.floor((minutesToday - startMinutes) / intervalMinutes);
  }

  const lastSlot = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      start.h,
      start.m,
      0,
      0,
    ),
  );
  lastSlot.setUTCMinutes(lastSlot.getUTCMinutes() + k * intervalMinutes);

  if (lastSlot.getTime() > now.getTime()) return false; // shouldn't happen due to floor, but guard

  // If we've already sent at or after the last slot, skip
  if (lastSent && lastSent >= lastSlot.getTime()) return false;

  // Only emit at exact aligned hour/minute
  return (minutesToday - startMinutes) % intervalMinutes === 0;
}

// Split a mentions list into multiple Discord-safe messages, each with the given prefix.
function splitReminderMessages(
  mentions: string[],
  prefix: string,
  max = 2000,
): string[] {
  const out: string[] = [];
  let current = "";
  for (const mention of mentions) {
    // Include a space before each mention except when the chunk currently has no mentions appended yet (beyond prefix)
    const sep = current.length ? " " : "";
    const candidate = current + sep + mention;
    // If prefix + candidate would overflow, flush current (if any) and start a new chunk with this mention
    if (prefix.length + candidate.length > max) {
      if (current.length) out.push(prefix + current);
      // If even a single mention cannot fit alongside the prefix (extremely unlikely), we still send it alone.
      current = mention;
      // In very pathological cases where prefix is near 2000, we rely on Discord rejection which isn't applicable here.
      continue;
    }
    current = candidate;
  }
  if (current.length) out.push(prefix + current);
  return out.length ? out : [prefix.trimEnd()];
}

function valuesOf<T>(cache: any): T[] {
  if (!cache) return [];
  if (typeof cache.values === "function") return Array.from(cache.values());
  if (cache.cache) return valuesOf<T>(cache.cache);
  return Object.values(cache) as T[];
}

function canAccessChannel(channel: any, member: any): boolean {
  if (!channel || !member || typeof channel.permissionsFor !== "function") {
    return true;
  }

  try {
    const perms = channel.permissionsFor(member);
    if (!perms || typeof perms.has !== "function") return true;
    return perms.has("ViewChannel") === true;
  } catch {
    return true;
  }
}

async function waitForMembersFetch(
  guild: any,
  timeoutMs: number,
): Promise<void> {
  const fetchMembers = guild?.members?.fetch;
  if (typeof fetchMembers !== "function") return;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve(fetchMembers.call(guild.members)).then(() => undefined),
      new Promise<void>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error("Members didn't arrive in time."));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Compute non-responders for a poll within a guild (excludes bots and respects poll.roles if specified)
export function computeNonResponders(poll: any, guild: any, channel?: any): string[] {
  // Build responded set from all selections (including NONE_SELECTION)
  const responded = new Set<string>();
  for (const set of poll.selections.values()) {
    for (const userId of set) responded.add(userId);
  }

  // If roles were specified for this poll, restrict candidates to members who have at least one of those roles
  const roleSet: Set<string> | undefined =
    Array.isArray(poll.roles) && poll.roles.length
      ? new Set<string>(poll.roles)
      : undefined;

  // Determine non-responders: all non-bot guild members not in responded (and in roles if set)
  const toPing: string[] = [];
  const channelMembers = valuesOf<GuildMember>(channel?.members as any);
  const guildMembers = valuesOf<GuildMember>(guild?.members?.cache as any);
  const members = channelMembers.length ? channelMembers : guildMembers;

  for (const member of members) {
    const m: any = member as any;
    if (m?.user?.bot) continue;
    if (!channelMembers.length && !canAccessChannel(channel, m)) continue;
    if (roleSet) {
      const rolesForMember = m?.roles?.cache
        ? Array.from(m.roles.cache.keys?.() ?? m.roles.cache.keys?.())
        : Array.isArray(m?.roles)
          ? m.roles
          : undefined;
      let hasRole = false;
      if (Array.isArray(rolesForMember)) {
        for (const r of rolesForMember) {
          if (roleSet.has(String(r))) {
            hasRole = true;
            break;
          }
        }
      } else if (
        m?.roles &&
        typeof m.roles === "object" &&
        typeof m.roles.cache === "object"
      ) {
        for (const [rid] of (m.roles.cache as Map<string, any>).entries?.() ??
          []) {
          if (roleSet.has(String(rid))) {
            hasRole = true;
            break;
          }
        }
      } else if (m?.roles?.cache?.forEach) {
        m.roles.cache.forEach((_v: any, k: string) => {
          if (roleSet.has(String(k))) hasRole = true;
        });
      }
      if (!hasRole) continue;
    }
    if (responded.has(m.id)) continue;
    toPing.push(m.id);
  }
  return toPing;
}

export async function sendReminders(
  client: Client,
  Polls: any,
  options?: SendRemindersOptions,
) {
  const openPolls = Polls.allOpen();
  const memberFetchCache = new Map<string, Promise<void>>();
  const configCache = new Map<
    string,
    {
      enabled: boolean;
      intervalHours: number;
      lastSent?: number;
      startTime?: string;
    }
  >();
  log(
    `Scanning ${openPolls.length} open polls${options?.channelId ? ` (channelId=${options.channelId})` : ""}${options?.force ? " [force]" : ""}.`,
  );
  for (const poll of openPolls) {
    if (options?.channelId && poll.channelId !== options.channelId) continue;
    try {
      const channel = (await client.channels
        .fetch(poll.channelId)
        .catch((e) => {
          log(`fetch channel failed for ${poll.channelId}:`, e?.message ?? e);
          return null;
        })) as any;
      if (!channel || !("messages" in channel) || !channel.send) {
        log(`skip poll ${poll.id}: channel not sendable`);
        continue;
      }

      const guild = (channel as any).guild;
      if (!guild) {
        log(`skip poll ${poll.id}: no guild on channel`);
        continue;
      }

      // Per-channel reminders configuration; guard against missing ids in tests/mocks
      const guildId: string | undefined = guild?.id;
      const chanId: string | undefined = channel?.id ?? poll.channelId;

      let enabled = true;
      let intervalHours = 24;
      let lastSent: number | undefined = undefined;
      let startTime: string | undefined = undefined;
      if (guildId && chanId) {
        const configKey = `${guildId}:${chanId}`;
        const cfg =
          configCache.get(configKey) ?? ReminderSettings.get(guildId, chanId);
        configCache.set(configKey, cfg);
        enabled = cfg.enabled;
        intervalHours = cfg.intervalHours;
        lastSent = cfg.lastSent;
        startTime = cfg.startTime;
        log(
          `poll ${poll.id}: cfg enabled=${enabled} interval=${intervalHours}h start=${startTime ?? "unset"} lastSent=${lastSent ?? "unset"}`,
        );
      }

      if (!enabled && !options?.force) {
        log(`skip poll ${poll.id}: disabled via config`);
        continue;
      }

      if (!options?.force) {
        const now = new Date();
        const start = parseStart(startTime);
        if (start) {
          if (!isDueAtThisTick(now, start, intervalHours, lastSent)) {
            log(
              `skip poll ${poll.id}: not due for start=${startTime} interval=${intervalHours}h`,
            );
            continue;
          }
        } else {
          if (
            lastSent &&
            Date.now() - lastSent < intervalHours * 60 * 60 * 1000
          ) {
            log(
              `skip poll ${poll.id}: interval not elapsed (${intervalHours}h)`,
            );
            continue;
          }
        }
      } else {
        log(`force sending reminders for poll ${poll.id}`);
      }

      // Ensure members cache is populated
      if (guildId) {
        const existingFetch = memberFetchCache.get(guildId);
        if (existingFetch) {
          await existingFetch;
        } else {
          const timeoutMs = options?.force ? 1500 : 5000;
          const fetchPromise = waitForMembersFetch(guild, timeoutMs).catch((e) => {
            log(`members.fetch failed:`, (e as any)?.message ?? e);
          });
          memberFetchCache.set(guildId, fetchPromise);
          await fetchPromise;
        }
      } else {
        try {
          await waitForMembersFetch(guild, options?.force ? 1500 : 5000);
        } catch (e) {
          log(`members.fetch failed:`, (e as any)?.message ?? e);
        }
      }

      const toPing = computeNonResponders(poll, guild, channel);
      log(`poll ${poll.id}: toPing=${toPing.length}`);

      // If there's an old reminder, try to delete it regardless
      if (poll.reminderMessageId) {
        try {
          await (channel as TextBasedChannel & any).messages.delete(
            poll.reminderMessageId,
          );
          log(`deleted previous reminder ${poll.reminderMessageId}`);
        } catch (e) {
          log(`delete previous reminder failed:`, (e as any)?.message ?? e);
        }
        Polls.setReminderMessageId(poll.id, undefined);
      }

      // If nobody to ping, skip sending a new reminder
      if (toPing.length === 0) {
        log(`skip poll ${poll.id}: no members to ping`);
        continue;
      }

      // Build mention strings and split across multiple messages as needed
      const mentions = toPing.map((id) => `<@${id}>`);
      const prefix = `Reminder: please respond to the poll${poll.messageId ? " above" : ""}. `;
      const chunks = splitReminderMessages(mentions, prefix, 2000);

      let firstSentId: string | undefined;
      for (const content of chunks) {
        const sendOptions: any = { content };
        // When possible, make the reminder a reply to the original poll message for better context
        if (poll.messageId) {
          sendOptions.reply = {
            messageReference: poll.messageId,
            failIfNotExists: false,
          };
        }
        const sent = await (channel as SendableChannels).send(sendOptions);
        if (!firstSentId) firstSentId = (sent as any).id;
      }
      log(`sent ${chunks.length} reminder message(s) for poll ${poll.id}`);
      if (firstSentId) Polls.setReminderMessageId(poll.id, firstSentId);

      // Persist lastSent only when a reminder is actually sent
      if (guildId && chanId) {
        ReminderSettings.setLastSentNow(guildId, chanId);
      }
    } catch (err) {
      // Ignore errors per poll to avoid blocking others
      log(`error for poll ${poll.id}:`, (err as any)?.message ?? err);
    }
  }
}
