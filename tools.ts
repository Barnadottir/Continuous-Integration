import { exec, ExecSyncOptionsWithStringEncoding } from "child_process";

export const execute = async (
  cmd: string,
  options: ExecSyncOptionsWithStringEncoding,
  logger = console
) => {
  const child = exec(cmd, options, (err, stdout, stderr) => {
    if (err) {
      logger.error(`error: ${err}`);
      throw err;
    }
    logger.log(`stdout: ${stdout}`);
    logger.log(`stderr: ${stderr}`);
  });

  await new Promise((resolve) => {
    child.on("close", resolve);
  });
};
