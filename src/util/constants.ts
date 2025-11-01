// Centralized constants and helpers for permissions and component customIds

export const PERMISSION_ADMINISTRATOR = "Administrator" as const;

// CustomId strings used across the app
export const CUSTOM_ID_PREFIX = "when" as const;
export const CUSTOM_ID = {
  DATE_RANGE: `${CUSTOM_ID_PREFIX}:date-range`,
  FIRST: `${CUSTOM_ID_PREFIX}:first`,
  LAST: `${CUSTOM_ID_PREFIX}:last`,
} as const;

export const CUSTOM_ID_ACTIONS = {
  TOGGLE: "toggle",
  TOGGLE_ALL: "toggleAll",
  VIEW: "view",
  CLOSE: "close",
} as const;

export type CustomIdKind =
  | typeof CUSTOM_ID_ACTIONS.TOGGLE
  | typeof CUSTOM_ID_ACTIONS.TOGGLE_ALL
  | typeof CUSTOM_ID_ACTIONS.VIEW
  | typeof CUSTOM_ID_ACTIONS.CLOSE
  | "first"
  | "last"
  | "date-range"
  | "unknown";

export type ParsedCustomId = {
  kind: CustomIdKind;
  pollId?: string;
  date?: string;
};

export function parseCustomId(id: string | undefined | null): ParsedCustomId {
  if (!id) return { kind: "unknown" };
  const parts = id.split(":");
  if (parts[0] !== CUSTOM_ID_PREFIX) return { kind: "unknown" };
  // Simple forms: when:first, when:last, when:date-range
  if (id === CUSTOM_ID.FIRST) return { kind: "first" };
  if (id === CUSTOM_ID.LAST) return { kind: "last" };
  if (id === CUSTOM_ID.DATE_RANGE) return { kind: "date-range" };

  const action = parts[1];
  switch (action) {
    case CUSTOM_ID_ACTIONS.TOGGLE: {
      const pollId = parts[2];
      const date = parts.slice(3).join(":"); // allow dates with ":" theoretically, but ours don't
      // Return even if date is missing so callers can validate payload order-wise
      return pollId
        ? ({
            kind: "toggle",
            pollId,
            ...(date ? { date } : {}),
          } as ParsedCustomId)
        : { kind: "unknown" };
    }
    case CUSTOM_ID_ACTIONS.TOGGLE_ALL: {
      const pollId = parts[2];
      return pollId ? { kind: "toggleAll", pollId } : { kind: "unknown" };
    }
    case CUSTOM_ID_ACTIONS.VIEW: {
      const pollId = parts[2];
      return pollId ? { kind: "view", pollId } : { kind: "unknown" };
    }
    case CUSTOM_ID_ACTIONS.CLOSE: {
      const pollId = parts[2];
      return pollId ? { kind: "close", pollId } : { kind: "unknown" };
    }
    default:
      return { kind: "unknown" };
  }
}
