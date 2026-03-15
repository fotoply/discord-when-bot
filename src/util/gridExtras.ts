import type { Poll } from "../store/polls.js";

export type GridExtras = {
  userIds?: string[];
  rowLabels?: string[];
  rowAvatars?: (Buffer | undefined)[];
  userLabelResolver?: (id: string) => string | undefined;
};

export type GridExtrasContext = {
  guild?: {
    members?: {
      cache?: { get?: (id: string) => unknown };
      fetch?: (id: string) => Promise<unknown>;
    };
  };
  client?: {
    users?: {
      cache?: { get?: (id: string) => unknown };
      fetch?: (id: string) => Promise<unknown>;
    };
  };
} | null;

async function getMember(
  context: GridExtrasContext,
  id: string,
): Promise<any | undefined> {
  const cached = context?.guild?.members?.cache?.get?.(id);
  if (cached) return cached;
  try {
    return await context?.guild?.members?.fetch?.(id);
  } catch {}
  return undefined;
}

async function getUser(
  context: GridExtrasContext,
  id: string,
): Promise<any | undefined> {
  const cached = context?.client?.users?.cache?.get?.(id);
  if (cached) return cached;
  try {
    return await context?.client?.users?.fetch?.(id);
  } catch {}
  return undefined;
}

export async function buildGridExtras(poll: Poll, context: GridExtrasContext) {
  const usersSet = new Set<string>();
  for (const [, set] of poll.selections) for (const u of set) usersSet.add(u);
  const userIds = Array.from(usersSet).sort();

  const labelMap = new Map<string, string>();
  const rowAvatars: (Buffer | undefined)[] = [];

  for (const id of userIds) {
    let label: string | undefined;
    let avatarBuf: Buffer | undefined;

    const member = await getMember(context, id);
    if (member) {
      const u = member.user ?? member;
      label = (member.displayName ??
        member.nickname ??
        u?.globalName ??
        u?.username) as string | undefined;
    }
    if (!label) {
      const user = await getUser(context, id);
      label =
        (user as any)?.displayName ??
        (user as any)?.globalName ??
        (user as any)?.username;
    }
    if (!label) label = id;
    labelMap.set(id, (String(label) ?? "").trim());

    try {
      const userObj = member?.user ?? (await getUser(context, id));
      const url = userObj?.displayAvatarURL?.({
        extension: "png",
        size: 128,
      });
      if (url && (globalThis as any).fetch) {
        const res = await (globalThis as any).fetch(url);
        if (res?.ok) {
          const ab = await res.arrayBuffer();
          avatarBuf = Buffer.from(ab);
        }
      }
    } catch {}
    rowAvatars.push(avatarBuf);
  }

  return {
    userIds,
    rowAvatars,
    userLabelResolver: (id: string) => labelMap.get(id),
  } satisfies GridExtras;
}
