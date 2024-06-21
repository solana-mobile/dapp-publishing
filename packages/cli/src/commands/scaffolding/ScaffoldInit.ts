import yaml, { dump } from "js-yaml";

import { readFile } from 'fs/promises';
const releaseSchema = JSON.parse((await readFile(new URL("../../generated/config_obj.json", import.meta.url))).toString());
import fs from "fs";
import { Constants } from "../../CliUtils.js";

export const initScaffold = (): string => {
  const outputYaml = Constants.CONFIG_FILE_NAME;
  const outFile = `${process.cwd()}/${outputYaml}`;

  if (fs.existsSync(outFile)) {
    throw Error("Configuration file already present; please use to intialize a new config file.");
  }

  fs.writeFileSync(outFile, dump(releaseSchema));

  return `Your configuration file was created: ${outputYaml}`;
};