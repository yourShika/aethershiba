import { ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ChannelSelectMenuBuilder,
    ChannelType,
    UserSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    type ChatInputCommandInteraction,
 } from "discord.js";
import type { ConfigSubcommand } from "./config";
import { configManager } from "../../handlers/configHandler";
import { DATACENTERS, DISTRICT_OPTIONS } from "../../const/housing/housing";
import { getWorldNamesByDC } from "../../functions/housing/housingWorlds";
import { uiKey, setDraft } from "../../ui/housingUI";
import { logError } from "../../handlers/errorHandler.js";

const PREFIX = "housing:";

async function handle(interaction: ChatInputCommandInteraction) {
    try {
    const guildID = interaction.guildId!;
    const config = await configManager.get(guildID);
    const h = (config['housing'] as any) ?? {};

    const dc = String(h.dataCenter ?? 'Light');
    const worldNames = await getWorldNamesByDC(dc);
    const worlds = Array.isArray(h.worlds)
        ? h.worlds.filter((w: string) => worldNames.includes(w))
        : h.world ? [h.world].filter((w: string) => worldNames.includes(w)) : [];

    const k = uiKey(guildID, interaction.user.id);
    setDraft(k, {
        enabled: Boolean(h.enabled),
        dataCenter: dc,
        worlds,
        districts: h.districts ?? [],
        channelId: h.channelId,
        timesPerDay: h.timesPerDay,
        intervalMinutes: h.intervalMinutes,
        pingUserId: h.pingUserId,
        pingRoleId: h.pingRoleId,
    });

    // Datacenter select
    const dcRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(PREFIX + "dc")
        .setPlaceholder("Datacenter")
        .addOptions(
          DATACENTERS.map(d =>
            new StringSelectMenuOptionBuilder()
              .setLabel(d)
              .setValue(d)
              .setDefault(d === dc)              // ⬅️ statt setDefaultValues
          ),
        )
        .setMinValues(1)
        .setMaxValues(1),
    );
    
    // World multi-select (depends on DC)
    const worldRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(PREFIX + "world")
        .setPlaceholder("Worlds")
        .addOptions(
          worldNames.slice(0, 25).map(w =>
            new StringSelectMenuOptionBuilder()
              .setLabel(w)
              .setValue(w)
              .setDefault(worlds.includes(w))
          ),
        )
        .setMinValues(1)
        .setMaxValues(Math.min(25, worldNames.length)),
    );
    
    // District multi-select
    const distRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(PREFIX + "districts")
        .setPlaceholder("Districts (mehrfach)")
        .addOptions(
          DISTRICT_OPTIONS.map(opt =>
            new StringSelectMenuOptionBuilder()
              .setLabel(opt.label)
              .setValue(opt.value)
              .setDefault((h.districts ?? []).includes(opt.value))   // ⬅️ defaults setzen
          ),
        )
        .setMinValues(1)
        .setMaxValues(Math.min(5, DISTRICT_OPTIONS.length)),
    );

  // Channel picker
  const chBuilder = new ChannelSelectMenuBuilder()
    .setCustomId(PREFIX + "channel")
    .setPlaceholder("Zielkanal")
    .addChannelTypes(ChannelType.GuildText)
    .setMinValues(0)
    .setMaxValues(1);
  if (h.channelId) chBuilder.setDefaultChannels(h.channelId);
  const chRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(chBuilder);

  // User mention picker
  const userBuilder = new UserSelectMenuBuilder()
    .setCustomId(PREFIX + "pinguser")
    .setPlaceholder("Ping User")
    .setMinValues(0)
    .setMaxValues(1);
  if (h.pingUserId) userBuilder.setDefaultUsers(h.pingUserId);
  const userRow = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(userBuilder);

  // Role mention picker
  const roleBuilder = new RoleSelectMenuBuilder()
    .setCustomId(PREFIX + "pingrole")
    .setPlaceholder("Ping Role")
    .setMinValues(0)
    .setMaxValues(1);
  if (h.pingRoleId) roleBuilder.setDefaultRoles(h.pingRoleId);
  const roleRow = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleBuilder);

  // Buttons
  const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(PREFIX + "toggle")
      .setLabel(h.enabled ? "Disable" : "Enable")
      .setStyle(h.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(PREFIX + "schedule")
      .setLabel("Schedule…")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(PREFIX + "cancel")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );
  // Discord limits messages to 5 action rows, so we split the reply
  // into two messages to avoid hitting the limit.
  const mainMsg = await interaction.reply({
    content: summaryContent({
      enabled: Boolean(h.enabled),
      dc,
      worlds,
      districts: h.districts ?? [],
      channelId: h.channelId,
      timesPerDay: h.timesPerDay,
      intervalMinutes: h.intervalMinutes,
      pingUserId: h.pingUserId,
      pingRoleId: h.pingRoleId,
    }),
    components: [dcRow, worldRow, distRow, chRow, userRow],
    flags: MessageFlags.Ephemeral,
    fetchReply: true,
  });

  // Remember the message ID so interaction handlers can update the summary.
  setDraft(k, { messageId: mainMsg.id });

  await interaction.followUp({
    content: 'Weitere Optionen:',
    components: [roleRow, btnRow],
    flags: MessageFlags.Ephemeral,
  });
    } catch (err) {
        logError('housing config handle', err);
        if (interaction.isRepliable()) {
            await interaction.reply({ content: 'Fehler beim Laden der Konfiguration.', flags: MessageFlags.Ephemeral });
        }
    }
}

export function summaryContent(s: {
  enabled: boolean;
  dc: string;
  worlds: string[];
  districts: string[];
  channelId?: string;
  timesPerDay?: number;
  intervalMinutes?: number;
  pingUserId?: string;
  pingRoleId?: string;
}) {
  return `**Housing-Konfiguration**
- Enabled: ${s.enabled ? "ON" : "OFF"}
- DC: ${s.dc}
- Worlds: ${s.worlds.join(", ") || "—"}
- Districts: ${s.districts.join(", ") || "—"}
- Channel: ${s.channelId ? `<#${s.channelId}>` : "—"}
- Auto: ${
    s.timesPerDay && s.intervalMinutes
      ? `${s.timesPerDay}×/Tag, alle ${s.intervalMinutes} Min`
      : "—"
  }
- Ping User: ${s.pingUserId ? `<@${s.pingUserId}>` : "—"}
- Ping Role: ${s.pingRoleId ? `<@&${s.pingRoleId}>` : "—"}`;
}

const subcmd: ConfigSubcommand = {
  name: "housing",
  description: "Housing-Überwachung konfigurieren",
  execute: handle,
};

export default subcmd;
export const HOUSING_PREFIX = PREFIX; // exported for the interaction router

