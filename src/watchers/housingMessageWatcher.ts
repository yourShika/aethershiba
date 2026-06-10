// watchers/housingMessageWatcher.ts
// ---------------------------------------------------
// Dependecies
// ---------------------------------------------------
import { messageLink, type Client, ChannelType, type TextBasedChannel } from 'discord.js';
import { logger } from '../lib/logger.js';
import { startTaskLoop } from '../lib/taskLoop.js';
import { botConfig } from '../config.js';
import { dataFile, legacyDataFile, readJsonWithLegacy, writeJsonSafe } from '../lib/dataStore.js';

// Type definition for how messages and threads are tracked in the JSON store
type MsgRecord = {
  channelId: string;
  threads: Record<string, string>;
  messages: Record<
    string,
    { threadId: string; messageId: string; hash?: string; deleteAt?: number; refreshedAt?: number }
  >;
};

// file path where we persist messages/thread data
const filePath = dataFile('housing_messages.json');
const legacyFilePath = legacyDataFile('housing_messages.json');

// Flag to detect if a watcher tick is already running
let isTickRunning = false;

/**
 * Start the Housing Message Watcher.
 * 
 * @param client - Discord Client
 * This periodically checks messages/threads stored in `housing_messages.json`,
 * removes entries for deleted/expired ones, and keeps the JSON file clean.
 */
export function startHousingMessageWatcher(client: Client) {
  // Time in which the Bot should check Messages
  const intervalMs = botConfig.housing.MessageWatcherTime;

  logger.info(`🏠 HousingMessageWatcher gestartet (Intervall: ${intervalMs}ms)`);

  // Run the check on a jittered interval to avoid synchronized spikes
  startTaskLoop(async () => {
    if (!client.isReady()) return;
    if (isTickRunning) {
      logger.debug('Watcher tick skipped because a previous tick is still running.');
      return;
    }

    isTickRunning = true;
    const startedAt = Date.now();

    // Local variable for this tick
    let store: Record<string, MsgRecord> = {};
    let changed = false;
    let checked = 0;
    let removed = 0;

    try {
      // ---------------------------------------------------
      // Load store from JSON file
      // ---------------------------------------------------
      store = await readJsonWithLegacy<Record<string, MsgRecord>>(filePath, legacyFilePath, {});

      // ---------------------------------------------------
      // Iterate over all guild records in the store
      // ---------------------------------------------------
      for (const [guildId, rec] of Object.entries(store)) {
        // Check all tracked messages
        for (const [key, info] of Object.entries(rec.messages)) {
          checked++;

          // Try to fetch the thread this messages belongs to
          const thread = await client.channels.fetch(info.threadId).catch((err) => {
            logger.debug(`Fetch Thread fehlgeschlagen (threadId=${info.threadId}, guildId=${guildId}): ${String(err)}`);
            return null;
          });

          // If thread missing or not text-based -> remove the entry
          if (
            !thread ||
            (thread.type !== ChannelType.PublicThread &&
              thread.type !== ChannelType.PrivateThread &&
              !('isTextBased' in thread && thread.isTextBased()))
          ) {
            // Remove entry and add to local var +1 
            delete rec.messages[key];
            changed = true;
            removed++;
            logger.info(
              `Thread fehlt/kein Textkanal → Eintrag entfernt (key=${key}, threadId=${info.threadId}, guildId=${guildId})`
            );
            continue;
          }

          // Definieren thread as a textBasedChannel to use later
          const textChannel = thread as TextBasedChannel;

          // If the message has and expiry ('deleteAt') and is expired -> delete from Discord + store
          if (info.deleteAt && Date.now() >= info.deleteAt) {
            await textChannel.messages.delete(info.messageId).catch((err) => {
              logger.debug(`Löschen abgelaufener Housing-Nachricht fehlgeschlagen (messageId=${info.messageId}, threadId=${info.threadId}): ${String(err)}`);
            });
            // Delete the message from Discord and store
            delete rec.messages[key];
            changed = true;
            removed++;
            continue;
          }

          // Otherwise, fetch the message from Discord to check if it still exists
          const msg = await textChannel.messages.fetch(info.messageId).catch((err) => {
            logger.debug(`Fetch Message fehlgeschlagen (messageId=${info.messageId}, threadId=${info.threadId}): ${String(err)}`);
            return null;
          });

          // If message missing in Discord -> remove from store
          if (!msg) {
            delete rec.messages[key];
            changed = true;
            removed++;

            // add messasgeLink if its indeed still exists
            const link = messageLink(info.threadId, info.messageId);
            logger.info(
              `🗑️ Nachricht wurde in Discord gelöscht → Eintrag entfernt (key=${key}). Link (falls noch gültig): ${link}`
            );
          }
        }

        // ---------------------------------------------------
        // Check stored threads
        // ---------------------------------------------------
        for (const [name, threadId] of Object.entries(rec.threads)) {
          const thread = await client.channels.fetch(threadId).catch((err) => {
            logger.debug(`Fetch Thread fehlgeschlagen (threadId=${threadId}, guildId=${guildId}): ${String(err)}`);
            return null;
          });

          // If thread missing or not text-based -> remove from store
          if (
            !thread ||
            (thread.type !== ChannelType.PublicThread &&
              thread.type !== ChannelType.PrivateThread &&
              !('isTextBased' in thread && thread.isTextBased()))
          ) {
            // Delete Threads if there not exists anymore
            delete rec.threads[name];
            changed = true;
            removed++;
            //logger.debug(`Thread fehlt/kein Textkanal → Thread-Eintrag entfernt (name=${name}, threadId=${threadId}, guildId=${guildId})`);
          }
        }

        // If guild has no entries left -> remove entire record
        if (
          Object.keys(rec.messages).length === 0 &&
          Object.keys(rec.threads).length === 0
        ) {
          delete store[guildId];
          changed = true;
          //logger.debug(`Keine Einträge mehr für Guild ${guildId} → Record entfernt`);
        }
      }

      // ---------------------------------------------------
      // Write updated store back to disk if changes happened
      // ---------------------------------------------------
      if (changed) {
        const saved = await writeJsonSafe(filePath, store, 'housing message watcher');
        if (saved) logger.debug(`Änderungen am Store gespeichert: removed=${removed}, checked=${checked}`);
      }
    } catch (err) {
      // Catch-all to prevent the interval from ever stopping
      logger.error('Unerwarteter Fehler im HousingMessageWatcher-Tick:', err);
    } finally {
      const dur = Date.now() - startedAt;
      logger.debug(`Watcher-Tick beendet (Dauer ${dur}ms, geprüft=${checked}, entfernt=${removed}, geändert=${changed})`);
      isTickRunning = false;
    }
  }, { intervalMs, jitterRatio: 0.1, immediate: true });
}
