import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';

import { TRIAD_PREFIX } from '../../const/constants.js';
import type { Command } from '../../handlers/commandHandler.js';
import { startTriadSession, triadEmbed } from '../../functions/features/tripleTriadGame.js';

function triadButtons(sessionId: string, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${TRIAD_PREFIX}draw:${sessionId}`)
      .setLabel('Draw')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`${TRIAD_PREFIX}stop:${sessionId}`)
      .setLabel('Stop')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
}

const data = new SlashCommandBuilder()
  .setName('tripletriad')
  .setDescription('Play a quick Triple Triad inspired mini match')
  .addSubcommand(sub => sub.setName('start').setDescription('Start a five-round mini match'));

async function execute(interaction: ChatInputCommandInteraction) {
  const session = startTriadSession(interaction.user.id);
  await interaction.reply({
    embeds: [triadEmbed(session)],
    components: [triadButtons(session.id)],
    flags: interaction.inGuild() ? undefined : MessageFlags.Ephemeral,
  });
}

export { triadButtons };
export default { data, execute, emoji: '🃏' } satisfies Command;
