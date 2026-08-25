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

const stagedNames = () => output("git", ["diff", "--cached", "--name-only"])
  .split("\n")
  .filter(Boolean);

const summarize = (files) => {
  const counts = { added: 0, modified: 0, deleted: 0, renamed: 0 };
  const changes = output("git", ["diff", "--cached", "--name-status"])
    .split("\n")
    .filter(Boolean);

  for (const change of changes) {
    const code = change.split("\t")[0][0];
    if (code === "A") counts.added += 1;
    else if (code === "M") counts.modified += 1;
    else if (code === "D") counts.deleted += 1;
    else if (code === "R") counts.renamed += 1;
  }

  const details = [
    counts.added && `新增 ${counts.added} 个文件`,
    counts.modified && `修改 ${counts.modified} 个文件`,
    counts.deleted && `删除 ${counts.deleted} 个文件`,
    counts.renamed && `重命名 ${counts.renamed} 个文件`,
  ].filter(Boolean).join("，");

  const fileList = files.slice(0, 12).map((file) => `- ${file}`);
  if (files.length > 12) fileList.push(`- …以及另外 ${files.length - 12} 个文件`);

  return [
    `变更概览：${details || `共 ${files.length} 个文件发生变化`}`,
    `影响范围：${areaNames || "项目根目录"}`,
    "变更文件：",
    ...fileList,
  ].join("\n");
};

const subject = areaNames ? `update ${areaNames}` : "update project files";
const title = `${type}: ${subject}`;

console.log(`检测到 ${paths.length} 个变更文件。`);
output("git", ["add", "--all"]);

const files = stagedNames();
const body = summarize(files);
const message = `${title}\n\n${body}`;

console.log(`自动生成提交信息：\n\n${message}`);

output("git", ["commit", "-m", title, "-m", body]);

const branch = output("git", ["branch", "--show-current"]);
if (!branch) throw new Error("无法确定当前分支。");

console.log(`正在推送到 origin/${branch}...`);
console.log(output("git", ["push", "-u", "origin", branch]));
console.log("提交并推送完成。");
