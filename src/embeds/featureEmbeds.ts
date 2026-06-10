import { Colors, EmbedBuilder } from 'discord.js';

import type {
  CommunityEvent,
  FashionPost,
  MarketAlert,
  NewsConfig,
} from '../functions/features/featureStore.js';
import type { MarketDeal, MarketQuote } from '../functions/features/marketProvider.js';
import type { NewsItem } from '../functions/features/newsProvider.js';

const DASH = '—';

function clamp(value: string, max = 1024) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function gil(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toLocaleString()} gil`
    : DASH;
}

function timeTag(timestamp: number, style: 'F' | 'R' = 'F') {
  return `<t:${Math.floor(timestamp / 1000)}:${style}>`;
}

export function marketQuoteEmbed(quote: MarketQuote, itemName?: string) {
  const listings = quote.listings.slice(0, 5)
    .map((listing, index) => {
      const world = listing.worldName ? ` @ ${listing.worldName}` : '';
      return `**${index + 1}.** ${gil(listing.pricePerUnit)} x${listing.quantity || 1}${world}`;
    })
    .join('\n') || DASH;

  return new EmbedBuilder()
    .setColor(Colors.Gold)
    .setTitle(`Marketboard: ${itemName || `Item ${quote.itemId}`}`)
    .setURL(`https://universalis.app/market/${quote.itemId}`)
    .setDescription(`Current listing snapshot for **${quote.world}**.`)
    .addFields(
      { name: 'Min Price', value: gil(quote.minPrice), inline: true },
      { name: 'Average', value: gil(quote.averagePrice), inline: true },
      { name: 'Top Listings', value: clamp(listings), inline: false },
    )
    .setFooter({ text: 'Source: Universalis • Verify high-value trades in-game' })
    .setTimestamp();
}

export function marketAlertTriggeredEmbed(alert: MarketAlert, quote: MarketQuote) {
  const direction = alert.direction === 'below' ? 'at or below' : 'at or above';
  return new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle('Market Alert Triggered')
    .setURL(`https://universalis.app/market/${alert.itemId}`)
    .setDescription(`Item **${alert.itemName || alert.itemId}** on **${alert.world}** is now ${direction} your target.`)
    .addFields(
      { name: 'Current', value: gil(quote.minPrice), inline: true },
      { name: 'Target', value: gil(alert.targetPrice), inline: true },
      { name: 'Alert ID', value: `\`${alert.id}\``, inline: true },
    )
    .setTimestamp();
}

export function marketDealsEmbed(deals: MarketDeal[]) {
  const lines = deals.length
    ? deals.map((deal, index) => {
        const margin = `${Math.round(deal.margin * 100)}%`;
        return `**${index + 1}. Item ${deal.itemId}** • buy ${gil(deal.buyPrice)} on ${deal.buyWorld}, sell ${gil(deal.sellPrice)} on ${deal.sellWorld} • +${gil(deal.profit)} (${margin})`;
      })
    : ['No profitable candidates found for the supplied item IDs.'];

  return new EmbedBuilder()
    .setColor(Colors.Gold)
    .setTitle('Marketboard Deal Candidates')
    .setDescription(clamp(lines.join('\n'), 4096))
    .setFooter({ text: 'Calculated from current minimum listing prices • Taxes and velocity not included' })
    .setTimestamp();
}

export function resetReminderEmbed(kind: 'daily' | 'weekly') {
  const title = kind === 'daily' ? 'Daily Reset' : 'Weekly Reset';
  const details = kind === 'daily'
    ? 'Roulette bonuses, beast tribes, daily hunts and other daily-limited activities are refreshed.'
    : 'Weekly raid rewards, capped tomestones, challenge log and weekly-limited activities are refreshed.';

  return new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle(title)
    .setDescription(details)
    .addFields({ name: 'Tip', value: 'Check your preferred in-game priorities before queueing.' })
    .setTimestamp();
}

export function huntReportEmbed(rank: string, world: string, zone: string, notes?: string, reporter?: string) {
  return new EmbedBuilder()
    .setColor(rank.toUpperCase().startsWith('S') ? Colors.Red : Colors.Orange)
    .setTitle(`${rank.toUpperCase()}-Rank Hunt Report`)
    .setDescription(`**${world}** • ${zone}`)
    .addFields(
      { name: 'Status', value: 'Player-reported spawn. Confirm in-game before traveling.', inline: false },
      { name: 'Notes', value: notes ? clamp(notes) : DASH, inline: false },
    )
    .setFooter({ text: reporter ? `Reported by ${reporter}` : 'AetherShiba Hunt Board' })
    .setTimestamp();
}

export function saucerEmbed(title: string, description: string, url?: string) {
  const embed = new EmbedBuilder()
    .setColor(Colors.Fuchsia)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'Gold Saucer • Times are estimates, verify in-game for last-minute changes' })
    .setTimestamp();
  if (url) embed.setURL(url);
  return embed;
}

export function communityEventEmbed(event: CommunityEvent) {
  const attendees = event.attendees.length
    ? event.attendees.map(id => `<@${id}>`).join(', ')
    : DASH;
  const maybes = event.maybes.length
    ? event.maybes.map(id => `<@${id}>`).join(', ')
    : DASH;

  const embed = new EmbedBuilder()
    .setColor(event.status === 'cancelled' ? Colors.Red : Colors.Blurple)
    .setTitle(event.title)
    .setDescription(event.description || DASH)
    .addFields(
      { name: 'When', value: `${timeTag(event.startsAt)} (${timeTag(event.startsAt, 'R')})`, inline: false },
      { name: 'Type', value: event.type, inline: true },
      { name: 'Status', value: event.status, inline: true },
      { name: `Going (${event.attendees.length})`, value: clamp(attendees), inline: false },
      { name: `Maybe (${event.maybes.length})`, value: clamp(maybes), inline: false },
    )
    .setFooter({ text: `Event ID: ${event.id}` })
    .setTimestamp(event.createdAt);

  if (event.guideUrl) embed.setURL(event.guideUrl);
  if (event.imageUrl) embed.setImage(event.imageUrl);
  return embed;
}

export function fashionPostEmbed(post: FashionPost) {
  const score = post.upvotes.length - post.downvotes.length;
  const embed = new EmbedBuilder()
    .setColor(Colors.Purple)
    .setTitle(post.title)
    .setDescription(post.notes || 'Community outfit submission.')
    .addFields(
      { name: 'Score', value: String(score), inline: true },
      { name: 'Votes', value: `▲ ${post.upvotes.length} • ▼ ${post.downvotes.length}`, inline: true },
      { name: 'Post ID', value: `\`${post.id}\``, inline: true },
    )
    .setTimestamp(post.createdAt);
  if (post.imageUrl) embed.setImage(post.imageUrl);
  return embed;
}

export function newsEmbed(item: NewsItem, config?: NewsConfig) {
  const category = config?.category ?? item.category;
  return new EmbedBuilder()
    .setColor(Colors.Aqua)
    .setTitle(item.title)
    .setURL(item.link)
    .setDescription(`Latest official Lodestone item from **${category}**.`)
    .setFooter({ text: 'Official FINAL FANTASY XIV Lodestone' })
    .setTimestamp(item.publishedAt ? new Date(item.publishedAt) : new Date());
}

export function marketQuizEmbed(itemId: number, world: string, guess: number, actual: number | null) {
  if (!actual) {
    return new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle('Market Quiz')
      .setDescription(`No current price was available for item **${itemId}** on **${world}**.`);
  }

  const diff = Math.abs(actual - guess);
  const accuracy = Math.max(0, 100 - Math.round((diff / actual) * 100));
  return new EmbedBuilder()
    .setColor(accuracy >= 90 ? Colors.Green : accuracy >= 70 ? Colors.Gold : Colors.Orange)
    .setTitle('Market Quiz Result')
    .setDescription(`You guessed **${gil(guess)}** for item **${itemId}** on **${world}**.`)
    .addFields(
      { name: 'Actual Min Price', value: gil(actual), inline: true },
      { name: 'Difference', value: gil(diff), inline: true },
      { name: 'Accuracy', value: `${accuracy}%`, inline: true },
    )
    .setTimestamp();
}
