import type { Client, SendableChannels } from "discord.js";
import { computeEligibleMemberIds, computeNonResponders } from "./reminders.js";
import { ReadyNotifySettings } from "../store/config.js";
import { Polls } from "../store/polls.js";

function log(...args: any[]) {
  // eslint-disable-next-line no-console
  console.log("[ready]", ...args);
}

function getErrorDetail(error: unknown): unknown {
  if (error && typeof error === "object" && "message" in error) {
    return (error as { message?: unknown }).message ?? error;
  }
  return error;
}

async function fetchMembersBestEffort(
  guild: any,
  pollId: string,
  phase: string,
) {
  try {
    await guild?.members?.fetch?.();
  } catch (error) {
    log(
      `poll ${pollId}: members.fetch failed during ${phase}; using cached members only:`,
      getErrorDetail(error),
    );
  }
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

export async function onPollActivity(
  client: Client,
  poll: PollLike,
  guild: any,
) {
  const stored = Polls.get(poll.id) as PollLike | undefined;
  const full: PollLike = stored ?? poll;
  if (full.closed) {
    cancelFor(full.id);
    return;
  }

  const toPing = computeNonResponders(full, guild);

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
    const channelWithGuild = channel as { guild?: any };
    const guildNow = channelWithGuild.guild ?? guild;
    await fetchMembersBestEffort(guildNow, full.id, "timer");
    const latest = (Polls.get(full.id) as PollLike | undefined) ?? full;
    const eligibleCount = computeEligibleMemberIds(latest, guildNow).length;
    if (!eligibleCount) {
      log(`poll ${full.id}: no eligible members at send time`);
      return;
    }
    const stillNone = computeNonResponders(latest, guildNow).length === 0;
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
      else full.readyNotifiedAt = Date.now();
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
