import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { runHousingCheckt } from "../../functions/housing/housingRunner";

export const data = new SlashCommandBuilder()
    .setName('housing-run')
    .setDescription('Check for free housing plots in your configured districts');

export async function execute(interaction: ChatInputCommandInteraction) {
    const sent = await runHousingCheckt(interaction.client, interaction.guildId!);
    await interaction.reply({ content: `Fertig. Gesendet: ${sent}`, flags: MessageFlags.Ephemeral });
}

export default { data, execute };