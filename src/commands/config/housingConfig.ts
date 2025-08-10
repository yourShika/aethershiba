import { ActionRowBuilder, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder,
    ChannelSelectMenuBuilder,
    ChannelType,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    type ChatInputCommandInteraction,
 } from "discord.js";
import type { ConfigSubcommand } from "./config";
import { configManager } from "../../lib/config/configHandler";
import { DATACENTERS, DISTRICT_OPTIONS } from "../../const/housing/housing";
import { getWorldNamesByDC } from "../../functions/housing/housingWorlds";
import { uiKey, setDraft } from "../../ui/housingUI"

const PREFIX = "housing:";

async function handle(interaction: ChatInputCommandInteraction) {
    const guildID = interaction.guildId!;
    const config = await configManager.get(guildID);
    const h = (config['housing'] as any) ?? {};

    const dc = String(h.dataCenter ?? 'Light');
    const worlds = await getWorldNamesByDC(dc);
    const world = String(h.world ?? (worlds[0] ?? ""));

    const k = uiKey(guildID, interaction.user.id);
    setDraft(k, {
        enabled: Boolean(h.enabled),
        dataCenter: dc,
        world,
        districts: h.districts ?? [],
        channelId: h.channelId,
        timesPerDay: h.timesPerDay,
        intervalMinutes: h.intervalMinutes,
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
    
    // World select (depends on DC)
    const worldRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(PREFIX + "world")
        .setPlaceholder("World")
        .addOptions(
          worlds.slice(0, 25).map(w =>
            new StringSelectMenuOptionBuilder()
              .setLabel(w)
              .setValue(w)
              .setDefault(w === world)           // ⬅️ default hier
          ),
        )
        .setMinValues(1)
        .setMaxValues(1),
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
  const chRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(PREFIX + "channel")
      .setPlaceholder("Zielkanal")
      .addChannelTypes(ChannelType.GuildText),
  );

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
      .setCustomId(PREFIX + "save")
      .setLabel("Save")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(PREFIX + "cancel")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({
    content: summaryContent({
      enabled: Boolean(h.enabled),
      dc,
      world,
      districts: h.districts ?? [],
      channelId: h.channelId,
      timesPerDay: h.timesPerDay,
      intervalMinutes: h.intervalMinutes,
    }),
    components: [dcRow, worldRow, distRow, chRow, btnRow],
    flags: MessageFlags.Ephemeral,
  });
}

function summaryContent(s: {
  enabled: boolean;
  dc: string;
  world: string;
  districts: string[];
  channelId?: string;
  timesPerDay?: number;
  intervalMinutes?: number;
}) {
  return `**Housing-Konfiguration**
- Enabled: ${s.enabled ? "ON" : "OFF"}
- DC: ${s.dc}
- World: ${s.world || "—"}
- Districts: ${s.districts.join(", ") || "—"}
- Channel: ${s.channelId ? `<#${s.channelId}>` : "—"}
- Auto: ${
    s.timesPerDay && s.intervalMinutes
      ? `${s.timesPerDay}×/Tag, alle ${s.intervalMinutes} Min`
      : "—"
  }`;
}

const subcmd: ConfigSubcommand = {
  name: "housing",
  description: "Housing-Überwachung konfigurieren",
  execute: handle,
};

export default subcmd;
export const HOUSING_PREFIX = PREFIX; // exported for the interaction router