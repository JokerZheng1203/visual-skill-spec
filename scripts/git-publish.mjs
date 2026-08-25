#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const run = (command, args = []) => execFileSync(command, args, {
  cwd: process.cwd(),
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
}).trim();

const output = (command, args = []) => {
  try {
    return run(command, args);
  } catch (error) {
    const details = error.stderr?.toString().trim() || error.message;
    throw new Error(`${command} ${args.join(" ")} failed:\n${details}`);
  }
};

const status = output("git", ["status", "--porcelain"]);
if (!status) {
  console.log("没有需要提交的本地变更，已跳过提交和推送。");
  process.exit(0);
}

const paths = status
  .split("\n")
  .map((line) => line.slice(3).replace(/^.+ -> /, ""));

const topLevel = new Set(paths.map((file) => file.split("/")[0]));
const has = (name) => paths.some((file) => file.startsWith(`${name}/`) || file === name);

let type = "chore";
if (paths.some((file) => /(^|\/)(fix|bug)/i.test(file))) type = "fix";
else if (has("src")) type = "feat";
else if (has("tests") || has("evals")) type = "test";
else if (has("docs") || topLevel.has("README.md")) type = "docs";

const areaNames = [...topLevel]
  .filter((name) => !["README.md", ".github"].includes(name))
  .slice(0, 3)
  .join(", ");
const subject = areaNames ? `update ${areaNames}` : "update project files";
const message = `${type}: ${subject}`;

console.log(`检测到 ${paths.length} 个变更文件。`);
console.log(`自动生成提交信息：${message}`);

output("git", ["add", "--all"]);
output("git", ["commit", "-m", message]);

const branch = output("git", ["branch", "--show-current"]);
if (!branch) throw new Error("无法确定当前分支。");

console.log(`正在推送到 origin/${branch}...`);
console.log(output("git", ["push", "-u", "origin", branch]));
console.log("提交并推送完成。");
