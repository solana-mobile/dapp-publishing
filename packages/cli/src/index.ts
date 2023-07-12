import { mainCli } from "./CliSetup.js";

async function main() {
  await mainCli.parseAsync(process.argv);

  process.exit(0)
}

main();
