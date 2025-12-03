import { describe, it, expect } from "vitest";
import { gridExtrasContextFrom } from "../../src/listeners/interactionCreate.js";

describe("gridExtrasContextFrom", () => {
  it("returns null when both guild and client are missing", () => {
    const context = gridExtrasContextFrom({} as any);
    expect(context).toBeNull();
  });

  it("returns guild reference when available", () => {
    const guild = { id: "g1" };
    const ctx = gridExtrasContextFrom({ guild } as any);
    expect(ctx).toEqual({ guild, client: undefined });
  });

  it("returns client reference when available", () => {
    const client = { id: "c1" };
    const ctx = gridExtrasContextFrom({ client } as any);
    expect(ctx).toEqual({ guild: undefined, client });
  });

  it("returns both guild and client when present", () => {
    const guild = { id: "g1" };
    const client = { id: "c1" };
    const ctx = gridExtrasContextFrom({ guild, client } as any);
    expect(ctx).toEqual({ guild, client });
  });
});

