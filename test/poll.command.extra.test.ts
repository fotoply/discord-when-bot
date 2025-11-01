// filepath: test/poll.command.extra.test.ts
import { describe, expect, it, vi } from "vitest";
import PollCommand from "../src/commands/poll.js";

vi.mock("@sapphire/decorators", () => ({
  ApplyOptions: (_opts: any) => (target: any) => target,
}));
vi.mock("@sapphire/framework", () => ({
  Command: class Command {},
  ApplicationCommandRegistry: class {
    registerChatInputCommand() {}
    registerContextMenuCommand() {}
  },
}));

describe("Poll command extra", () => {
  it("unknown subcommand replies with unknown", async () => {
    const fakeCmd: any = {};
    const interaction: any = {
      options: {
        getSubcommand: () => "nope",
      },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await PollCommand.prototype.chatInputRun.call(fakeCmd, interaction as any);

    expect(interaction.reply).toHaveBeenCalled();
    const arg = interaction.reply.mock.calls[0][0];
    expect(arg.content).toMatch(/Unknown subcommand/);
  });

  it("registerApplicationCommands when GUILD_ID set passes guildIds option", async () => {
    const PollCmd = await import("../src/commands/poll.js");
    const PollCommandClass = PollCmd.default;

    const prev = process.env.GUILD_ID;
    process.env.GUILD_ID = "guild-123";

    let receivedGuildOpt: any = "unset";
    const mockBuilder: any = {
      setName(n: string) {
        return this;
      },
      setDescription(d: string) {
        return this;
      },
      addSubcommand(fn: Function) {
        const sub: any = {
          setName: () => sub,
          setDescription: () => sub,
          addStringOption: (fnOpt: Function) => {
            const opt: any = {
              setName() {
                return opt;
              },
              setDescription() {
                return opt;
              },
              setRequired() {
                return opt;
              },
              addChoices() {
                return opt;
              },
            };
            fnOpt(opt);
            return sub;
          },
          addChannelOption: (fnOpt: Function) => {
            const opt: any = {
              setName() {
                return opt;
              },
              setDescription() {
                return opt;
              },
              setRequired() {
                return opt;
              },
            };
            fnOpt(opt);
            return sub;
          },
          addRoleOption: (fnOpt: Function) => {
            const opt: any = {
              setName() {
                return opt;
              },
              setDescription() {
                return opt;
              },
              setRequired() {
                return opt;
              },
            };
            fnOpt(opt);
            return sub;
          },
        };
        fn(sub);
        return this;
      },
    };

    const registry: any = {
      registerChatInputCommand: (fn: Function, guildOpt?: any) => {
        fn(mockBuilder);
        receivedGuildOpt = guildOpt;
        return undefined;
      },
      registerContextMenuCommand: (_fn: Function, _guildOpt?: any) => {
        // Stub for context menu registration
        return undefined;
      },
    };

    await PollCommandClass.prototype.registerApplicationCommands.call(
      {
        name: "poll",
        description: "d",
      } as any,
      registry as any,
    );

    expect(receivedGuildOpt).toBeDefined();
    expect(receivedGuildOpt.guildIds).toContain("guild-123");

    if (prev === undefined) delete process.env.GUILD_ID;
    else process.env.GUILD_ID = prev;
  });
});
