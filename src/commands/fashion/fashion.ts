import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';

import { FASHION_PREFIX } from '../../const/constants.js';
import type { Command } from '../../handlers/commandHandler.js';
import { fashionPostEmbed } from '../../embeds/featureEmbeds.js';
import { createId, getGuildFeatures, updateGuildFeatures, type FashionPost } from '../../functions/features/featureStore.js';

function fashionButtons(postId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${FASHION_PREFIX}vote:${postId}:up`)
      .setEmoji('⬆️')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${FASHION_PREFIX}vote:${postId}:down`)
      .setEmoji('⬇️')
      .setStyle(ButtonStyle.Danger),
  );
}

const data = new SlashCommandBuilder()
  .setName('fashion')
  .setDescription('Fashion Report guessing and community outfit voting')
  .addSubcommand(sub =>
    sub
      .setName('submit')
      .setDescription('Submit an outfit or Fashion Report prediction for voting')
      .addStringOption(opt => opt.setName('title').setDescription('Submission title').setRequired(true))
      .addStringOption(opt => opt.setName('notes').setDescription('Pieces, dyes, theme guess or scoring notes'))
      .addStringOption(opt => opt.setName('image_url').setDescription('Outfit screenshot URL')),
  )
  .addSubcommand(sub =>
    sub
      .setName('score')
      .setDescription('Show the score for a submission')
      .addStringOption(opt => opt.setName('id').setDescription('Fashion post ID').setRequired(true)),
  )
  .addSubcommand(sub =>
    sub
      .setName('simulate')
      .setDescription('Create a quick text-only Fashion Report simulator result')
      .addStringOption(opt => opt.setName('head').setDescription('Head slot guess'))
      .addStringOption(opt => opt.setName('body').setDescription('Body slot guess'))
      .addStringOption(opt => opt.setName('legs').setDescription('Leg slot guess'))
      .addStringOption(opt => opt.setName('feet').setDescription('Feet slot guess'))
      .addStringOption(opt => opt.setName('dye').setDescription('Dye guess')),
  );

async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand(true);

  if (!interaction.guildId) {
    await interaction.reply({ content: 'Fashion features are guild-only.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'submit') {
    if (!interaction.channel || !('isTextBased' in interaction.channel) || !interaction.channel.isTextBased()) {
      await interaction.reply({ content: 'No valid channel is available.', flags: MessageFlags.Ephemeral });
      return;
    }

    const post: FashionPost = {
      id: createId('fsh'),
      guildId: interaction.guildId,
      ownerId: interaction.user.id,
      channelId: interaction.channelId,
      title: interaction.options.getString('title', true),
      upvotes: [],
      downvotes: [],
      createdAt: Date.now(),
      ...(interaction.options.getString('notes') ? { notes: interaction.options.getString('notes')! } : {}),
      ...(interaction.options.getString('image_url') ? { imageUrl: interaction.options.getString('image_url')! } : {}),
    };

    const sent = await (interaction.channel as { send: (options: unknown) => Promise<{ id: string }> }).send({
      embeds: [fashionPostEmbed(post)],
      components: [fashionButtons(post.id)],
    });
    post.messageId = sent.id;

    await updateGuildFeatures(interaction.guildId, (state) => {
      state.fashionPosts = [...(state.fashionPosts ?? []), post];
      return state;
    });

    await interaction.reply({ content: `Fashion submission \`${post.id}\` posted.`, flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'score') {
    const id = interaction.options.getString('id', true);
    const post = ((await getGuildFeatures(interaction.guildId)).fashionPosts ?? []).find(entry => entry.id === id);
    if (!post) {
      await interaction.reply({ content: `No fashion submission found for \`${id}\`.`, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ embeds: [fashionPostEmbed(post)], flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'simulate') {
    const slots = ['head', 'body', 'legs', 'feet', 'dye']
      .map(name => {
        const value = interaction.options.getString(name);
        return value ? `**${name}:** ${value}` : null;
      })
      .filter(Boolean);

    const estimate = Math.min(100, 60 + slots.length * 8);
    await interaction.reply({
      content: [
        `Fashion simulator estimate: **${estimate}/100**`,
        slots.join('\n') || 'No outfit pieces provided.',
        'This is a planning helper; final Fashion Report scoring must be verified in-game.',
      ].join('\n\n'),
      flags: MessageFlags.Ephemeral,
    });
  }
}

export { fashionButtons };
export default { data, execute, emoji: '👗' } satisfies Command;
