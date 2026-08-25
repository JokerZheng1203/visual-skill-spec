import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const defaultManifestPath = path.join(projectRoot, "evals/gate1/dataset/private/dataset-manifest.jsonl");
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const RIGHTS_STATUSES = new Set(["self_owned", "consented", "licensed"]);
const ORIENTATIONS = new Set(["portrait", "landscape", "square"]);
const ASPECT_RATIOS = new Set(["1:1", "3:2", "2:3", "4:5", "5:4", "16:9", "9:16"]);

function usage() {
  return "Usage: node scripts/validate-gate1-dataset.mjs [dataset-manifest.jsonl]";
}

async function readJsonl(filePath) {
  const source = await fs.readFile(filePath, "utf8");
  const records = [];
  for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      records.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`${filePath}:${index + 1}: invalid JSON: ${error.message}`);
    }
  }
  return records;
}

function requireString(record, field, label, errors) {
  if (typeof record[field] !== "string" || record[field].length === 0) {
    errors.push(`${label}: ${field} must be a non-empty string.`);
  }
}

function validateRecords(records, config) {
  const errors = [];
  const photoIds = new Set();
  const sourceHashes = new Set();
  const sceneSplits = new Map();
  const sessionSplits = new Map();
  const holdoutContributorCounts = new Map();
  const allowedStrata = new Set(Object.keys(config.dataset.holdout_strata));
  let holdoutCount = 0;

  if (records.length === 0) errors.push("Dataset manifest must contain at least one record.");

  for (const [index, record] of records.entries()) {
    const label = `record ${index + 1}${record.photo_id ? ` (${record.photo_id})` : ""}`;
    for (const field of [
      "photo_id",
      "scene_group_id",
      "capture_session_id",
      "contributor_id",
      "primary_stratum",
      "orientation",
      "target_aspect_ratio",
      "source_sha256",
      "rights_status"
    ]) requireString(record, field, label, errors);

    if (typeof record.photo_id === "string") {
      if (!SAFE_ID_PATTERN.test(record.photo_id)) errors.push(`${label}: photo_id contains unsafe characters.`);
      if (photoIds.has(record.photo_id)) errors.push(`${label}: duplicate photo_id.`);
      photoIds.add(record.photo_id);
    }
    if (!SHA256_PATTERN.test(record.source_sha256 ?? "")) {
      errors.push(`${label}: source_sha256 must be 64-char lowercase hex.`);
    } else if (sourceHashes.has(record.source_sha256)) {
      errors.push(`${label}: duplicate source_sha256.`);
    } else {
      sourceHashes.add(record.source_sha256);
    }
    if (!["dev", "holdout"].includes(record.split)) errors.push(`${label}: split must be dev or holdout.`);
    if (typeof record.intended_domain !== "boolean") errors.push(`${label}: intended_domain must be boolean.`);
    if (!RIGHTS_STATUSES.has(record.rights_status)) errors.push(`${label}: invalid rights_status.`);
    if (record.exif_removed !== true) errors.push(`${label}: exif_removed must be true.`);
    if (!allowedStrata.has(record.primary_stratum)) errors.push(`${label}: invalid primary_stratum.`);
    if (!ORIENTATIONS.has(record.orientation)) errors.push(`${label}: invalid orientation.`);
    if (!ASPECT_RATIOS.has(record.target_aspect_ratio)) errors.push(`${label}: invalid target_aspect_ratio.`);

    for (const [field, splitMap] of [
      ["scene_group_id", sceneSplits],
      ["capture_session_id", sessionSplits]
    ]) {
      const id = record[field];
      if (typeof id !== "string" || !["dev", "holdout"].includes(record.split)) continue;
      const priorSplit = splitMap.get(id);
      if (priorSplit && priorSplit !== record.split) errors.push(`${label}: ${field} ${id} crosses dev / holdout.`);
      else splitMap.set(id, record.split);
    }

    if (record.split === "holdout" && typeof record.contributor_id === "string") {
      holdoutCount += 1;
      holdoutContributorCounts.set(record.contributor_id, (holdoutContributorCounts.get(record.contributor_id) ?? 0) + 1);
    }
  }

  if (holdoutCount > 0) {
    const limit = config.dataset.hard_max_contributor_holdout_share;
    for (const [contributorId, count] of holdoutContributorCounts) {
      const share = count / holdoutCount;
      if (share > limit) errors.push(`holdout contributor ${contributorId} share ${share.toFixed(4)} exceeds ${limit}.`);
    }
  }

  if (errors.length > 0) throw new Error(errors.join("\n"));
  return {
    records: records.length,
    dev: records.filter((record) => record.split === "dev").length,
    holdout: holdoutCount
  };
}

const [manifestArgument, ...extraArguments] = process.argv.slice(2);
if (manifestArgument === "--help") {
  console.log(usage());
} else if (extraArguments.length > 0) {
  console.error(usage());
  process.exitCode = 2;
} else {
  try {
    const manifestPath = manifestArgument ? path.resolve(manifestArgument) : defaultManifestPath;
    const config = JSON.parse(await fs.readFile(path.join(projectRoot, "evals/gate1/gate-config.json"), "utf8"));
    const result = validateRecords(await readJsonl(manifestPath), config);
    console.log("GATE1_DATASET_VALID");
    console.log(JSON.stringify({manifest: manifestPath, ...result}, null, 2));
  } catch (error) {
    console.error("GATE1_DATASET_INVALID");
    console.error(error.message);
    process.exitCode = 1;
  }
}
