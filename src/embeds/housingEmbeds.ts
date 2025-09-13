// commands/housing/embed.ts
import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { fileURLToPath } from 'node:url';
import type { Plot } from '../functions/housing/housingProvider.paissa';
import { DISTRICT_IMAGES } from '../const/housing';

/**
 * Builds an embed describing a housing plot.
 *
 * The embed contains information required by the user:
 * datacenter, world, district, price, size, FC availability and
 * an image of the district. The footer displays the time the embed
 * was generated and the current status of the plot.
 */

/**
 * Tries to infer the plot size (S/M/L) based on its price.
 * This is a fallback in case the API response does not provide a size.
 * 
 * @param price - Gil Price from API
 * @returns a Size as (S/M/L) depending on the price
 */
function inferSize(price?: number): 'S' | 'M' | 'L' | undefined {
    if (price == null) return undefined;
    if (price >= 40_000_000) return 'L';
    if (price >= 16_000_000) return 'M';
    if (price >= 3_000_000) return 'S';
    return undefined;
}

/**
 * Creates a Discord embed + optional image attachment for a given housing plot.
 * 
 * @param p - The housing plot data object.
 * @param refreshedAt - Optional timestamp to display when the data was last refreshed.
 * @returns An object containing the EmbedBuilder and optionally an AttachmentBuilder for district image.
 */
export function plotEmbed(p: Plot, refreshedAt?: Date) {
    // Determine size: either inferred from price or taken directly from the plot
    const size = inferSize(p.price) ?? p.size ?? '-';

    // Create the embed with core information
    const embed = new EmbedBuilder()
        .setTitle(`🏠 ${p.world} - ${p.district} Ward ${p.ward} Plot ${p.plot}`)
        .addFields(
            { name: '🗺️ Datacenter', value: p.dataCenter, inline: true },
            { name: '🌐 World', value: p.world, inline: true },
            { name: '🏘️ District', value: p.district, inline: true },
            { name: '💰 Price', value: p.price != null ? `${p.price.toLocaleString()} gil` : '-', inline: true },
            { name: '📏 Size', value: size, inline: true },
            // Ward <= 20 = personal housing allowed; otherwise FC-only
            { name: '👥 FC Available', value: p.ward <= 20 ? 'Yes' : 'No', inline: true },
        )
        // Footer shows generation + refresh timestamps
        .setFooter({ text: `Posted: ${new Date().toLocaleString()} • Refreshed: ${refreshedAt?.toLocaleString() ?? '-'}` });

    // Add optional field: number of lottery entries
    if (p.lottery.entries != null) {
        embed.addFields({ name: '🎟️ Lotto Entries', value: String(p.lottery.entries), inline: true });
    }

    // Add optional field: last update timestamp from PaissaDB API
    if (p.lastUpdated != null) {
        embed.addFields({ name: '⏱️ Paissa API', value: new Date(p.lastUpdated).toLocaleString(), inline: true });
    }

    // Add optional field: when the current lottery phase ends
    if (p.lottery.phaseUntil != null) {
        const ts = Math.floor(p.lottery.phaseUntil / 1000);
        embed.addFields({ name: '📅 Lotto Phase Until', value: `<t:${ts}:F>`, inline: true });
    }

    // Attach a district image if available in the mapping
    const imgFile = DISTRICT_IMAGES[p.district];
    let attachment: AttachmentBuilder | undefined;

    if (imgFile) {
        const url = new URL(`../../img/housing/${imgFile}`, import.meta.url);
        attachment = new AttachmentBuilder(fileURLToPath(url));
        embed.setImage(`attachment://${imgFile}`);
    }

    // Return both embed and optional attachment to be used when sending messages
    return { embed, attachment };
}


