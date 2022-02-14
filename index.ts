import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import { CIConfig, WebhookBody } from "./types";
import { execute } from "./tools";
import { readFile } from "fs/promises";
import path = require("path");
import fs from "fs";
import { Console } from "console";

const app = express();
app.use(bodyParser.json());

const PORT = 2000;
const EXEC_STDIO_OPTIONS = [0, 1, 2];
const JOB_FILE_DIR = "ci-jobs";
const RESULTS_FILE_DIR = "ci-results";
const CI_FILE_NAME = ".ci.json";

app.post("/run", async (req: Request, res: Response) => {
  const {
    repository: {
      ssh_url,
      name: repositoryName,
      owner: { name: ownerName },
    },
    after: commitHash,
    ref: branchRef,
  }: WebhookBody = req.body;

  // make a new logger
  const loggingDirectory = `${RESULTS_FILE_DIR}/${repositoryName}/${branchRef}`;
  const createLoggingDirCommand = `mkdir -p "${loggingDirectory}"`;
  await execute(createLoggingDirCommand, {
    encoding: "utf-8",
    stdio: EXEC_STDIO_OPTIONS,
  });
  const logger = new Console({
    stdout: fs.createWriteStream(`${loggingDirectory}/out.log`),
    stderr: fs.createWriteStream(`${loggingDirectory}/err.log`),
  });

  // extract the clean branch name of the commit
  const branch = branchRef.substring("refs/heads/".length);

  const jobDirectory = `${JOB_FILE_DIR}/${ownerName}-${repositoryName}-${commitHash}`;

  // create and enter parent and job directory (if not existing)
  const createDirsCommand = `mkdir -p "${jobDirectory}"`;
  await execute(createDirsCommand, {
    encoding: "utf8",
    stdio: EXEC_STDIO_OPTIONS,
  });

  // clone repository into current directory
  const cloneCommand = `git clone ${ssh_url} . --branch ${branch}`;
  await execute(cloneCommand, {
    encoding: "utf8",
    stdio: EXEC_STDIO_OPTIONS,
    cwd: jobDirectory,
  });

  // read .ci.json configuration file and run the user-defined steps
  const absoluteJobDirectory = path.resolve(__dirname, jobDirectory);
  const ciConfigFileBuffer = await readFile(
    path.join(absoluteJobDirectory, CI_FILE_NAME)
  );
  if (!ciConfigFileBuffer) {
    res.status(500);
    return;
  }
  const { dependencies, compile, test }: CIConfig = JSON.parse(
    ciConfigFileBuffer.toString()
  );

  // run dependency installation steps
  for (const cmd of dependencies) {
    await execute(
      cmd,
      {
        encoding: "utf8",
        stdio: EXEC_STDIO_OPTIONS,
        cwd: absoluteJobDirectory,
      },
      logger
    );
  }
  // run compilation steps
  for (const cmd of compile) {
    await execute(
      cmd,
      {
        encoding: "utf8",
        stdio: EXEC_STDIO_OPTIONS,
        cwd: absoluteJobDirectory,
      },
      logger
    );
  }
  // run testing steps
  for (const cmd of test) {
    await execute(
      cmd,
      {
        encoding: "utf8",
        stdio: EXEC_STDIO_OPTIONS,
        cwd: absoluteJobDirectory,
      },
      logger
    );
  }

  // cleanup build files
  const rmCommand = `rm -rf "${absoluteJobDirectory}"`;
  await execute(rmCommand, {
    encoding: "utf8",
    stdio: EXEC_STDIO_OPTIONS,
  });
});

app.listen(PORT, function () {
  console.log(`CI Server is running on PORT: ${PORT}`);
});
