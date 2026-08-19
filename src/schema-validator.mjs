import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(sourceDir, "..");

export const SCHEMA_IDS = Object.freeze({
  skill: "urn:visual-skill:definition:v0.1.0",
  compileRequest: "urn:visual-skill:compile-request:v0.1.0",
  analysisPolicy: "urn:visual-skill:analysis-policy:v0.1.0",
  applicability: "urn:visual-skill:applicability-result:v0.1.0",
  creativePlan: "urn:visual-skill:creative-plan:v0.1.0",
  rendererRequest: "urn:visual-skill:renderer-request:v0.1.0",
  qualityEvaluation: "urn:visual-skill:quality-evaluation:v0.1.0",
  productBehaviorEvent: "urn:visual-skill:product-behavior-event:v0.1.0"
});

const schemaFiles = [
  "common.schema.json",
  "analysis-policy.schema.json",
  "applicability-result.schema.json",
  "visual-skill.schema.json",
  "compile-request.schema.json",
  "creative-plan.schema.json",
  "renderer-request.schema.json",
  "quality-evaluation.schema.json",
  "product-behavior-event.schema.json"
];

export class SchemaValidationError extends Error {
  constructor(schemaId, label, errors = []) {
    const detail = errors
      .map((error) => `${error.instancePath || "/"} ${error.message}`)
      .join("\n");
    super(`${label} failed schema validation${detail ? `:\n${detail}` : ""}`);
    this.name = "SchemaValidationError";
    this.code = "E_SCHEMA_VALIDATION";
    this.schema_id = schemaId;
    this.label = label;
    this.errors = structuredClone(errors);
  }
}

export async function createSchemaValidator() {
  const ajv = new Ajv2020({allErrors: true, strict: true});
  for (const filename of schemaFiles) {
    const contents = await fs.readFile(path.join(projectRoot, "schemas", filename), "utf8");
    ajv.addSchema(JSON.parse(contents));
  }
  return ajv;
}

export function assertSchema(ajv, schemaId, data, label = schemaId) {
  const validate = ajv.getSchema(schemaId);
  if (!validate) throw new Error(`Schema not loaded: ${schemaId}`);
  if (!validate(data)) {
    throw new SchemaValidationError(schemaId, label, validate.errors ?? []);
  }
  return true;
}
