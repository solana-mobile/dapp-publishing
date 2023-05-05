import { beforeAll, beforeEach, expect } from "@jest/globals";
import { mainCli } from "../CliSetup";
import { Constants } from "../CliUtils";

describe("Cli Setup & Execution", () => {
  let errorOutput: string = ""

  beforeAll(() => {
    mainCli.exitOverride();

    mainCli.configureOutput({
      getOutHelpWidth(): number { return 250; },
      getErrHelpWidth(): number { return 250;},

      writeErr(str: string) {
        errorOutput = str;
      }
    });
  });

  beforeEach(() => {
    errorOutput = "";
  });

  test("Cli version argument reports correct version", () => {

    expect(() => {
      mainCli.parse(["npx", "dapp-store", "-V"]);
    }).toThrow(Constants.CLI_VERSION)

  });

  test("Calling cli with no parameters displays general help", () => {

    expect(() => {
        mainCli.parse(["npx", "dapp-store"]);
      }
    ).toThrow("(outputHelp)");

    expect(generalHelp).toEqual(errorOutput)
  });

  test("Calling create command with no options lists all options", () => {

    expect(() => {
        mainCli.parse(["npx", "dapp-store", "create"]);
      }
    ).toThrow("(outputHelp)");

    expect(createHelp).toEqual(errorOutput)

  });

  const generalHelp = `Usage: dapp-store [options] [command]

CLI to assist with publishing to the Saga Dapp Store

Options:
  -V, --version       output the version number
  -h, --help          display help for command

Commands:
  init                First-time initialization of tooling configuration
  create              Create a \`publisher\`, \`app\`, or \`release\`
  validate [options]  Validates details prior to publishing
  publish             Submit a publishing request (\`submit\`, \`update\`, \`remove\`, or \`support\`) to the Solana Mobile dApp publisher portal
  help [command]      display help for command
`;

  const createHelp = `Usage: dapp-store create [options] [command]

Create a \`publisher\`, \`app\`, or \`release\`

Options:
  -h, --help           display help for command

Commands:
  publisher [options]  Create a publisher
  app [options]        Create a app
  release [options]    Create a release
  help [command]       display help for command
`;
});