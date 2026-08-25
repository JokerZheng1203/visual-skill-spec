import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  compileCreativePlan,
  evaluateApplicability,
  validateCompileRequestSemantics
} from "../src/compiler.mjs";
import {
  assertSchema,
  createSchemaValidator,
  SCHEMA_IDS
} from "../src/schema-validator.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const defaultPrivateRoot = path.join(projectRoot, "evals/gate1/dataset/private");
const defaultManifestPath = path.join(defaultPrivateRoot, "dataset-manifest.jsonl");
const subSchemaIds = {
  userFacts: `${SCHEMA_IDS.compileRequest}#/$defs/UserFacts`,
  userContent: `${SCHEMA_IDS.compileRequest}#/$defs/UserContent`,
  photoAnalysis: `${SCHEMA_IDS.compileRequest}#/$defs/PhotoAnalysis`
};

function usage() {
  return "Usage: node scripts/validate-gate1-scene-cards.mjs [dataset-manifest.jsonl] [private-root]";
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${filePath}: ${error.message}`);
  }
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

function validationControls(record, userContent) {
  const hasCustomCopy = userContent.copy.title !== undefined || userContent.copy.subtitle !== undefined;
  return {
    creative_intensity: 0.5,
    text_mode: hasCustomCopy ? "custom" : "auto",
    typography_rendering: "model",
    aspect_ratio: record.target_aspect_ratio
  };
}

const [manifestArgument, privateRootArgument, ...extraArguments] = process.argv.slice(2);
if (manifestArgument === "--help") {
  console.log(usage());
} else if (extraArguments.length > 0) {
  console.error(usage());
  process.exitCode = 2;
} else {
  try {
    const manifestPath = manifestArgument ? path.resolve(manifestArgument) : defaultManifestPath;
    const privateRoot = privateRootArgument ? path.resolve(privateRootArgument) : defaultPrivateRoot;
    const records = await readJsonl(manifestPath);
    const devRecords = records.filter((record) => record.split === "dev");
    if (devRecords.length === 0) throw new Error("Dataset manifest contains no dev records.");

    const [skill, analysisPolicy, validator] = await Promise.all([
      readJson(path.join(projectRoot, "examples/preserve/travel-editorial.skill.json")),
      readJson(path.join(projectRoot, "profiles/reference-balanced.analysis-policy.json")),
      createSchemaValidator()
    ]);
    const results = [];

    for (const record of devRecords) {
      if (typeof record.photo_id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(record.photo_id)) {
        throw new Error(`Invalid or unsafe dev photo_id: ${record.photo_id}`);
      }
      const userFacts = await readJson(path.join(privateRoot, "facts", `${record.photo_id}.json`));
      const userContent = await readJson(path.join(privateRoot, "content", `${record.photo_id}.json`));
      const photoAnalysis = await readJson(path.join(privateRoot, "analysis", `${record.photo_id}.json`));

      assertSchema(validator, subSchemaIds.userFacts, userFacts, `${record.photo_id} UserFacts`);
      assertSchema(validator, subSchemaIds.userContent, userContent, `${record.photo_id} UserContent`);
      assertSchema(validator, subSchemaIds.photoAnalysis, photoAnalysis, `${record.photo_id} PhotoAnalysis`);

      const request = {
        skill,
        user_facts: userFacts,
        user_content: userContent,
        photo_analysis: photoAnalysis,
        analysis_policy: analysisPolicy,
        user_controls: validationControls(record, userContent),
        runtime_safety: {
          policy_id: "gate1-scene-card-validation-v1",
          blocked: false,
          reasons: [],
          overrides: []
        }
      };

      assertSchema(validator, SCHEMA_IDS.compileRequest, request, `${record.photo_id} CompileRequest`);
      validateCompileRequestSemantics(request);
      const applicability = evaluateApplicability(request);
      if (applicability.status !== "not_applicable") compileCreativePlan(request);
      results.push({photo_id: record.photo_id, applicability: applicability.status});
    }

    console.log("GATE1_SCENE_CARDS_VALID");
    console.log(JSON.stringify({manifest: manifestPath, private_root: privateRoot, records: results}, null, 2));
  } catch (error) {
    console.error("GATE1_SCENE_CARDS_INVALID");
    console.error(error.message);
    process.exitCode = 1;
  }
}
