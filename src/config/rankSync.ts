// config/rankSync.ts
// The Rank Sync Table: maps ranges of Empire Français (EF) rank numbers to a
// Neuvième Corps rank NAME. This file is DATA ONLY — no logic lives here.
//
// To change the mapping, edit only this file. The EF side uses Roblox rank
// numbers; the Corps side is matched by role NAME (case-insensitive) so it works
// whatever numbers the Corps group uses.
//
// Empire Français ranks (rank number → role):
//   255 Empereur des Français (owner)   19 Maréchal            18 Général de Division
//    17 Général de Brigade              16 Colonel             15 Major
//    14 Chef de Bataillon               13 Capitaine           12 Lieutenant
//    11 Sous-Lieutenant                 10 Bénéficiaire d'Empire (retired officers, custom)
//     9 Adjudant Sous-Officier           8 Adjudant             7 Sergent Major
//     6 Sergent                          5 Caporal Fourrier     4 Caporal
//     3 Soldat                           2 Conscrit             1 Citoyen / Member
//
// Neuvième Corps ranks (rank number → role): 255 Commandant de l'Armée d'Orient,
//   254 Napoléon (owner), 190 Commandants du Corps, 21 État-major, 20 Officiers
//   à la Suite, 15 Commandants, 10 Officier Supérieur, 8 Officier Subalterne,
//   7 Sous-Officier, 3 Vétéran, 1 Militaire du Rang / Member.
//
// Sync design (confirmed with the owner):
//   - EF enlisted (Citoyen–Caporal Fourrier, 1–5) → Militaire du Rang.
//   - EF NCOs (Sergent–Adjudant Sous-Officier, 6–9) → Sous-Officier.
//   - Bénéficiaire d'Empire (10) has NO rule: it is a custom retired-officer
//     role, so the Corps rank is left unchanged.
//   - EF junior officers (Sous-Lieutenant–Capitaine, 11–13) → Officier Subalterne.
//   - EF senior officers (Chef de Bataillon–Colonel, 14–16) → Officier Supérieur.
//   - EF ranks above Colonel (Général de Brigade and up, 17+) have NO rule:
//     Corps appointments above Officier Supérieur are made manually.

// One mapping rule: an inclusive EF rank-number range and the Corps role name.
export type RankSyncRule = {
  efMin: number;
  efMax: number;
  efLabel: string;
  corpsRoleName: string;
};

export const RANK_SYNC_RULES: RankSyncRule[] = [
  { efMin: 1, efMax: 5, efLabel: "Citoyen–Caporal Fourrier", corpsRoleName: "Militaire du Rang" },
  { efMin: 6, efMax: 9, efLabel: "Sergent–Adjudant Sous-Officier", corpsRoleName: "Sous-Officier" },
  { efMin: 11, efMax: 13, efLabel: "Sous-Lieutenant–Capitaine", corpsRoleName: "Officier Subalterne" },
  { efMin: 14, efMax: 16, efLabel: "Chef de Bataillon–Colonel", corpsRoleName: "Officier Supérieur" },
];
