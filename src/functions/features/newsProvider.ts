export type NewsCategory = 'topics' | 'notices' | 'maintenance' | 'updates' | 'news';

export type NewsItem = {
  title: string;
  link: string;
  publishedAt?: string;
  category: NewsCategory;
};

const FEEDS: Record<NewsCategory, string> = {
  topics: 'https://eu.finalfantasyxiv.com/lodestone/topics/rss',
  notices: 'https://eu.finalfantasyxiv.com/lodestone/news/news.xml',
  maintenance: 'https://eu.finalfantasyxiv.com/lodestone/news/maintenance.xml',
  updates: 'https://eu.finalfantasyxiv.com/lodestone/news/update.xml',
  news: 'https://eu.finalfantasyxiv.com/lodestone/news/news.xml',
};

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function textFrom(block: string, tag: string): string {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(block);
  return match?.[1] ? decodeXml(match[1]) : '';
}

export async function fetchNews(category: NewsCategory, limit = 5): Promise<NewsItem[]> {
  const response = await fetch(FEEDS[category], {
    headers: { 'user-agent': 'AetherShiba/1.0' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`Lodestone feed failed: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const blocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(match => match[0]);
  return blocks
    .map((block) => {
      const publishedAt = textFrom(block, 'pubDate') || textFrom(block, 'dc:date');
      return {
        title: textFrom(block, 'title'),
        link: textFrom(block, 'link'),
        category,
        ...(publishedAt ? { publishedAt } : {}),
      };
    })
    .filter(item => item.title && item.link)
    .slice(0, limit);
}
