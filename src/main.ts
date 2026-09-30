import { Client, GatewayIntentBits, Options } from "discord.js";
import { env, groups } from "./init";
import { createJsonSettingsStore } from "./storage/settingsStore";
import { createJsonEventStore } from "./storage/eventStore";
import { createPermissionService } from "./services/permissionService";
import { createRouter, type ComponentHandler } from "./interactions/router";
import { configure as configurePermissionsCommand } from "./commands/permissions";
import { configureAccountLookup } from "./services/accountLookup";
import { configureRankService } from "./services/rankServiceInstance";
import { configureActivityTracker } from "./services/activityTrackerInstance";
import { configureEventDmService } from "./services/eventDmInstance";
import { configurePollService } from "./services/pollServiceInstance";
import { configureStatsService } from "./services/statsServiceInstance";
import { configure as configureExclusionsCommand } from "./commands/eventdmexclusions";
import { configure as configureStatsSourceCommand } from "./commands/statssource";
import { configure as configureStatsAliasCommand } from "./commands/statsalias";
import { configure as configureUserInfoCommand } from "./commands/userinfo";
import { configure as configureRolesCommand } from "./commands/roles";
import { configure as configureLogCommand } from "./commands/log";
import { configureCommandLogger } from "./services/commandLoggerInstance";
import {
  configureEventDmInteractions,
  eventDmHandler,
  editSummaryMessage,
} from "./interactions/eventDmInteractions";
import {
  configureStatsSourceInteractions,
  statsSourceHandler,
} from "./interactions/statsSourceInteractions";
import { validateRankSyncRules, findMissingCorpsRoles } from "./services/rankSyncService";
import { RANK_SYNC_RULES } from "./config/rankSync";
import { MANAGED_GROUPS } from "./config/constants";
import { setBotUserId, getGroupRoles } from "./api/roblox";
import type { ActivityTracker } from "./services/activityTracker";
import * as noblox from "noblox.js";

// Only the intents the bot actually needs. GuildMessages and GuildVoiceStates
// are used to see who was active (never message content). Presence and message
// content intents are deliberately left out to keep memory low and stay within
// the least-privilege principle.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
  makeCache: Options.cacheWithLimits({
    MessageManager: 0,
    ReactionManager: 0,
    PresenceManager: 0,
    GuildMemberManager: 200,
  }),
});

// Component (button/modal) handlers keyed by custom-ID feature. Filled in as
// interactive features (event DMs, stats sources) are added.
const componentHandlers: Record<string, ComponentHandler> = {};

// Bootstrap everything the bot needs before logging in. A corrupt settings.json
// or events.json throws here and stops the bot from starting, on purpose.
async function bootstrap() {
  const settingsStore = await createJsonSettingsStore();
  const eventStore = await createJsonEventStore();
  const activity = await configureActivityTracker();
  const permissions = createPermissionService(settingsStore);
  configurePermissionsCommand(permissions);

  // Wire the shared Roblox account lookup (Bloxlink guild ID + key from env).
  configureAccountLookup({ guildId: groups.DISCORD_CORPS_ID, bloxlinkKey: env.BLOXLINK_KEY });
  configureRankService();

  // Event DMs + attendance poll: services, exclusions command, and handler.
  const eventDm = configureEventDmService();
  const poll = configurePollService(eventStore, editSummaryMessage);
  configureExclusionsCommand(settingsStore);
  // Command logging: /log command + one shared logger for the router and the
  // event-DM confirm handler.
  configureLogCommand(settingsStore);
  const commandLogger = configureCommandLogger(client, settingsStore);

  configureEventDmInteractions({
    client,
    settings: settingsStore,
    eventDm,
    activity,
    poll,
    eventStore,
    logCommand: (entry) => commandLogger.log(entry),
    alertCommand: (text) => commandLogger.alert(text),
  });
  componentHandlers.eventdm = eventDmHandler;

  // Stats: service, commands, and the add-source modal handler.
  configureStatsService(settingsStore);
  configureStatsSourceCommand(settingsStore);
  configureStatsAliasCommand(settingsStore);
  configureUserInfoCommand(settingsStore);
  configureRolesCommand(settingsStore);
  configureStatsSourceInteractions(settingsStore);
  componentHandlers.statssource = statsSourceHandler;

  const router = createRouter({
    permissions,
    componentHandlers,
    recordActivity: (userId) => recordActivity(activity, userId),
    logCommand: (entry) => commandLogger.log(entry),
  });
  client.on("interactionCreate", (interaction) => router(interaction));

  wireActivityEvents(activity);
  wireShutdown(activity);

  return { settingsStore, eventStore, permissions, activity };
}

// Records activity for a user, then flushes to disk if due (never awaited so it
// does not slow the event handler; errors are logged).
function recordActivity(activity: ActivityTracker, userId: string): void {
  activity.record(userId);
  activity.saveIfDue().catch((error) => {
    console.error("Activity save failed:", error instanceof Error ? error.message : "unknown");
  });
}

// Records activity on messages (who sent, never content) and voice joins/moves
// in the configured server.
function wireActivityEvents(activity: ActivityTracker): void {
  client.on("messageCreate", (message) => {
    if (message.author.bot || message.guildId !== groups.DISCORD_CORPS_ID) {
      return;
    }
    recordActivity(activity, message.author.id);
  });

  client.on("voiceStateUpdate", (_oldState, newState) => {
    // Only count joining or moving into a channel (channelId present).
    if (!newState.channelId || newState.guild.id !== groups.DISCORD_CORPS_ID) {
      return;
    }
    if (newState.member && !newState.member.user.bot) {
      recordActivity(activity, newState.id);
    }
  });
}

// Saves any unsaved activity on SIGINT/SIGTERM, then destroys the client.
function wireShutdown(activity: ActivityTracker): void {
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`Received ${signal}, shutting down…`);
    try {
      await activity.saveNow();
    } catch (error) {
      console.error("Failed to save activity on shutdown:", error instanceof Error ? error.message : "unknown");
    }
    await client.destroy();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

// Checks the Rank Sync Table for problems and logs a warning for each without
// stopping the bot. Runs after the Roblox login so Corps roles are reachable.
async function checkRankSyncTable(): Promise<void> {
  for (const problem of validateRankSyncRules(RANK_SYNC_RULES)) {
    console.warn(`[rankSync] ${problem}`);
  }
  try {
    const corps = MANAGED_GROUPS.find((g) => g.key === "corps")!;
    const corpsRoles = await getGroupRoles(corps.id);
    for (const name of findMissingCorpsRoles(RANK_SYNC_RULES, corpsRoles)) {
      console.warn(`[rankSync] Corps role "${name}" from the sync table does not exist in the Corps group.`);
    }
  } catch {
    console.warn("[rankSync] Could not fetch Corps roles to validate the sync table.");
  }
}

client.once("clientReady", async () => {
  const currentUser = await noblox.setCookie(env.ROBLOX_TOKEN);
  setBotUserId(currentUser.id);
  console.log(`Logged in as ${currentUser.name} [${currentUser.id}]`);
  await checkRankSyncTable();
  console.log("Discord bot is ready! 🤖");
});

// Build stores and the router, then log in. If bootstrap throws (corrupt data
// file), the bot never logs in.
bootstrap()
  .then(() => client.login(env.DISCORD_TOKEN))
  .catch((error) => {
    console.error("Failed to start:", error instanceof Error ? error.message : "unknown error");
    process.exit(1);
  });
