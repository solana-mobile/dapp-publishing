import { mainCli } from "../index";

describe("General Module", () => {

  test("we can run a test", () => {
    mainCli.exitOverride();

    mainCli
      .command("dothis")
      .requiredOption(
        "-k, --keypair <path-to-keypair-file>",
        "Path to keypair file"
      )
      .option("-u, --url <url>", "RPC URL", "")
      .action(async () => { });


    expect(() => {
        mainCli.parse(["npx", "blah"]);
      }
    ).toThrow("error: required option '-k, --keypair <path-to-keypair-file>' not specified");
  });

});