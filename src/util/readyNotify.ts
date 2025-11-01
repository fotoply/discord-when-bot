import type { Client, SendableChannels } from "discord.js";
import { computeNonResponders } from "./reminders.js";
import { ReadyNotifySettings } from "../store/config.js";

function log(...args: any[]) {
  // eslint-disable-next-line no-console
  console.log("[ready]", ...args);
}

// Back-compat default for tests that invoke setQuietDelayMs directly
let OVERRIDE_DELAY_MS: number | undefined;
export function setQuietDelayMs(ms: number) {
  OVERRIDE_DELAY_MS = Math.max(0, Math.floor(ms));
}

type PollLike = {
  id: string;
  channelId: string;
  creatorId: string;
  messageId?: string | null;
  selections: Map<string, Set<string>>;
  roles?: string[];
  closed?: boolean;
};

type ReadyState = { timeout: ReturnType<typeof setTimeout>; dueAt: number };

const timers = new Map<string, ReadyState>();

// Internal: compute number of eligible members (non-bot, and matching roles when specified)
function computeEligibleCount(poll: PollLike, guild: any): number {
  const roleSet =
    Array.isArray(poll.roles) && poll.roles.length ? new Set(poll.roles) : undefined;
  const cache = guild.members.cache as Map<string, any> | any;
  const iter = cache.values ? cache.values() : Object.values(cache);
  let count = 0;
  for (const member of iter as Iterable<any>) {
    if (member.user?.bot) continue;
    if (roleSet) {
      let hasRole = false;
      if (member.roles?.cache) {
        for (const [rid] of (member.roles.cache as Map<string, any>).entries?.() ?? []) {
          if (roleSet.has(String(rid))) {
            hasRole = true;
            break;
          }
        }
      } else if (Array.isArray(member.roles)) {
        for (const r of member.roles) {
          if (roleSet.has(String(r))) {
            hasRole = true;
            break;
          }
        }
      }
      if (!hasRole) continue;
    }
    count++;
  }
  return count;
}

export async function onPollActivity(client: Client, poll: PollLike, guild: any) {
  if (poll.closed) {
    cancelFor(poll.id);
    return;
  }

  // Populate guild member cache; fine to no-op when fetch is absent
  await guild.members.fetch?.();

  const toPing = computeNonResponders(poll, guild);
  const eligibleCount = computeEligibleCount(poll, guild);
  if (!eligibleCount) {
    cancelFor(poll.id);
    log(`poll ${poll.id}: no eligible members`);
    return;
  }

  const cfg = ReadyNotifySettings.get(guild.id, poll.channelId);
  const delayMs = OVERRIDE_DELAY_MS ?? cfg.delayMs;
  if (!cfg.enabled || delayMs <= 0) {
    cancelFor(poll.id);
    log(`poll ${poll.id}: ready disabled`);
    return;
  }

  if (toPing.length > 0) {
    if (timers.has(poll.id)) {
      cancelFor(poll.id);
      log(`poll ${poll.id}: canceled pending notify`);
    }
    return;
  }

  if (timers.has(poll.id)) clearTimeout(timers.get(poll.id)!.timeout);
  const dueAt = Date.now() + delayMs;
  const timeout = setTimeout(async () => {
    timers.delete(poll.id);
    const channel = await client.channels.fetch(poll.channelId);
    const guildNow = (channel as any).guild ?? guild;
    await guildNow.members.fetch?.();
    const stillNone = computeNonResponders(poll, guildNow).length === 0;
    if (!stillNone || poll.closed) return;
    const content = `All set — everyone has answered. <@${poll.creatorId}>, your dates are ready.`;
    const sendOptions: any = { content };
    if (poll.messageId)
      sendOptions.reply = { messageReference: poll.messageId, failIfNotExists: false };
    try {
      await (channel as SendableChannels).send(sendOptions);
    } catch (e: any) {
      log(`poll ${poll.id}: send failed:`, e?.message ?? e);
    }
  }, delayMs);
  timers.set(poll.id, { timeout, dueAt });
  log(
    `poll ${poll.id}: scheduled ready notification in ${Math.round(delayMs / 1000)}s (dueAt=${new Date(
      dueAt,
    ).toISOString()})`,
  );
}

export function cancelFor(pollId: string) {
  const st = timers.get(pollId);
  if (st) {
    clearTimeout(st.timeout);
    timers.delete(pollId);
  }
}

// For tests/debugging
export function getPendingDueAt(pollId: string): number | undefined {
  return timers.get(pollId)?.dueAt;
}
