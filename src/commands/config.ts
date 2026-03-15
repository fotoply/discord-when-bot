import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";
import type { ChatInputCommandInteraction } from "discord.js";
import {
  DefaultRole,
  ReadyNotifySettings,
  ReminderSettings,
} from "../store/config.js";
import { PERMISSION_ADMINISTRATOR } from "../util/constants.js";

@ApplyOptions<Command.Options>({
  name: "config",
  description: "Admin: manage per-channel bot configuration",
})
export default class ConfigCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand(
      (builder: any) =>
        builder
          .setName(this.name)
          .setDescription(this.description ?? "Configure bot settings")
          .addSubcommand((s: any) =>
            s
              .setName("default-role")
              .setDescription("Show or update default role for this channel")
              .addStringOption((o: any) =>
                o
                  .setName("action")
                  .setDescription("show | set | clear")
                  .setRequired(true)
                  .addChoices(
                    { name: "show", value: "show" },
                    { name: "set", value: "set" },
                    { name: "clear", value: "clear" },
                  ),
              )
              .addRoleOption((o: any) =>
                o
                  .setName("role")
                  .setDescription("Role to set as default (for action=set)")
                  .setRequired(false),
              ),
          )
          .addSubcommand((s: any) =>
            s
              .setName("reminders")
              .setDescription("Show or update reminder settings for this channel")
              .addStringOption((o: any) =>
                o
                  .setName("action")
                  .setDescription("show | set")
                  .setRequired(true)
                  .addChoices(
                    { name: "show", value: "show" },
                    { name: "set", value: "set" },
                  ),
              )
              .addStringOption((o: any) =>
                o
                  .setName("enabled")
                  .setDescription("Enable or disable reminders")
                  .setRequired(false)
                  .addChoices(
                    { name: "true", value: "true" },
                    { name: "false", value: "false" },
                  ),
              )
              .addIntegerOption((o: any) =>
                o
                  .setName("interval_hours")
                  .setDescription("Minimum hours between reminders (>=1)")
                  .setRequired(false),
              )
              .addStringOption((o: any) =>
                o
                  .setName("start_time")
                  .setDescription("HH:mm (UTC, :00 only) or 'clear' to unset")
                  .setRequired(false),
              ),
          )
          .addSubcommand((s: any) =>
            s
              .setName("ready")
              .setDescription("Show or update ready notification settings")
              .addStringOption((o: any) =>
                o
                  .setName("action")
                  .setDescription("show | set")
                  .setRequired(true)
                  .addChoices(
                    { name: "show", value: "show" },
                    { name: "set", value: "set" },
                  ),
              )
              .addStringOption((o: any) =>
                o
                  .setName("enabled")
                  .setDescription("Enable or disable ready notifications")
                  .setRequired(false)
                  .addChoices(
                    { name: "true", value: "true" },
                    { name: "false", value: "false" },
                  ),
              )
              .addStringOption((o: any) =>
                o
                  .setName("delay")
                  .setDescription(
                    "Quiet period (e.g., 5m, 30s, 1h). Numbers imply minutes.",
                  )
                  .setRequired(false),
              ),
          ),
      process.env.GUILD_ID ? { guildIds: [process.env.GUILD_ID] } : undefined,
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const member: any = interaction.member as any;
    const isAdmin =
      member?.permissions?.has?.(PERMISSION_ADMINISTRATOR) === true;

    if (!isAdmin) {
      await interaction.reply({
        content: "Only an administrator can use this command.",
        ephemeral: true,
      });
      return;
    }

    if (!interaction.guild || !interaction.channel) {
      await interaction.reply({
        content: "This command must be used in a guild text channel.",
        ephemeral: true,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const action = interaction.options.getString("action", true);
    const guildId = interaction.guild.id;
    const channelId = (interaction.channel as any).id as string;

    if (sub === "default-role") {
      if (action === "show") {
        const current = DefaultRole.get(guildId, channelId);
        await interaction.reply({
          content: current
            ? `Default role for this channel: <@&${current}>`
            : "No default role is set for this channel.",
          ephemeral: true,
        });
        return;
      }

      if (action === "clear") {
        DefaultRole.clear(guildId, channelId);
        await interaction.reply({
          content: "Cleared the default role for this channel.",
          ephemeral: true,
        });
        return;
      }

      if (action === "set") {
        const role = (interaction.options as any).getRole("role") as
          | { id: string; name?: string }
          | null;
        const roleId = role?.id;
        if (!roleId) {
          await interaction.reply({
            content: "Please specify a role to set.",
            ephemeral: true,
          });
          return;
        }
        DefaultRole.set(guildId, channelId, roleId);
        await interaction.reply({
          content: `Default role set to <@&${roleId}> for this channel.`,
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        content: "Unknown action. Use show | set | clear.",
        ephemeral: true,
      });
      return;
    }

    if (sub === "reminders") {
      if (action === "show") {
        const current = ReminderSettings.get(guildId, channelId);
        await interaction.reply({
          content: `Current reminder settings for this channel:\n- enabled: ${current.enabled}\n- intervalHours: ${current.intervalHours}${current.startTime ? `\n- startTime: ${current.startTime} (UTC)` : ""}${current.lastSent ? `\n- lastSent: ${new Date(current.lastSent).toISOString()}` : ""}`,
          ephemeral: true,
        });
        return;
      }

      if (action === "set") {
        const enabledChoice = interaction.options.getString("enabled");
        const intervalHours =
          interaction.options.getInteger("interval_hours") ?? undefined;
        const startTime =
          interaction.options.getString("start_time") ?? undefined;

        if (enabledChoice === "true") {
          ReminderSettings.setEnabled(guildId, channelId, true);
        } else if (enabledChoice === "false") {
          ReminderSettings.setEnabled(guildId, channelId, false);
        }

        if (intervalHours !== undefined) {
          const hours = Math.max(1, Math.floor(intervalHours));
          ReminderSettings.setIntervalHours(guildId, channelId, hours);
        }

        if (startTime !== undefined) {
          if (startTime === "clear") {
            ReminderSettings.clearStartTime(guildId, channelId);
          } else {
            const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(startTime);
            if (!m) {
              await interaction.reply({
                content: "start_time must be in HH:mm (00-23:00-59) format.",
                ephemeral: true,
              });
              return;
            }
            const minutes = Number(m[2]);
            if (minutes !== 0) {
              await interaction.reply({
                content:
                  "start_time minutes must be :00 to align with the hourly scheduler.",
                ephemeral: true,
              });
              return;
            }
            ReminderSettings.setStartTime(guildId, channelId, startTime);
          }
        }

        const updated = ReminderSettings.get(guildId, channelId);
        await interaction.reply({
          content: `Updated reminder settings:\n- enabled: ${updated.enabled}\n- intervalHours: ${updated.intervalHours}${updated.startTime ? `\n- startTime: ${updated.startTime} (UTC)` : ""}`,
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        content: "Unknown action. Use show | set.",
        ephemeral: true,
      });
      return;
    }

    if (sub === "ready") {
      if (action === "show") {
        const current = ReadyNotifySettings.get(guildId, channelId);
        const mins = Math.round(current.delayMs / 60000);
        await interaction.reply({
          content: `Current ready settings for this channel:\n- enabled: ${current.enabled}\n- delay: ${mins} minute(s)`,
          ephemeral: true,
        });
        return;
      }

      if (action === "set") {
        const enabledChoice = interaction.options.getString("enabled");
        const delayStr = interaction.options.getString("delay") ?? undefined;

        if (enabledChoice === "true")
          ReadyNotifySettings.setEnabled(guildId, channelId, true);
        if (enabledChoice === "false")
          ReadyNotifySettings.setEnabled(guildId, channelId, false);

        if (delayStr !== undefined) {
          const ms = parseDelayToMs(delayStr);
          if (ms === undefined) {
            await interaction.reply({
              content:
                "Invalid delay. Use values like '5m', '30s', '1h'. Numbers imply minutes.",
              ephemeral: true,
            });
            return;
          }
          ReadyNotifySettings.setDelayMs(guildId, channelId, ms);
        }

        const updated = ReadyNotifySettings.get(guildId, channelId);
        const mins = Math.round(updated.delayMs / 60000);
        await interaction.reply({
          content: `Updated ready settings:\n- enabled: ${updated.enabled}\n- delay: ${mins} minute(s)`,
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        content: "Unknown action. Use show | set.",
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      content: "Unknown subcommand.",
      ephemeral: true,
    });
  }
}

function parseDelayToMs(input: string): number | undefined {
  const s = String(input).trim().toLowerCase();
  if (!s) return undefined;

  const plain = /^\d+(?:\.\d+)?$/.exec(s);
  if (plain) {
    const v = parseFloat(s);
    if (Number.isNaN(v)) return undefined;
    return Math.max(0, Math.round(v * 60_000));
  }

  const m = /^(\d+(?:\.\d+)?)(\s*[a-z]+)$/.exec(s);
  if (!m) return undefined;
  if (m.length < 3) return undefined;
  if (!m[1]) return undefined;
  if (!m[2]) return undefined;
  const value = parseFloat(m[1]);
  if (Number.isNaN(value)) return undefined;
  const unit = m[2].replace(/\s+/g, "");

  const unitMs: Record<string, number> = {
    ms: 1,
    millisecond: 1,
    milliseconds: 1,
    s: 1000,
    sec: 1000,
    secs: 1000,
    second: 1000,
    seconds: 1000,
    m: 60_000,
    min: 60_000,
    mins: 60_000,
    minute: 60_000,
    minutes: 60_000,
    h: 3_600_000,
    hr: 3_600_000,
    hrs: 3_600_000,
    hour: 3_600_000,
    hours: 3_600_000,
    d: 86_400_000,
    day: 86_400_000,
    days: 86_400_000,
  };

  const mult = unitMs[unit];
  if (!mult) return undefined;
  return Math.max(0, Math.round(value * mult));
}

