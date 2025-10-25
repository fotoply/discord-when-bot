import {ApplyOptions} from "@sapphire/decorators";
import {Command} from "@sapphire/framework";
import type {ChatInputCommandInteraction} from "discord.js";
import {ActionRowBuilder, StringSelectMenuBuilder} from "discord.js";
import {buildFutureDates, formatDateLabel} from "../util/date.js";
import { Sessions } from "../store/sessions.js";

function log(...args: any[]) {
    // eslint-disable-next-line no-console
    console.log('[when]', ...args);
}

@ApplyOptions<Command.Options>({
    name: "when",
    description: "Create an availability poll by date range",
})
export default class WhenCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand(
            (builder) => {
                const b = builder
                    .setName(this.name)
                    .setDescription(this.description ?? "Create an availability poll");
                // Add optional role parameter if supported by the builder (tests may mock a simpler builder)
                const anyB = b as any;
                if (typeof anyB.addRoleOption === 'function') {
                    anyB.addRoleOption((opt: any) => opt
                        .setName('role')
                        .setDescription('Optionally notify members of this role')
                        .setRequired(false)
                    );
                }
                return b;
            },
            process.env.GUILD_ID ? {guildIds: [process.env.GUILD_ID]} : undefined,
        );
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const isoDates = buildFutureDates(20);
        const role = (interaction.options as any)?.getRole?.('role') as { id: string } | null | undefined;
        // Persist selected role id in session for this user during the flow (guard for tests that omit user)
        if ((interaction as any)?.user?.id) {
            Sessions.setRoles((interaction.user as any).id, role?.id ? [role.id] : []);
        }
        log(`invoke: guild=${interaction.guildId ?? 'dm'} channel=${(interaction.channel as any)?.id ?? 'unknown'} dates=${isoDates.length}`);

        const firstSelect = new StringSelectMenuBuilder()
            .setCustomId("when:first")
            .setPlaceholder("Select first date")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
                isoDates.map((iso) => ({label: formatDateLabel(iso), value: iso})),
            );

        const lastSelect = new StringSelectMenuBuilder()
            .setCustomId("when:last")
            .setPlaceholder("Select last date (after first)")
            .setMinValues(1)
            .setMaxValues(1)
            .setDisabled(true)
            .addOptions(
                // Placeholder options; will be replaced upon first selection
                isoDates.map((iso) => ({label: formatDateLabel(iso), value: iso})),
            );

        const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            firstSelect,
        );
        const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            lastSelect,
        );

        await interaction.reply({
            content: "Select a date range to create the poll:",
            components: [row1, row2],
            ephemeral: true,
        });
        log('replied with range selectors');
    }
}
