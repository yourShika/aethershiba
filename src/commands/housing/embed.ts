import { EmbedBuilder } from "discord.js";
import type { Plot } from "../../functions/housing/housingProvider.paissa";
import { DISTRICT_IMAGES } from "../../const/housing/housing";

/**
 * Builds an embed describing a housing plot.
 *
 * The embed contains information required by the user:
 * datacenter, world, district, price, size, FC availability and
 * an image of the district. The footer displays the time the embed
 * was generated and the current status of the plot.
 */
export function plotEmbed(p: Plot) {
    const status = formatStatus(p);
    const e = new EmbedBuilder()
        .setTitle(`${p.world} - ${p.district} Ward ${p.ward} Plot ${p.plot}`)
        .setImage(DISTRICT_IMAGES[p.district] ?? null)
        .addFields(
            { name: 'Datacenter', value: p.dataCenter, inline: true },
            { name: 'World', value: p.world, inline: true },
            { name: 'District', value: p.district, inline: true },
            { name: 'Price', value: p.price != null ? `${p.price.toLocaleString()} gil` : '-', inline: true },
            { name: 'Size', value: p.size ?? '-', inline: true },
            { name: 'FC Only', value: p.fcOnly ? 'Yes' : 'No', inline: true },
        )
        .setFooter({ text: `${new Date().toLocaleString()} • ${status}` });
    return e;
}

function formatStatus(p: Plot): string {
    switch (p.lottery.state) {
        case 'preparation': return 'Vorbereitung';
        case 'running': return `Verlosung läuft${p.lottery.endsAt ? ` bis ${p.lottery.endsAt}` : ''}`;
        case 'results': return `Ergebnisse${p.lottery.winner != null ? ` - Gewinner: ${p.lottery.winner ? 'Ja' : 'Nein'}` : ''}`;
        default: return '-';
    }
}

