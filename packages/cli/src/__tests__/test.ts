import { jest } from "@jest/globals";
import { Command } from "commander";
import { Constants } from "../CliUtils";
import { testProgram } from "../index";

describe("General Module", () => {

  test("we can run a test", () => {
    //expect((1 + 2)).toBe(3);

    const myStr = Constants.CLI_VERSION
    const mytester = testProgram

    // const writeSpy = jest.spyOn(process.stdout, "write").mockImplementation((std) => {
    //   console.log(std + myStr);
    //
    //   return true;
    // });

    // const program = new Command();
    // program.name("blah");
    mytester.exitOverride();

    mytester
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
      mytester.parse(["npx", "blah"]);
    }).toThrow("error: required option '-k, --keypair <path-to-keypair-file>' not specified");

    // writeSpy.mockClear();
  });

});