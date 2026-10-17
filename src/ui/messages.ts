// ui/messages.ts
// Shared user-facing text, kept in one place so wording stays consistent.

export const MESSAGES = {
  notLinked:
    "That Discord user is not linked to a Roblox account. They must verify with Bloxlink first (https://blox.link).",
  bloxlinkError:
    "Could not reach the Bloxlink service right now. Please try again in a moment.",
  timeout: "The request took too long and was cancelled. Please try again.",
  noPermission: "You do not have permission to use this command.",
  serverOnly: "This command can only be used inside the server.",
  genericError: "Something went wrong. Please try again later.",
  memberListRateLimited: (seconds: number): string =>
    `Discord is limiting how often I can load the member list. Please wait ${seconds}s and run /eventdm again.`,
  memberListTimeout: "Loading the member list took too long. Please run /eventdm again.",
  eventDmLongSend:
    "This send will take longer than 15 minutes, so the final summary will be sent to you by DM.",
} as const;
