import type { Plot } from './housingProvider.paissa.js';

// Normalize district names: strip leading "the", lowercase, trim
function normDistrict(d: string): string {
  return d.replace(/^the\s+/i, '').trim().toLowerCase();
}

/**
 * Create a stable key for a plot combining datacenter, world,
 * normalized district, ward and plot numbers. Keys are stored in
 * lowercase to avoid case-sensitivity issues between runs.
 */
export function plotKey(p: Plot): string {
  return [
    p.dataCenter.toLowerCase(),
    p.world.toLowerCase(),
    normDistrict(p.district),
    p.ward,
    p.plot,
  ].join(':');
}

/**
 * Hash of the visible plot information used to detect changes.
 */
export function plotHash(p: Plot): string {
  const stable = {
    dataCenter: p.dataCenter,
    world: p.world,
    district: p.district,
    ward: p.ward,
    plot: p.plot,
    size: p.size,
    price: p.price,
    lottery: {
      phaseUntil: p.lottery?.phaseUntil ?? null,
      entrants: p.lottery?.entries ?? null,
    },
  };
  return JSON.stringify(stable);
}
