// const/messages.ts

// ---------------------------------------------------
// ⚙️ System
// ---------------------------------------------------
export const UNKNOWN_COMMAND        = "❓ Unknown subcommand.";
export const FAILED_CONFIG_LOADING  = "⚠️ Failed to load the configuration.";
export const GUILD_ONLY             = "🏰 This command can only be used in a guild.";
export const UNKNOWN_ACTION         = "🚫 This action is not available at the moment.";
export const ERROR_OCCURRED         = "💥 An internal error occurred.";
export const UNHANDLED_INTERACTION  = "🤷 Unhandled interaction.";

// ---------------------------------------------------
// 🏠 Housing
// ---------------------------------------------------
export const HOUSING_INFO =
  "🏠 **Housing Information**\n\n" +
  "This bot provides housing plot listings using the **PaissaDB API**.\n" +
  "While the data is generally reliable, please note:\n\n" +
  "• ⏳ Data may be **incomplete** or **delayed**.\n" +
  "• ⚖️ Listings may not always match in-game status **1:1**.\n" +
  "• 🏷️ Some posted plots might already be sold or otherwise unavailable.\n\n" +
  "ℹ️ Use this as a helpful guide, but always verify availability **in-game**.";

export const HOUSING_REFRESH_RUNNING      = "🔄 A housing refresh is currently running. Please try again later.";
export const ANOTHER_HOUSING_TASK_RUNNING = "⚙️ Another housing task is already running. Please try again later.";
export const RUN_SETUP_FIRST              = "⚡ No housing messages found. Run `/housing setup` first.";
export const NO_MESSAGE_FOUND             = "📭 No housing messages found for this guild.";
export const HOUSING_DATA_RESET           = "🗑️ Housing data has been reset.";
export const NO_HOUSING_CONFIGURED        = "⚠️ Housing is not configured.";
export const HOUSING_NEEDS_FORUM          = "💬 Configured channel could not be found or is not a forum.";
export const NO_FREE_PLOTS                = "❌ No free plots available.";
export const PAISSA_API_UNAVAILABLE       = "🚨 The PaissaDB API is currently unavailable. Please try again later.";

// ---------------------------------------------------
// 👤 Profile
// ---------------------------------------------------
export const ALREADY_LINKED        = "🔗 You have already linked a Lodestone profile. Use `/profile unlink` first.";
export const VERIFICATION_CANCELED = "❌ Verification cancelled.";
export const ACCOUNT_USED          = "⚠️ This Lodestone profile is already linked to another user.";
export const UNABLE_ACCESS         = "🔒 Unable to access profile. Ensure the link is correct and public.";
export const PROFILE_NOT_LINKED    = "🔗 You have not linked a Lodestone profile. Use /profile link first.";
export const PROFILE_USER_NOT_LINKED = (userTag: string) => `🔗 ${userTag} has not linked a Lodestone profile to their Discord account.`;