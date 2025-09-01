import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { fileURLToPath } from 'node:url';
import type { Plot } from '../../functions/housing/housingProvider.paissa';
import { DISTRICT_IMAGES } from '../../const/housing/housing';

/**
 * Builds an embed describing a housing plot.
 *
 * The embed contains information required by the user:
 * datacenter, world, district, price, size, FC availability and
 * an image of the district. The footer displays the time the embed
 * was generated and the current status of the plot.
 */
export function plotEmbed(p: Plot, refreshedAt?: Date) {
    const status = formatStatus(p);
    const embed = new EmbedBuilder()
        .setTitle(`🏠 ${p.world} - ${p.district} Ward ${p.ward} Plot ${p.plot}`)
        .addFields(
            { name: '🗺️ Datacenter', value: p.dataCenter, inline: true },
            { name: '🌐 World', value: p.world, inline: true },
            { name: '🏘️ District', value: p.district, inline: true },
            { name: '💰 Price', value: p.price != null ? `${p.price.toLocaleString()} gil` : '-', inline: true },
            { name: '📏 Size', value: p.size ?? '-', inline: true },
            { name: '👥 FC Available', value: p.ward <= 20 ? 'Yes' : 'No', inline: true },
        )
        .setFooter({ text: `${new Date().toLocaleString()} • ${status}` });

    if (p.lottery.entries != null) {
        embed.addFields({ name: '🎟️ Lotto Entries', value: String(p.lottery.entries), inline: true });
    }

    if (p.lastUpdated != null) {
        embed.addFields({ name: '⏱️ Last Updated', value: new Date(p.lastUpdated).toLocaleString(), inline: true });
    }

    if (p.lottery.phaseUntil != null) {
        const ts = Math.floor(p.lottery.phaseUntil / 1000);
        embed.addFields({ name: '📅 Lotto Phase Until', value: `<t:${ts}:F>`, inline: true });
    }

    if (refreshedAt) {
        embed.addFields({ name: '🔄 Refreshed at', value: refreshedAt.toLocaleString(), inline: false });
    }

    const imgFile = DISTRICT_IMAGES[p.district];
    let attachment: AttachmentBuilder | undefined;

    if (imgFile) {
        const url = new URL(`../../img/housing/${imgFile}`, import.meta.url);
        attachment = new AttachmentBuilder(fileURLToPath(url));
        embed.setImage(`attachment://${imgFile}`);
    }

    return { embed, attachment };
}

function formatStatus(p: Plot): string {
    switch (p.lottery.state) {
        case 'preparation': return 'Vorbereitung';
        case 'running': return `Verlosung läuft${p.lottery.endsAt ? ` bis ${p.lottery.endsAt}` : ''}`;
        case 'results': return `Ergebnisse${p.lottery.winner != null ? ` - Gewinner: ${p.lottery.winner ? 'Ja' : 'Nein'}` : ''}`;
        case 'none': return 'Verfügbar';
        default: return '-';
    }
}

