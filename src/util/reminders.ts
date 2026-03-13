import type {
  Client,
  GuildMember,
  SendableChannels,
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

type PreparedPoll = {
  poll: PollLike;
  channel: ChannelLike;
  guild: GuildLike;
  guildId?: string;
  chanId?: string;
};

type PollLike = {
  id: string;
  channelId: string;
  messageId?: string | null;
  reminderMessageId?: string | null;
  roles?: string[];
  selections: Map<string, Set<string>>;
};

type MemberLike = {
  id: string;
  user?: { bot?: boolean };
  roles?: { cache?: Map<unknown, unknown> } | unknown[];
};

type GuildLike = {
  id?: string;
  members?: {
    cache?: unknown;
    fetch?: () => Promise<unknown>;
  };
};

type ChannelLike = {
  id?: string;
  guild?: GuildLike;
  members?: unknown;
  permissionsFor?: (member: MemberLike) => { has?: (perm: string) => boolean } | undefined;
  messages?: {
    delete: (messageId: string) => Promise<unknown>;
  };
  send?: (options: unknown) => Promise<{ id?: string }>;
};

function getErrorDetail(error: unknown): unknown {
  if (
    error &&
    typeof error === "object" &&
    "message" in error
  ) {
    return (error as { message?: unknown }).message ?? error;
  }
  return error;
}

type FetchQueueJob<T> = {
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  jitterMaxMs: number;
};

const IS_TEST_ENV = process.env.NODE_ENV === "test";
const DEFAULT_FETCH_JITTER_MAX_MS = IS_TEST_ENV ? 0 : 600;
const DEFAULT_FETCH_STAGGER_MAX_MS = IS_TEST_ENV ? 0 : 2000;
const DEFAULT_FETCH_CONCURRENCY = 1;

const fetchQueue: {
  active: number;
  pending: FetchQueueJob<any>[];
} = {
  active: 0,
  pending: [],
};

function getPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function getFetchQueueConcurrency(): number {
  return Math.max(
    1,
    getPositiveIntEnv("WHEN_MEMBER_FETCH_QUEUE_CONCURRENCY", DEFAULT_FETCH_CONCURRENCY),
  );
}

function getFetchJitterMaxMs(): number {
  return getPositiveIntEnv(
    "WHEN_MEMBER_FETCH_JITTER_MAX_MS",
    DEFAULT_FETCH_JITTER_MAX_MS,
  );
}

function getFetchStartStaggerMaxMs(): number {
  return getPositiveIntEnv(
    "WHEN_MEMBER_FETCH_STAGGER_MAX_MS",
    DEFAULT_FETCH_STAGGER_MAX_MS,
  );
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomIntInclusive(max: number): number {
  if (max <= 0) return 0;
  return Math.floor(Math.random() * (max + 1));
}

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function computeGuildStartStaggerMs(guildId: string | undefined): number {
  if (!guildId) return 0;
  const maxMs = getFetchStartStaggerMaxMs();
  if (maxMs <= 0) return 0;
  return hashString(guildId) % (maxMs + 1);
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

function drainFetchQueue() {
  const concurrency = getFetchQueueConcurrency();
  while (fetchQueue.active < concurrency && fetchQueue.pending.length > 0) {
    const job = fetchQueue.pending.shift()!;
    fetchQueue.active += 1;
    void (async () => {
      try {
        const jitterDelay = randomIntInclusive(job.jitterMaxMs);
        if (jitterDelay > 0) await sleep(jitterDelay);
        const result = await job.run();
        job.resolve(result);
      } catch (e) {
        job.reject(e);
      } finally {
        fetchQueue.active -= 1;
        drainFetchQueue();
      }
    })();
  }
}

function enqueueMemberFetch<T>(
  run: () => Promise<T>,
  jitterMaxMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    fetchQueue.pending.push({ run, resolve, reject, jitterMaxMs });
    drainFetchQueue();
  });
}

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

function valuesOf<T>(cache: unknown): T[] {
  if (!cache) return [];

  const cacheWithValues = cache as {
    values?: () => Iterable<T>;
    cache?: unknown;
  };
  const values = cacheWithValues.values?.();
  if (values) return Array.from(values);

  if (cacheWithValues.cache) return valuesOf<T>(cacheWithValues.cache);
  if (typeof cache === "object") return Object.values(cache as Record<string, T>);
  return [];
}

function canAccessChannel(channel: ChannelLike | undefined, member: MemberLike | undefined): boolean {
  if (!channel || !member) {
    return true;
  }

  try {
    const perms = channel.permissionsFor?.(member);
    if (!perms) return true;
    return perms?.has?.("ViewChannel") === true;
  } catch {
    return false;
  }
}

function getMemberRoleIds(member: MemberLike | undefined): string[] {
  if (Array.isArray(member?.roles)) {
    return member.roles.map((roleId: unknown) => String(roleId));
  }

  const roleCache = member?.roles?.cache;
  if (!roleCache) return [];

  return Array.from(roleCache.keys(), (roleId: unknown) => String(roleId));
}

async function waitForMembersFetch(
  guild: GuildLike | undefined,
  timeoutMs: number,
): Promise<void> {
  const fetchPromise = guild?.members?.fetch?.();
  if (!fetchPromise) return;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve(fetchPromise).then(() => undefined),
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

async function fetchMembersWithQueue(
  guild: GuildLike,
  guildId: string | undefined,
  timeoutMs: number,
): Promise<void> {
  const startStaggerMs = computeGuildStartStaggerMs(guildId);
  const jitterMaxMs = getFetchJitterMaxMs();

  return enqueueMemberFetch(async () => {
    if (startStaggerMs > 0) await sleep(startStaggerMs);
    try {
      await waitForMembersFetch(guild, timeoutMs);
    } catch (e) {
      log(
        `members.fetch failed${guildId ? ` for guild ${guildId}` : ""}; using cached members only:`,
        getErrorDetail(e),
      );
    }
  }, jitterMaxMs);
}

// Compute non-responders for a poll within a guild (excludes bots and respects poll.roles if specified)
export function computeNonResponders(
  poll: PollLike,
  guild: GuildLike,
  channel?: ChannelLike,
): string[] {
  // Build responded set from all selections (including NONE_SELECTION)
  const responded = new Set<string>();
  for (const set of poll.selections.values()) {
    for (const userId of set) responded.add(userId);
  }

  const eligibleMemberIds = computeEligibleMemberIds(poll, guild, channel);
  return eligibleMemberIds.filter((memberId) => !responded.has(memberId));
}

export function computeEligibleMemberIds(
  poll: PollLike,
  guild: GuildLike,
  channel?: ChannelLike,
): string[] {
  const roleSet: Set<string> | undefined =
    Array.isArray(poll.roles) && poll.roles.length
      ? new Set<string>(poll.roles)
      : undefined;

  const channelMembers = valuesOf<MemberLike>(channel?.members);
  const guildMembers = valuesOf<MemberLike>(guild?.members?.cache);
  const members = channelMembers.length ? channelMembers : guildMembers;
  const eligible: string[] = [];

  for (const member of members) {
    if (member?.user?.bot) continue;
    if (!channelMembers.length && !canAccessChannel(channel, member)) continue;
    if (roleSet) {
      const roleIds = getMemberRoleIds(member);
      let hasRole = false;
      for (const roleId of roleIds) {
        if (roleSet.has(roleId)) {
          hasRole = true;
          break;
        }
      }
      if (!hasRole) continue;
    }
    if (member?.id) eligible.push(member.id);
  }

  return eligible;
}

export async function sendReminders(
  client: Client,
  Polls: any,
  options?: SendRemindersOptions,
) {
  const openPolls: PollLike[] = Polls.allOpen();
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
  const prepared: PreparedPoll[] = [];
  log(
    `Scanning ${openPolls.length} open polls${options?.channelId ? ` (channelId=${options.channelId})` : ""}${options?.force ? " [force]" : ""}.`,
  );
  for (const poll of openPolls) {
    if (options?.channelId && poll.channelId !== options.channelId) continue;
    try {
      const channel = (await client.channels
        .fetch(poll.channelId)
        .catch((e) => {
          log(`fetch channel failed for ${poll.channelId}:`, getErrorDetail(e));
          return null;
        })) as ChannelLike | null;
      if (!channel?.messages || !channel.send) {
        log(`skip poll ${poll.id}: channel not sendable`);
        continue;
      }

      const guild = channel.guild;
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

      prepared.push({
        poll,
        channel,
        guild,
        guildId,
        chanId,
      });
    } catch (err) {
      // Ignore errors per poll to avoid blocking others
      log(`error while preparing poll ${poll.id}:`, getErrorDetail(err));
    }
  }

  const sortedPrepared = shuffleInPlace([...prepared]);

  for (const item of sortedPrepared) {
    const { poll, channel, guild, guildId, chanId } = item;
    try {
      // Ensure members cache is populated, but continue with cache-only mode on fetch failure.
      const timeoutMs = options?.force ? 1500 : 5000;

      if (guildId) {
        const existingFetch = memberFetchCache.get(guildId);
        if (existingFetch) {
          await existingFetch;
        } else {
          const fetchPromise = fetchMembersWithQueue(guild, guildId, timeoutMs);
          memberFetchCache.set(guildId, fetchPromise);
          await fetchPromise;
        }
      } else {
        await fetchMembersWithQueue(guild, undefined, timeoutMs);
      }

      const toPing = computeNonResponders(poll, guild, channel);
      log(`poll ${poll.id}: toPing=${toPing.length}`);

      // If there's an old reminder, try to delete it regardless
      if (poll.reminderMessageId) {
        try {
          await channel.messages?.delete(
            poll.reminderMessageId,
          );
          log(`deleted previous reminder ${poll.reminderMessageId}`);
        } catch (e) {
          log(`delete previous reminder failed:`, getErrorDetail(e));
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
        const sendOptions: {
          content: string;
          reply?: {
            messageReference: string;
            failIfNotExists: boolean;
          };
        } = { content };
        // When possible, make the reminder a reply to the original poll message for better context
        if (poll.messageId) {
          sendOptions.reply = {
            messageReference: poll.messageId,
            failIfNotExists: false,
          };
        }
        const sent = await (channel as SendableChannels).send(sendOptions);
        if (!firstSentId && sent?.id) firstSentId = sent.id;
      }
      log(`sent ${chunks.length} reminder message(s) for poll ${poll.id}`);
      if (firstSentId) Polls.setReminderMessageId(poll.id, firstSentId);

      // Persist lastSent only when a reminder is actually sent
      if (guildId && chanId) {
        ReminderSettings.setLastSentNow(guildId, chanId);
      }
    } catch (err) {
      // Ignore errors per poll to avoid blocking others
      log(`error for poll ${poll.id}:`, getErrorDetail(err));
    }
  }
}
