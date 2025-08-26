
import { MessageFlags, SlashCommandSubcommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { runHousingCheckt } from "../../functions/housing/housingRunner";

const builder = new SlashCommandSubcommandBuilder()
    .setName('start')
    .setDescription('Startet die Überwachung mit der gespeicherten Config');

export default {
    name: builder.name,
    description: builder.description,
    async execute(interaction: ChatInputCommandInteraction) {
        if (interaction.options.getSubcommand(true) !== builder.name) return;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const gid = interaction.guildId!;
        const sent = await runHousingCheckt(interaction.client, gid);
        await interaction.editReply({ content: `Housing-Check gestartet - ${sent} Meldung(en).`});
    },
};