// config/rankRoles.ts
// Maps each Empire Français (EF) rank number to the Discord role ID that denotes
// that rank in the server. DATA ONLY — no logic lives here.
//
// When /rank changes a member's EF rank, the bot adds the mapped Discord role
// and removes any other role in this managed set, touching no other roles.
// Ranks above Colonel (17+) are intentionally unmapped: those Discord roles are
// assigned manually. To change the mapping, edit only this file.
//
// EF rank numbers (see config/rankSync.ts for the full ladder): Citoyen 1,
// Conscrit 2, Soldat 3, Caporal 4, Caporal Fourrier 5, Sergent 6, Sergent Major
// 7, Adjudant 8, Adjudant Sous-Officier 9, Sous-Lieutenant 11, Lieutenant 12,
// Capitaine 13, Chef de Bataillon 14, Major 15, Colonel 16 (all mapped below).

// One rank-role mapping: an EF rank number and the Discord role ID for it.
export type RankRole = { efRank: number; discordRoleId: string };

export const RANK_ROLES: RankRole[] = [
  { efRank: 1, discordRoleId: "1195572029487853576" }, // Citoyen
  { efRank: 2, discordRoleId: "1195572029487853577" }, // Conscrit
  { efRank: 3, discordRoleId: "1195572029496250478" }, // Soldat
  { efRank: 4, discordRoleId: "1195572029496250481" }, // Caporal
  { efRank: 5, discordRoleId: "1195572029496250483" }, // Caporal Fourrier
  { efRank: 6, discordRoleId: "1195572029496250484" }, // Sergent
  { efRank: 7, discordRoleId: "1195572029496250486" }, // Sergent Major
  { efRank: 8, discordRoleId: "1195572029508829294" }, // Adjudant
  { efRank: 9, discordRoleId: "1195572029508829295" }, // Adjudant Sous-Officier
  { efRank: 11, discordRoleId: "1195572029508829296" }, // Sous-Lieutenant
  { efRank: 12, discordRoleId: "1195572029508829297" }, // Lieutenant
  { efRank: 13, discordRoleId: "1195572029508829299" }, // Capitaine
  { efRank: 14, discordRoleId: "1195572029508829300" }, // Chef de Bataillon
  { efRank: 15, discordRoleId: "1195572029508829303" }, // Major
  { efRank: 16, discordRoleId: "1195572029521408032" }, // Colonel
];
