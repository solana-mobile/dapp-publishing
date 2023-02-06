import fs, { read } from "fs";
import yaml from "js-yaml";
import generateSchema from "generate-schema";

try {
  const yamlSrc = fs.readFileSync('./src/schemas/publishing_source.yaml', 'utf8')
  const convertedYaml = yaml.load(yamlSrc);
  fs.writeFileSync('./src/generated/config_obj.json', Buffer.from(JSON.stringify(convertedYaml)), 'utf-8');

  const schema = generateSchema.json('result', convertedYaml);

  // Generator adds some keys/values we don't need & mess up validation
  delete schema.$schema;
  delete schema.title;

  const toWrite = Buffer.from(JSON.stringify(schema));
  fs.writeFileSync('./src/generated/config_schema.json', toWrite, 'utf-8');
} catch (e) {
  console.log(":: Schema generation step failed ::");
}
