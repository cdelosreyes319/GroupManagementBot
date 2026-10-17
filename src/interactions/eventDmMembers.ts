// interactions/eventDmMembers.ts
// Member lookups for the /eventdm preview: every member holding the target
// role (explaining Discord rate limits and timeouts to the officer), and the
// officer's own server display name for the DM footer.
import { GuildMember, type Collection, type ModalSubmitInteraction } from "discord.js";
import { warnEmbed } from "../ui/embeds";
import { MESSAGES } from "../ui/messages";
import { classifyMemberFetchError } from "../utils/memberFetchError";

// Fetches every member holding the role. Filters the collection fetch()
// returns rather than reading role.members from the cache: the member cache is
// capped (GuildMemberManager in main.ts), so role.members can be empty on
// servers with more members than the cap. The @everyone role (id === guild id)
// matches every member. If Discord rate-limits the fetch or it times out, tells
// the officer what to do and returns null.
export async function fetchRoleMembers(
  interaction: ModalSubmitInteraction,
  roleId: string,
): Promise<Collection<string, GuildMember> | null> {
  const guild = interaction.guild!;
  let fetched: Collection<string, GuildMember>;
  try {
    fetched = await guild.members.fetch();
  } catch (error) {
    const failure = classifyMemberFetchError(error);
    if (!failure) {
      throw error;
    }
    console.warn(`[eventdm] Member list fetch failed (${failure.kind}); asked the officer to retry.`);
    const text =
      failure.kind === "rate_limited"
        ? MESSAGES.memberListRateLimited(failure.retryAfterSeconds)
        : MESSAGES.memberListTimeout;
    await interaction.editReply({ embeds: [warnEmbed("Member list unavailable", text)] });
    return null;
  }

  if (roleId === guild.id) {
    return fetched;
  }
  return fetched.filter((member) => member.roles.cache.has(roleId));
}

// The officer's server display name for the DM footer (R4.13). Falls back to
// their nickname from the raw payload, then their Discord display name, when
// the member is not cached as a GuildMember.
export function officerDisplayName(interaction: ModalSubmitInteraction<"cached" | "raw">): string {
  const member = interaction.member;
  if (member instanceof GuildMember) {
    return member.displayName;
  }
  if (member.nick) {
    return member.nick;
  }
  return interaction.user.displayName;
}
