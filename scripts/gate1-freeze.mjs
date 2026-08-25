import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const manifestPath = path.join(projectRoot, "evals/gate1/freeze-manifest.json");

const REQUIRED_DESIGN_ARTIFACTS = [
  "gate1_design_plan",
  "gate_config",
  "quality_policy",
  "hard_failure_policy",
  "dataset_manifest_template",
  "generation_manifest_template",
  "pair_assignment_template",
  "ratings_template",
  "candidate_skill_starting_version",
  "plain_prompt_starting_version"
];

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function usage() {
  return "Usage: node scripts/gate1-freeze.mjs design --check|--write";
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isIsoTimestamp(value) {
  return typeof value === "string"
    && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString() === value;
}

async function readManifest() {
  return JSON.parse(await fs.readFile(manifestPath, "utf8"));
}

async function inspectArtifacts(manifest, {requireHashes}) {
  const freeze = manifest.design_freeze;
  assert(freeze && typeof freeze === "object", "Missing design_freeze object.");
  assert(Array.isArray(freeze.artifacts), "design_freeze.artifacts must be an array.");

  const ids = new Set();
  for (const artifact of freeze.artifacts) {
    assert(typeof artifact.artifact_id === "string" && artifact.artifact_id.length > 0, "Every artifact requires artifact_id.");
    assert(!ids.has(artifact.artifact_id), `Duplicate artifact_id: ${artifact.artifact_id}`);
    ids.add(artifact.artifact_id);
  }
  for (const requiredId of REQUIRED_DESIGN_ARTIFACTS) {
    assert(ids.has(requiredId), `Missing required Design Freeze artifact: ${requiredId}`);
  }

  const inspected = [];
  for (const artifact of freeze.artifacts) {
    assert(typeof artifact.path === "string" && artifact.path.length > 0, `${artifact.artifact_id}: path must be non-empty.`);
    assert(typeof artifact.version === "string" && artifact.version.length > 0, `${artifact.artifact_id}: version must be non-empty.`);
    assert(!path.isAbsolute(artifact.path), `${artifact.artifact_id}: path must be project-relative.`);

    const absolutePath = path.resolve(projectRoot, artifact.path);
    const relativePath = path.relative(projectRoot, absolutePath);
    assert(relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`), `${artifact.artifact_id}: path escapes project root.`);

    const stat = await fs.stat(absolutePath).catch(() => null);
    assert(stat?.isFile(), `${artifact.artifact_id}: artifact file does not exist: ${artifact.path}`);
    const bytes = await fs.readFile(absolutePath);
    const actualSha256 = crypto.createHash("sha256").update(bytes).digest("hex");

    if (requireHashes) {
      assert(SHA256_PATTERN.test(artifact.sha256 ?? ""), `${artifact.artifact_id}: sha256 must be 64-char lowercase hex.`);
      assert(artifact.sha256 === actualSha256, `${artifact.artifact_id}: sha256 mismatch.`);
    }
    inspected.push({...artifact, actual_sha256: actualSha256});
  }
  return inspected;
}

function assertCompleteState(manifest) {
  const freeze = manifest.design_freeze;
  assert(freeze.status === "complete", `Design Freeze status must be complete; received ${freeze.status}.`);
  assert(isIsoTimestamp(freeze.completed_at), "Design Freeze completed_at must be an ISO-8601 UTC timestamp.");
}

function printArtifacts(manifest) {
  const freeze = manifest.design_freeze;
  console.log(`status: ${freeze.status}`);
  console.log(`completed_at: ${freeze.completed_at}`);
  console.log(`artifact_count: ${freeze.artifacts.length}`);
  for (const artifact of freeze.artifacts) {
    console.log(`- ${artifact.artifact_id} | ${artifact.path} | ${artifact.version} | ${artifact.sha256}`);
  }
}

async function check() {
  const manifest = await readManifest();
  assertCompleteState(manifest);
  await inspectArtifacts(manifest, {requireHashes: true});
  console.log("DESIGN_FREEZE_VALID");
  printArtifacts(manifest);
}

async function write() {
  const manifest = await readManifest();
  const freeze = manifest.design_freeze;
  assert(freeze?.status === "pending", `Refusing to rewrite Design Freeze with status ${freeze?.status}; use --check.`);
  assert(freeze.completed_at === null, "Pending Design Freeze must have completed_at = null.");

  const inspected = await inspectArtifacts(manifest, {requireHashes: false});
  const shaById = new Map(inspected.map((artifact) => [artifact.artifact_id, artifact.actual_sha256]));
  freeze.artifacts = freeze.artifacts.map((artifact) => ({
    ...artifact,
    sha256: shaById.get(artifact.artifact_id)
  }));
  freeze.completed_at = new Date().toISOString();
  freeze.status = "complete";

  const temporaryPath = `${manifestPath}.tmp-${process.pid}`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, manifestPath);

  const written = await readManifest();
  assertCompleteState(written);
  await inspectArtifacts(written, {requireHashes: true});
  console.log("DESIGN_FREEZE_COMPLETE");
  printArtifacts(written);
}

const [scope, operation, ...rest] = process.argv.slice(2);
if (scope !== "design" || !["--check", "--write"].includes(operation) || rest.length > 0) {
  console.error(usage());
  process.exitCode = 2;
} else {
  try {
    if (operation === "--check") await check();
    else await write();
  } catch (error) {
    console.error("DESIGN_FREEZE_INVALID");
    console.error(error.message);
    process.exitCode = 1;
  }
}
