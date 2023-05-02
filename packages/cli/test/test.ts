import { describe, expect, test, jest } from "@jest/globals";
import { Command } from "commander";
import { Constants } from "../src/CliUtils";

describe("General Module", () => {

  test("we can run a test", () => {
    //expect((1 + 2)).toBe(3);

    const myStr = Constants.CLI_VERSION

    const writeSpy = jest.spyOn(process.stdout, "write").mockImplementation((std) => {
      console.log(std + myStr);

      return true;
    });

    const program = new Command();
    program.name("blah");
    program.exitOverride();

    program
      .command("dothis")
      .requiredOption(
        "-k, --keypair <path-to-keypair-file>",
        "Path to keypair file"
      )
      .option("-u, --url <url>", "RPC URL", "")
      .action(async (keypair, url) => {
        console.log("hello");
      });


    expect(() => {
      program.parse(["npx", "blah"]);
    }).toThrow("error: required option '-k, --keypair <path-to-keypair-file>' not specified");

    writeSpy.mockClear();

    // expect(() => {
    //   program.parse(['node', 'test', '--help']);
    // }).toThrow('(outputHelp)');
  });

});