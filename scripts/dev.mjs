import { spawn } from "node:child_process";

const npmCli = process.env.npm_execpath;
const npmCommand = npmCli ? process.execPath : (process.platform === "win32" ? "npm.cmd" : "npm");
const children = ["dev:api", "dev:web"].map((script) => spawn(
  npmCommand,
  npmCli ? [npmCli, "run", script] : ["run", script],
  { stdio: "inherit", shell: !npmCli && process.platform === "win32" }
));
let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill("SIGTERM"));
  process.exitCode = exitCode;
}

children.forEach((child) => {
  child.on("error", (error) => {
    console.error(error);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping && code && code !== 0) stop(code);
  });
});

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
