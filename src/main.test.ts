import { describe, test, expect} from "vitest";
import { getCorpsID, groups} from "./init";

describe("Vitest test", () => {
    test("Group ID is correct", () => {
        expect(getCorpsID()).toBe(groups.DISCORD_CORPS_ID);
        // sup2
    })
})