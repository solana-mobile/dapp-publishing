import { formatUpdatedCliUsageError } from "../publication/cliValidation.js";

type CommanderLikeError = {
  code?: string;
  exitCode?: number;
  message?: string;
  name?: string;
};

const COMMANDER_EXIT_CODES_TO_IGNORE = new Set([
  "commander.help",
  "commander.helpDisplayed",
  "commander.version",
]);

const UPDATED_DOCS_PARSE_ERROR_CODES = new Set([
  "commander.excessArguments",
  "commander.unknownCommand",
  "commander.unknownOption",
]);

export function isCommanderLifecycleExit(error: unknown): boolean {
  return (
    isCommanderError(error) &&
    COMMANDER_EXIT_CODES_TO_IGNORE.has(error.code ?? "")
  );
}

export function getCommanderUserFacingError(error: unknown): {
  exitCode: number;
  message: string;
} | null {
  if (!isCommanderError(error)) {
    return null;
  }

  const message = error.message ?? "Invalid CLI arguments.";
  return {
    exitCode: error.exitCode ?? 1,
    message: UPDATED_DOCS_PARSE_ERROR_CODES.has(error.code ?? "")
      ? formatUpdatedCliUsageError(message)
      : normalizeCommanderErrorMessage(message),
  };
}

function isCommanderError(error: unknown): error is CommanderLikeError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error
  );
}

function normalizeCommanderErrorMessage(message: string): string {
  const normalized = message.replace(/^error:\s*/i, "").trim();
  if (normalized.length === 0) {
    return "Invalid CLI arguments.";
  }

  return normalized.endsWith(".") ? normalized : `${normalized}.`;
}
