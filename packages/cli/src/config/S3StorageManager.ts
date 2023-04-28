import { EnvVariables, S3Config } from "./EnvVariables.js";

export class S3StorageManager {

  public get hasS3Config(): boolean {
    // TODO: Will be a better boolean
    return this.envVars.hasS3EnvArgs;
  }

  public get s3Config(): S3Config {
    return {
      accessKey: this.envVars.s3Config.accessKey,
      secretKey: this.envVars.s3Config.secretKey,
      bucketName: this.envVars.s3Config.bucketName,
    };
  }

  constructor(
    private envVars: EnvVariables
  ) { }

  parseCmdArg(cmdArg: string) {
    throw new Error(`:: Your args: ${cmdArg}`);
  }

}