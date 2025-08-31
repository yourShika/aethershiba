import type { Client } from 'discord.js';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type MsgRecord = {
  channelId: string;
  threads: Record<string, string>;
  messages: Record<string, { threadId: string; messageId: string; hash?: string }>;
};

const filePath = path.join(process.cwd(), 'src', 'guildconfig', 'housing_messages.json');

export function startHousingMessageWatcher(client: Client) {
  setInterval(async () => {
    if (!client.isReady()) return;

    let store: Record<string, MsgRecord> = {};
    try {
      store = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, MsgRecord>;
    } catch {
      return;
    }

    let changed = false;

    for (const rec of Object.values(store)) {
      for (const [key, info] of Object.entries(rec.messages)) {
        const thread = await client.channels.fetch(info.threadId).catch(() => null);
        if (!thread || !thread.isTextBased()) {
          delete rec.messages[key];
          changed = true;
          continue;
        }
        const msg = await thread.messages.fetch(info.messageId).catch(() => null);
        if (!msg) {
          delete rec.messages[key];
          changed = true;
        }
      }
    }

    if (changed) {
      await writeFile(filePath, JSON.stringify(store, null, 2), 'utf8').catch(() => {});
    }
  }, 10_000);
}

