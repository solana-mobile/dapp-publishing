import { Command } from "commander";

async function main() {
  const program = new Command();
  program
    .name("dapp-store")
    .version("0.1.0")
    .description("CLI to assist with publishing to the Saga Dapp Store")
    // For some reason i can't retrieve these global options in subcommands
    // .requiredOption("-k, --keypair", "Path to keypair file")
    // .option("-u, --url", "RPC URL", "https://devnet.solana.com")
    .command("create <type>", "Create a publisher, app, or release", {
      executableFile: "commands/create/index",
    });

  await program.parseAsync(process.argv);
}
main();
