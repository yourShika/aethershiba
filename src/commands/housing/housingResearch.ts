
import {
    MessageFlags,
    SlashCommandSubcommandBuilder,
    ActionRowBuilder,
    ChatInputCommandInteraction,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';
import { DATACENTERS, DISTRICT_OPTIONS } from '../../const/housing/housing';

const builder = new SlashCommandSubcommandBuilder()
    .setName('research')
    .setDescription('Recherchiere interaktiv im Chat')

export default {
    name: builder.name,
    description: builder.description,
    async execute(interaction: ChatInputCommandInteraction) {
        if (interaction.options.getSubcommand(true) !== builder.name) return;

        const dcRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('research:dc')
                .setPlaceholder('Datacenter wählen')
                .addOptions(DATACENTERS.map(d => new StringSelectMenuOptionBuilder().setLabel(d).setValue(d)))
                .setMinValues(1)
                .setMaxValues(1),
        );

        const worldRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('research:world')
                .setPlaceholder('Welt wählen')
                .addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Bitte Datacenter wählen')
                        .setValue('placeholder'),
                )
                .setMinValues(1)
                .setMaxValues(1)
                .setDisabled(true),
        );

        const distRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('research:district')
                .setPlaceholder('District(s) wählen')
                .addOptions(DISTRICT_OPTIONS.map(o => new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value)))
                .setMinValues(0)
                .setMaxValues(DISTRICT_OPTIONS.length),
        );

        const fcRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('research:fc')
                .setPlaceholder('FC Only?')
                .addOptions(
                    new StringSelectMenuOptionBuilder().setLabel('Beliebig').setValue('any'),
                    new StringSelectMenuOptionBuilder().setLabel('FC only').setValue('true'),
                    new StringSelectMenuOptionBuilder().setLabel('Private only').setValue('false'),
                )
                .setMinValues(1)
                .setMaxValues(1),
        );

        const sizeRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('research:size')
                .setPlaceholder('Hausgröße')
                .addOptions(
                    new StringSelectMenuOptionBuilder().setLabel('Beliebig').setValue('any'),
                    new StringSelectMenuOptionBuilder().setLabel('S').setValue('S'),
                    new StringSelectMenuOptionBuilder().setLabel('M').setValue('M'),
                    new StringSelectMenuOptionBuilder().setLabel('L').setValue('L'),
                )
                .setMinValues(1)
                .setMaxValues(1),
        );

        const goRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('research:go')
                .setLabel('Suchen')
                .setStyle(ButtonStyle.Primary),
        );

        await interaction.reply({
            content: 'Housing Research - wähle Filter:',
            components: [dcRow, worldRow, distRow, fcRow, sizeRow, goRow],
            flags: MessageFlags.Ephemeral,
        });
    },
};