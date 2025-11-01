import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockFramework } from "./helpers.js";
import { buildFutureDates } from "../src/util/date.js";
import { DefaultRole } from "../src/store/config.js";
import { Polls } from "../src/store/polls.js";

describe("Default role per channel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses channel default role when none is specified in /when", async () => {
    const fw = new MockFramework();
    const channelId = "chan-defrole";
    // Set default role using wildcard guildId for tests
    DefaultRole.set("*", channelId, "role-xyz");

    // Create a poll via /when flow
    await fw.emitSlash("when", { channelId, userId: "creatorRole" });
    const future = buildFutureDates(20);
    const first = future[0]!;
    const last = future[1]!;
    await fw.emitSelect("when:first", [first], "creatorRole", channelId);
    await fw.emitSelect("when:last", [last], "creatorRole", channelId);

    // One message posted to the channel
    const chan = fw.getChannel(channelId);
    expect(chan.sent.length).toBe(1);
    const posted = chan.sent[0]!;

    // Should include the role mention prefix
    expect(posted.content).toContain("<@&role-xyz>");

    // There should be an open poll in this channel with roles set
    const open = Polls.allOpen();
    const found = open.find((p) => p.channelId === channelId);
    expect(found).toBeDefined();
    expect(found!.roles).toEqual(["role-xyz"]);
  });

  it("when no default role is set, behaves like before (no role mention)", async () => {
    const fw = new MockFramework();
    const channelId = "chan-nodef";

    await fw.emitSlash("when", { channelId, userId: "creatorNoDef" });
    const future = buildFutureDates(20);
    const first = future[0]!;
    const last = future[1]!;
    await fw.emitSelect("when:first", [first], "creatorNoDef", channelId);
    await fw.emitSelect("when:last", [last], "creatorNoDef", channelId);

    const chan = fw.getChannel(channelId);
    expect(chan.sent.length).toBe(1);
    const posted = chan.sent[0]!;

    // No role mention at the start
    expect(posted.content).not.toMatch(/<@&/);

    // The open poll in this channel should have undefined roles
    const open = Polls.allOpen();
    const found = open.find((p) => p.channelId === channelId);
    expect(found).toBeDefined();
    expect(found!.roles).toBeUndefined();
  });
});
