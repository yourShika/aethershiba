import { z } from 'zod';

const ListingSchema = z.object({
  pricePerUnit: z.number().optional(),
  quantity: z.number().optional(),
  worldName: z.string().optional(),
  lastReviewTime: z.number().optional(),
}).passthrough();

const MarketSchema = z.object({
  itemID: z.number().optional(),
  worldName: z.string().optional(),
  dcName: z.string().optional(),
  minPrice: z.number().optional(),
  averagePrice: z.number().optional(),
  currentAveragePrice: z.number().optional(),
  listings: z.array(ListingSchema).default([]),
}).passthrough();

export type MarketQuote = {
  itemId: number;
  world: string;
  minPrice: number | null;
  averagePrice: number | null;
  listings: {
    pricePerUnit: number;
    quantity: number;
    worldName?: string;
    lastReviewTime?: number;
  }[];
};

export type MarketDeal = {
  itemId: number;
  buyWorld: string;
  sellWorld: string;
  buyPrice: number;
  sellPrice: number;
  profit: number;
  margin: number;
};

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { 'user-agent': 'AetherShiba/1.0' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`Universalis request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function fetchMarketQuote(world: string, itemId: number): Promise<MarketQuote | null> {
  const target = encodeURIComponent(world.trim());
  const url = `https://universalis.app/api/v2/${target}/${itemId}?listings=8&entries=0`;
  const payload = MarketSchema.parse(await fetchJson(url));
  const listings = payload.listings
    .map((listing) => ({
      pricePerUnit: Number(listing.pricePerUnit ?? 0),
      quantity: Number(listing.quantity ?? 0),
      ...(listing.worldName ? { worldName: listing.worldName } : {}),
      ...(listing.lastReviewTime ? { lastReviewTime: listing.lastReviewTime } : {}),
    }))
    .filter((listing) => listing.pricePerUnit > 0)
    .sort((a, b) => a.pricePerUnit - b.pricePerUnit);

  const minPrice = typeof payload.minPrice === 'number'
    ? payload.minPrice
    : listings[0]?.pricePerUnit ?? null;

  return {
    itemId,
    world: payload.worldName ?? payload.dcName ?? world,
    minPrice,
    averagePrice: payload.currentAveragePrice ?? payload.averagePrice ?? null,
    listings,
  };
}

export async function findMarketDeals(
  itemIds: number[],
  buyWorld: string,
  sellWorld: string,
  limit = 30,
): Promise<MarketDeal[]> {
  const uniqueIds = Array.from(new Set(itemIds.filter(id => Number.isInteger(id) && id > 0))).slice(0, 100);
  const pairs = await Promise.allSettled(
    uniqueIds.map(async (itemId) => {
      const [buy, sell] = await Promise.all([
        fetchMarketQuote(buyWorld, itemId),
        fetchMarketQuote(sellWorld, itemId),
      ]);
      const buyPrice = buy?.minPrice ?? null;
      const sellPrice = sell?.minPrice ?? null;
      if (!buyPrice || !sellPrice || sellPrice <= buyPrice) return null;

      const profit = sellPrice - buyPrice;
      return {
        itemId,
        buyWorld,
        sellWorld,
        buyPrice,
        sellPrice,
        profit,
        margin: profit / buyPrice,
      } satisfies MarketDeal;
    }),
  );

  return pairs
    .flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : [])
    .sort((a, b) => b.profit - a.profit)
    .slice(0, limit);
}
