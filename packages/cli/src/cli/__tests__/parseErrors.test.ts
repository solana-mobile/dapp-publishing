import { describe, expect, test } from "@jest/globals";

import {
  getCommanderUserFacingError,
  isCommanderLifecycleExit,
} from "../parseErrors";
import { UPDATED_PUBLISHING_CLI_DOCS_URL } from "../../publication/cliValidation";

describe("CLI parse error handling", () => {
  test("legacy parse errors point to the updated publishing docs", () => {
    const error = getCommanderUserFacingError({
      code: "commander.unknownOption",
      exitCode: 1,
      message: "error: unknown option '-k'",
      name: "CommanderError",
    });

    expect(error).not.toBeNull();
    expect(error?.exitCode).toBe(1);
    expect(error?.message).toContain("Unknown option '-k'.");
    expect(error?.message).toContain(UPDATED_PUBLISHING_CLI_DOCS_URL);
  });

  test("help exits are ignored", () => {
    expect(
      isCommanderLifecycleExit({
        code: "commander.helpDisplayed",
        exitCode: 0,
        message: "(outputHelp)",
        name: "CommanderError",
      })
    ).toBe(true);
  });
});
