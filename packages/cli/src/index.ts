import { showMessage } from "./CliUtils.js";
import { mainCli } from "./CliSetup.js";
import {
  getCommanderUserFacingError,
  isCommanderLifecycleExit,
} from "./cli/parseErrors.js";

export async function main(argv = process.argv) {
  mainCli.showHelpAfterError(false);
  mainCli.exitOverride();

  const outputConfig = mainCli.configureOutput();
  mainCli.configureOutput({
    ...outputConfig,
    outputError() {},
  });

  try {
    await mainCli.parseAsync(argv);
  } catch (error) {
    if (isCommanderLifecycleExit(error)) {
      return;
    }

    const userFacingError = getCommanderUserFacingError(error);
    if (userFacingError) {
      showMessage("Error", userFacingError.message, "error");
      process.exitCode = userFacingError.exitCode;
      return;
    }

    throw error;
  }
}
