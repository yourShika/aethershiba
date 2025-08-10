import { EmbedBuilder } from "discord.js";
import type { Plot } from "../../functions/housing/housingProvider.paissa";

export function plotEmbed(p: Plot) {
    const e = new EmbedBuilder()
        .setTitle(`${p.world} - ${p.district} Ward ${p.ward} Plot ${p.plot}`)
        .addFields(
            { name: 'Datacenter', value: p.dataCenter, inline: true },
            { name: 'World', value: p.world, inline: true },
            { name: 'District', value: p.district, inline: true },
            { name: 'Price', value: p.price != null ? `${p.price.toLocaleString()} gil` : '-', inline: true },
            { name: 'Size', value: p.size ?? '-', inline: true },
            { name: 'FC Only', value: p.fcOnly ? 'Yes' : 'No', inline: true },
            { name: 'Status', value: formatStatus(p), inline: false},
        );
        return e;
}

function formatStatus(p: Plot): string {
    switch (p.lottery.state) {
        case 'preparation': return 'Vorbereitung';
        case 'running': return `Verlosung läuft${p.lottery.endsAt ? ` bis ${p.lottery.endsAt}` : ''}`;
        case 'results': return `Ergebnisse${p.lottery.winner != null ? ` - Gewinner: ${p.lottery.winner ? 'Ja' : 'Nein'}` : ''}`
        default: return '-';
    }
}

