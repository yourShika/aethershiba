import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { DATACENTERS, DISTRICT_OPTIONS } from '../../const/housing/housing.js';
import { PaissaProvider } from '../../functions/housing/housingProvider.paissa.js';
import { plotEmbed } from './embed.js';

// Slash command "/housing run" used to test the housing API with optional filters.
export const data = new SlashCommandBuilder()
    .setName('housing')
    .setDescription('Housing utilities')
    .addSubcommand(sub =>
        sub
            .setName('run')
            .setDescription('Check for free housing plots')
            .addStringOption(opt =>
                opt.setName('dc')
                    .setDescription('Datacenter')
                    .addChoices(...DATACENTERS.map(d => ({ name: d, value: d })))
            )
            .addStringOption(opt =>
                opt.setName('world')
                    .setDescription('World')
            )
            .addStringOption(opt =>
                opt.setName('district')
                    .setDescription('District')
                    .addChoices(...DISTRICT_OPTIONS.map(o => ({ name: o.label, value: o.value })))
            )
            .addBooleanOption(opt =>
                opt.setName('fc_only')
                    .setDescription('Nur Free Company Plots')
            )
    ) as SlashCommandBuilder;

export async function execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommand() !== 'run') return;

    const dc = interaction.options.getString('dc') ?? 'Light';
    const world = interaction.options.getString('world') ?? 'Alpha';
    const district = interaction.options.getString('district');
    const fcOnly = interaction.options.getBoolean('fc_only');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const provider = new PaissaProvider();
    let plots = await provider.fetchFreePlots(dc, world, district ? [district] : []);
    if (fcOnly !== null) {
        plots = plots.filter(p => p.fcOnly === fcOnly);
    }

    if (plots.length === 0) {
        await interaction.editReply({ content: 'Keine freien Grundstücke gefunden.' });
        return;
    }

    const embeds = plots.slice(0, 10).map(plotEmbed);
    await interaction.editReply({ content: `Gefundene Grundstücke (${plots.length})`, embeds });
}

export default { data, execute };
