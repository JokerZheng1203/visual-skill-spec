import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createReferenceRuntime} from "./runtime.mjs";
import {assertSchema, createSchemaValidator, SCHEMA_IDS} from "./schema-validator.mjs";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(sourceDir, "..");

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(projectRoot, relativePath), "utf8"));
}

const ajv = await createSchemaValidator();
const runtime = await createReferenceRuntime({validator: ajv});
const referenceAnalysisPolicy = await readJson("profiles/reference-balanced.analysis-policy.json");
assertSchema(
  ajv,
  SCHEMA_IDS.analysisPolicy,
  referenceAnalysisPolicy,
  "reference analysis policy"
);
const fixtureRoots = [
  "preserve/travel-editorial",
  "reimagine/paper-journey",
  "baseline/simple-film/simple-film"
];

for (const fixtureRoot of fixtureRoots) {
  const name = fixtureRoot.split("/").at(-1);
  const skill = await readJson(`examples/${fixtureRoot}.skill.json`);
  const requestBody = await readJson(`examples/${fixtureRoot}.request.json`);
  const request = {skill, ...requestBody};

  assertSchema(ajv, SCHEMA_IDS.skill, skill, `${name} skill`);
  assertSchema(ajv, SCHEMA_IDS.compileRequest, request, `${name} compile request`);
  runtime.execute(request);
  console.log(`validated ${fixtureRoot}`);
}
