import {
  ChannelType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';

import type { Command } from '../../handlers/commandHandler.js';
import { createId, getGuildFeatures, updateGuildFeatures, type MarketAlert } from '../../functions/features/featureStore.js';
import { fetchMarketQuote, findMarketDeals } from '../../functions/features/marketProvider.js';
import { marketDealsEmbed, marketQuoteEmbed } from '../../embeds/featureEmbeds.js';

function parseItemIds(input: string) {
  return input
    .split(',')
    .map(part => Number(part.trim()))
    .filter(value => Number.isInteger(value) && value > 0);
}

const data = new SlashCommandBuilder()
  .setName('market')
  .setDescription('Marketboard prices, alerts and world-to-world deals')
  .addSubcommand(sub =>
    sub
      .setName('check')
      .setDescription('Check current Universalis prices for an item')
      .addStringOption(opt => opt.setName('world').setDescription('World or region').setRequired(true))
      .addIntegerOption(opt => opt.setName('item_id').setDescription('FFXIV item ID').setMinValue(1).setRequired(true))
      .addStringOption(opt => opt.setName('name').setDescription('Optional display name')),
  )
  .addSubcommand(sub =>
    sub
      .setName('alert-add')
      .setDescription('Create a price alert')
      .addStringOption(opt => opt.setName('world').setDescription('World or region').setRequired(true))
      .addIntegerOption(opt => opt.setName('item_id').setDescription('FFXIV item ID').setMinValue(1).setRequired(true))
      .addIntegerOption(opt => opt.setName('target_price').setDescription('Target price in gil').setMinValue(1).setRequired(true))
      .addStringOption(opt =>
        opt
          .setName('direction')
          .setDescription('Trigger direction')
          .setRequired(true)
          .addChoices(
            { name: 'below target', value: 'below' },
            { name: 'above target', value: 'above' },
          ),
      )
      .addChannelOption(opt =>
        opt
          .setName('channel')
          .setDescription('Alert channel, defaults to current channel')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      )
      .addStringOption(opt => opt.setName('name').setDescription('Optional display name')),
  )
  .addSubcommand(sub =>
    sub
      .setName('alert-list')
      .setDescription('List active price alerts'),
  )
  .addSubcommand(sub =>
    sub
      .setName('alert-remove')
      .setDescription('Remove a price alert')
      .addStringOption(opt => opt.setName('id').setDescription('Alert ID').setRequired(true)),
  )
  .addSubcommand(sub =>
    sub
      .setName('deals')
      .setDescription('Compare item IDs between two worlds and return top candidates')
      .addStringOption(opt => opt.setName('buy_world').setDescription('World to buy from').setRequired(true))
      .addStringOption(opt => opt.setName('sell_world').setDescription('World to sell on').setRequired(true))
      .addStringOption(opt => opt.setName('item_ids').setDescription('Comma-separated item IDs').setRequired(true)),
  );

async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand(true);

  if (sub === 'check') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const world = interaction.options.getString('world', true);
    const itemId = interaction.options.getInteger('item_id', true);
    const name = interaction.options.getString('name') ?? undefined;
    const quote = await fetchMarketQuote(world, itemId);

    if (!quote) {
      await interaction.editReply('No market data was available for that item.');
      return;
    }

    await interaction.editReply({ embeds: [marketQuoteEmbed(quote, name)] });
    return;
  }

  if (sub === 'alert-add') {
    if (!interaction.guildId || !interaction.channelId) {
      await interaction.reply({ content: 'Market alerts can only be configured in a guild channel.', flags: MessageFlags.Ephemeral });
      return;
    }

    const channel = interaction.options.getChannel('channel');
    const channelId = channel?.id ?? interaction.channelId;
    const itemName = interaction.options.getString('name') ?? undefined;
    const alert: MarketAlert = {
      id: createId('mkt'),
      userId: interaction.user.id,
      channelId,
      world: interaction.options.getString('world', true),
      itemId: interaction.options.getInteger('item_id', true),
      targetPrice: interaction.options.getInteger('target_price', true),
      direction: interaction.options.getString('direction', true) as 'below' | 'above',
      createdAt: Date.now(),
      ...(itemName ? { itemName } : {}),
    };

    await updateGuildFeatures(interaction.guildId, (state) => {
      state.marketAlerts = [...(state.marketAlerts ?? []), alert];
      return state;
    });

    await interaction.reply({
      content: `Market alert \`${alert.id}\` created for **${alert.itemName || `Item ${alert.itemId}`}** in <#${channelId}>.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'alert-list') {
    if (!interaction.guildId) {
      await interaction.reply({ content: 'Market alerts are guild-only.', flags: MessageFlags.Ephemeral });
      return;
    }

    const alerts = (await getGuildFeatures(interaction.guildId)).marketAlerts ?? [];
    const content = alerts.length
      ? alerts.map(alert => `\`${alert.id}\` • ${alert.itemName || `Item ${alert.itemId}`} • ${alert.world} • ${alert.direction} ${alert.targetPrice.toLocaleString()} gil • <#${alert.channelId}>`).join('\n')
      : 'No market alerts configured.';
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'alert-remove') {
    if (!interaction.guildId) {
      await interaction.reply({ content: 'Market alerts are guild-only.', flags: MessageFlags.Ephemeral });
      return;
    }

    const id = interaction.options.getString('id', true);
    let removed = false;
    await updateGuildFeatures(interaction.guildId, (state) => {
      const alerts = state.marketAlerts ?? [];
      const next = alerts.filter(alert => alert.id !== id);
      removed = next.length !== alerts.length;
      state.marketAlerts = next;
      return state;
    });

    await interaction.reply({
      content: removed ? `Removed market alert \`${id}\`.` : `No market alert found for \`${id}\`.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'deals') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const buyWorld = interaction.options.getString('buy_world', true);
    const sellWorld = interaction.options.getString('sell_world', true);
    const itemIds = parseItemIds(interaction.options.getString('item_ids', true));

    if (!itemIds.length) {
      await interaction.editReply('Please provide at least one valid item ID.');
      return;
    }

    const deals = await findMarketDeals(itemIds, buyWorld, sellWorld, 30);
    await interaction.editReply({ embeds: [marketDealsEmbed(deals)] });
  }
}

export default { data, execute, emoji: '💹' } satisfies Command;
