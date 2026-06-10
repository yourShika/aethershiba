import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';

import type { Command } from '../../handlers/commandHandler.js';
import { marketQuizEmbed } from '../../embeds/featureEmbeds.js';
import { fetchMarketQuote } from '../../functions/features/marketProvider.js';

const data = new SlashCommandBuilder()
  .setName('quiz')
  .setDescription('Community quiz games')
  .addSubcommand(sub =>
    sub
      .setName('market')
      .setDescription('Guess an item price and compare it with current market data')
      .addStringOption(opt => opt.setName('world').setDescription('World or region').setRequired(true))
      .addIntegerOption(opt => opt.setName('item_id').setDescription('FFXIV item ID').setMinValue(1).setRequired(true))
      .addIntegerOption(opt => opt.setName('guess').setDescription('Your gil guess').setMinValue(1).setRequired(true)),
  );

async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const world = interaction.options.getString('world', true);
  const itemId = interaction.options.getInteger('item_id', true);
  const guess = interaction.options.getInteger('guess', true);
  const quote = await fetchMarketQuote(world, itemId);
  await interaction.editReply({
    embeds: [marketQuizEmbed(itemId, world, guess, quote?.minPrice ?? null)],
  });
}

export default { data, execute, emoji: '🧠' } satisfies Command;
