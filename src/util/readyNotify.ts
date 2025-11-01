import type { Client, SendableChannels } from "discord.js";
import { computeNonResponders } from "./reminders.js";
import { ReadyNotifySettings } from "../store/config.js";
import { Polls } from "../store/polls.js";

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
  readyNotifiedAt?: number;
};

type ReadyState = { timeout: ReturnType<typeof setTimeout>; dueAt: number };

const timers = new Map<string, ReadyState>();

// Internal: compute number of eligible members (non-bot, and matching roles when specified)
function computeEligibleCount(poll: PollLike, guild: any): number {
  const roleSet =
    Array.isArray(poll.roles) && poll.roles.length
      ? new Set(poll.roles)
      : undefined;
  const cache = guild.members.cache as Map<string, any> | any;
  const iter = cache.values ? cache.values() : Object.values(cache);
  let count = 0;
  for (const member of iter as Iterable<any>) {
    if (member.user?.bot) continue;
    if (roleSet) {
      let hasRole = false;
      if (member.roles?.cache) {
        for (const [rid] of (
          member.roles.cache as Map<string, any>
        ).entries?.() ?? []) {
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

export async function onPollActivity(
  client: Client,
  poll: PollLike,
  guild: any,
) {
  const stored = Polls.get(poll.id);
  const full: PollLike = (stored as any) ?? poll;
  if (full.closed) {
    cancelFor(full.id);
    return;
  }

  // Populate guild member cache; fine to no-op when fetch is absent
  await guild.members.fetch?.();

  const toPing = computeNonResponders(full as any, guild);
  const eligibleCount = computeEligibleCount(full as any, guild);
  if (!eligibleCount) {
    cancelFor(full.id);
    log(`poll ${full.id}: no eligible members`);
    return;
  }

  const cfg = ReadyNotifySettings.get(guild.id, full.channelId);
  const delayMs = OVERRIDE_DELAY_MS ?? cfg.delayMs;
  if (!cfg.enabled || delayMs <= 0) {
    cancelFor(full.id);
    log(`poll ${full.id}: ready disabled`);
    return;
  }

  // If any non-responders remain, cancel pending and clear sent flag to allow a new send later
  if (toPing.length > 0) {
    if (timers.has(full.id)) {
      cancelFor(full.id);
      log(`poll ${full.id}: canceled pending notify`);
    }
    if (stored) Polls.clearReadyNotified(full.id);
    else full.readyNotifiedAt = undefined;
    return;
  }

  // Everyone has responded; do not reschedule if we've already sent in the past
  if (full.readyNotifiedAt) {
    log(
      `poll ${full.id}: already notified at ${new Date(full.readyNotifiedAt).toISOString()}`,
    );
    cancelFor(full.id);
    return;
  }

  if (timers.has(full.id)) clearTimeout(timers.get(full.id)!.timeout);
  const dueAt = Date.now() + delayMs;
  const timeout = setTimeout(async () => {
    timers.delete(full.id);
    const channel = await client.channels.fetch(full.channelId);
    const guildNow = (channel as any).guild ?? guild;
    await guildNow.members.fetch?.();
    const latest = (Polls.get(full.id) as any) ?? full;
    const stillNone =
      computeNonResponders(latest as any, guildNow).length === 0;
    if (!stillNone || latest?.closed) return;
    if (latest?.readyNotifiedAt) return; // double-check
    const content = `All set — everyone has answered. <@${full.creatorId}>, your dates are ready.`;
    const sendOptions: any = { content };
    if (full.messageId)
      sendOptions.reply = {
        messageReference: full.messageId,
        failIfNotExists: false,
      };
    try {
      await (channel as SendableChannels).send(sendOptions);
      if (Polls.get(full.id)) Polls.setReadyNotifiedNow(full.id);
      else (full as any).readyNotifiedAt = Date.now();
      log(
        `poll ${full.id}: sent ready notification to creator ${full.creatorId}`,
      );
    } catch (e: any) {
      log(`poll ${full.id}: send failed:`, e?.message ?? e);
    }
  }, delayMs);
  timers.set(full.id, { timeout, dueAt });
  log(
    `poll ${full.id}: scheduled ready notification in ${Math.round(delayMs / 1000)}s (dueAt=${new Date(
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
