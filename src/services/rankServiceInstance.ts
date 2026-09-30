// services/rankServiceInstance.ts
// Wires the rank service to the real Roblox API wrappers and exposes a single
// configured instance to the /rank command.
import {
  getRankInGroup,
  getGroupRoles,
  setRank,
  getBotUserId,
} from "../api/roblox";
import { createRankService } from "./rankService";

type RankService = ReturnType<typeof createRankService>;

let instance: RankService | null = null;

// Builds and stores the shared rank service (called once at startup).
export function configureRankService(): RankService {
  instance = createRankService({ getRankInGroup, getGroupRoles, setRank, getBotUserId });
  return instance;
}

// Returns the shared rank service, throwing if it was never configured.
export function getRankService(): RankService {
  if (!instance) {
    throw new Error("Rank service used before it was configured.");
  }
  return instance;
}
