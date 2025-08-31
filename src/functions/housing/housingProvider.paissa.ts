import { z } from "zod";
import { getWorldIdByName } from "./housingWorlds";

export type LotteryState = 'none'|'preparation'|'running'|'results';

export type Plot = {
    dataCenter: string; 
    world: string; 
    district: string;
    ward: number; 
    plot: number; 
    price?: number; 
    size?: 'S'|'M'|'L'; 
    fcOnly?: boolean;
    lottery: { state: LotteryState; endsAt?: string; winner?: boolean };
};

const PlotZ = z.object({
    ward_number: z.number().or(z.string()),
    plot_number: z.number().or(z.string()),
    price: z.number().or(z.string()).optional(),
    size: z.union([z.string(), z.number()]).optional(),
    free_company_only: z.boolean().optional(),
    lottery_state: z.union([z.string(), z.number()]).optional(),
    lottery_end: z.union([z.string(), z.number()]).optional(),
    lottery_winner: z.boolean().optional(),
}).passthrough();

const DistrictZ = z.object({
    name: z.string(),
    open_plots: z.array(PlotZ).default([]),
});

const WorldDetailZ = z.object({
    name: z.string(),
    datacenter_name: z.string().optional(),
    districts: z.array(DistrictZ).default([]),
});

function normSize(s?: string): 'S'|'M'|'L'|undefined {
    const v = s?.toUpperCase();
    return v === 'S' || v === 'M' || v === 'L' ? v : undefined;
}

function normState(s?: string): LotteryState {
    const v = (s ?? '').toLowerCase();
    if (v.includes('pre')) return 'preparation';
    if (v.includes('result')) return 'results';
    if (v.includes('run') || v.includes('open')) return 'running';
    return 'none';
}

function eqDistrict(a: string, b:string) {
    const clean = (x: string) => x.replace(/^the\s+/i,'').trim().toLowerCase();
    return clean(a) === clean(b);
}

export class PaissaProvider {
  async fetchFreePlots(dc: string, world: string, districts: string[]): Promise<Plot[]> {
    const id = await getWorldIdByName(world);
    if (!id) return [];
    const res = await fetch(`https://paissadb.zhu.codes/worlds/${id}`, { headers: { 'user-agent': 'AetherShiba/1.0' }});
    if (!res.ok) return [];
    const detail = WorldDetailZ.parse(await res.json());
    const wanted = new Set(districts);
    const out: Plot[] = [];
    for (const d of detail.districts) {
        if (wanted.size && ![...wanted].some(w => eqDistrict(w, d.name))) continue;

        for (const p of d.open_plots) {
            const state = normState(typeof p.lottery_state === 'number' ? String(p.lottery_state) : p.lottery_state);

            const lottery: Plot['lottery'] = { state };
            if (p.lottery_end !== undefined) lottery.endsAt = String(p.lottery_end);
            if (typeof p.lottery_winner === 'boolean') lottery.winner = p.lottery_winner;

            const item: Plot = {
                dataCenter: detail.datacenter_name ?? dc,
                world: detail.name,
                district: d.name,
                ward: Number(p.ward_number),
                plot: Number(p.plot_number),
                lottery,
            };

            if (p.price !== undefined) item.price = Number(p.price);

            const sizeVal = normSize(typeof p.size === 'number' ? String(p.size) : p.size);
            if (sizeVal) item.size = sizeVal;

            if (typeof p.free_company_only === 'boolean') item.fcOnly = p.free_company_only;

            out.push(item);
        }
      }
      return out;
    }
  }