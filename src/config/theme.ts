// config/theme.ts
// The look of the FIXED embeds, collected in one place so a maintainer can
// beautify them (colours, title icons, section emojis) without hunting through
// the code. DATA ONLY — no logic.
//
// Scope: this themes the fixed embeds (success/warn/error/info, the poll
// summary, the event-DM embed, the Roblox-info embed) and the fixed sections of
// the /userinfo card. It does NOT theme the dynamic stats tables, and the
// per-role emojis in the regiment/assignment/honour lists come from those lists
// (see /roles), not from here.

// Accent colours (decimal RGB) for each fixed embed type.
export const THEME_COLORS = {
  success: 0x2ecc71,
  warn: 0xf1c40f,
  error: 0xe74c3c,
  info: 0x3498db,
  // The /userinfo card and the Roblox-info embed use this accent.
  userInfo: 0x3498db,
  pollSummary: 0x3498db,
  eventDm: 0x3498db,
} as const;

// Leading icons shown in the title of the success/warn/error embeds.
export const THEME_ICONS = {
  success: "✅",
  warn: "⚠️",
  error: "❌",
} as const;

// Emojis shown before each answer count in the attendance poll summary.
export const POLL_ICONS = {
  yes: "✅",
  maybe: "🤔",
  no: "❌",
} as const;

// Emojis shown before each section heading on the /userinfo card. Set to "" for
// no emoji.
export const USERINFO_SECTION_EMOJIS = {
  empireFrancaisRank: "🎖️",
  neuviemeCorpsRank: "⚔️",
  regiments: "🚩",
  specialAssignments: "⭐",
  imperialHonours: "🏅",
} as const;
