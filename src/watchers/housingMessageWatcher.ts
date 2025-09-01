import { messageLink, type Client, ChannelType, type TextBasedChannel } from 'discord.js';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../lib/logger';

type MsgRecord = {
  channelId: string;
  threads: Record<string, string>;
  messages: Record<
    string,
    { threadId: string; messageId: string; hash?: string; deleteAt?: number }
  >;
};

const filePath = path.join(process.cwd(), 'src', 'json', 'housing_messages.json');

let isTickRunning = false;

export function startHousingMessageWatcher(client: Client) {
  const intervalMs = 10_000;

  logger.info(`🏠 HousingMessageWatcher gestartet (Intervall: ${intervalMs}ms)`);

  setInterval(async () => {
    if (!client.isReady()) return;

    isTickRunning = true;
    const startedAt = Date.now();
    let store: Record<string, MsgRecord> = {};
    let changed = false;
    let checked = 0;
    let removed = 0;

    try {
      // 1) Store laden
      try {
        const raw = await readFile(filePath, 'utf8');
        store = JSON.parse(raw) as Record<string, MsgRecord>;
      } catch (err) {
        logger.warn(`Konnte ${filePath} nicht lesen oder parsen – starte mit leerem Store. Fehler: ${String(err)}`);
        store = {};
      }

      // 2) Alle gespeicherten Nachrichten überprüfen
      for (const [guildId, rec] of Object.entries(store)) {
        for (const [key, info] of Object.entries(rec.messages)) {
          checked++;

          // Channel/Thread holen
          const thread = await client.channels.fetch(info.threadId).catch((err) => {
            logger.warn(`Fetch Thread fehlgeschlagen (threadId=${info.threadId}, guildId=${guildId}): ${String(err)}`);
            return null;
          });

          // Wenn kein Thread oder kein Textkanal: Eintrag entfernen
          if (
            !thread ||
            (thread.type !== ChannelType.PublicThread &&
              thread.type !== ChannelType.PrivateThread &&
              !('isTextBased' in thread && thread.isTextBased()))
          ) {
            delete rec.messages[key];
            changed = true;
            removed++;
            logger.info(
              `Thread fehlt/kein Textkanal → Eintrag entfernt (key=${key}, threadId=${info.threadId}, guildId=${guildId})`
            );
            continue;
          }

          const textChan = thread as TextBasedChannel;

          // Prüfen, ob ein Ablaufdatum erreicht ist
          if (info.deleteAt && Date.now() >= info.deleteAt) {
            await textChan.messages.delete(info.messageId).catch((err) => {
              logger.warn(
                `Löschen abgelaufener Housing-Nachricht fehlgeschlagen (messageId=${info.messageId}, threadId=${info.threadId}): ${String(
                  err
                )}`
              );
            });
            delete rec.messages[key];
            changed = true;
            removed++;
            continue;
          }

          // Nachricht holen
          const msg = await textChan.messages.fetch(info.messageId).catch((err) => {
            // kann normal sein (gelöscht), deshalb nur warnen – genauer entscheiden wir unten
            logger.warn(
              `Fetch Message fehlgeschlagen (messageId=${info.messageId}, threadId=${info.threadId}): ${String(err)}`
            );
            return null;
          });

          // Wenn Nachricht fehlt: Eintrag entfernen + Log mit Link
          if (!msg) {
            delete rec.messages[key];
            changed = true;
            removed++;

            // messageLink funktioniert auch ohne guildId-Param (optional)
            const link = messageLink(info.threadId, info.messageId);
            logger.info(
              `🗑️ Nachricht wurde in Discord gelöscht → Eintrag entfernt (key=${key}). Link (falls noch gültig): ${link}`
            );
          }
        }
      }

      // 3) Store zurückschreiben (nur wenn Änderungen)
      if (changed) {
        try {
          await writeFile(filePath, JSON.stringify(store, null, 2), 'utf8');
          logger.info(`Änderungen am Store gespeichert: removed=${removed}, checked=${checked}`);
        } catch (err) {
          logger.error(`Fehler beim Schreiben von ${filePath}: ${String(err)}`);
        }
      }
    } catch (err) {
      // Catch-all, damit der Intervall nie „stirbt“
      logger.error('Unerwarteter Fehler im HousingMessageWatcher-Tick:', err);
    } finally {
      const dur = Date.now() - startedAt;
      //logger.info(`Watcher-Tick beendet (Dauer ${dur}ms, geprüft=${checked}, entfernt=${removed}, geändert=${changed})`);
      isTickRunning = false;
    }
  }, intervalMs);
}
