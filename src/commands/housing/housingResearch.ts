
import {
    MessageFlags,
    SlashCommandSubcommandBuilder,
    ActionRowBuilder,
    ChatInputCommandInteraction,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
} from 'discord.js';
import { DATACENTERS, DISTRICT_OPTIONS } from '../../const/housing/housing';

const builder = new SlashCommandSubcommandBuilder()
    .setName('research')
    .setDescription('Recherchiere interaktiv in einer DM')

export default {
    name: builder.name,
    description: builder.description,
    async execute(interaction: ChatInputCommandInteraction) {
        if (interaction.options.getSubcommand(true) !== builder.name) return;

        await interaction.reply({ content: 'Ich habe dir eine DM Geschickt', flags: MessageFlags.Ephemeral });
        const dm = await interaction.user.createDM();

        const dcRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('research:dc')
                .setPlaceholder('Datacenter wählen')
                .addOptions(DATACENTERS.map(d => new StringSelectMenuOptionBuilder().setLabel(d).setValue(d)))
                .setMinValues(1)
                .setMaxValues(1),
        );

        const distRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('research:district')
                .setPlaceholder('District(s) wählen')
                .addOptions(DISTRICT_OPTIONS.map(o => new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value)))
                .setMinValues(0)
                .setMaxValues(DISTRICT_OPTIONS.length),
        );

        await dm.send({ content: 'Housing Research - wähle Filter:', components: [dcRow, distRow ]});
    },
};