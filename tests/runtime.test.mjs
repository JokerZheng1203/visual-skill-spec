import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {fileURLToPath} from "node:url";
import {
  OPENAI_GPT_IMAGE_2_ADAPTER_ID,
  ReferenceRuntimeError,
  SchemaValidationError,
  VisualSkillReferenceRuntime,
  createReferenceRuntime
} from "../src/index.mjs";
import {createSchemaValidator} from "../src/schema-validator.mjs";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testsDir, "..");

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(projectRoot, relativePath), "utf8"));
}

const validator = await createSchemaValidator();
const skill = await readJson("examples/preserve/travel-editorial.skill.json");
const requestBody = await readJson("examples/preserve/travel-editorial.request.json");
const rendererSnapshot = await readJson("examples/preserve/travel-editorial.renderer-request.json");
const request = {skill, ...requestBody};

test("Reference Runtime executes the validated Core-to-Adapter pipeline", async () => {
  const runtime = await createReferenceRuntime({validator});
  const result = runtime.execute(request);

  assert.deepEqual(runtime.adapter_ids, [OPENAI_GPT_IMAGE_2_ADAPTER_ID]);
  assert.deepEqual(result.applicability, result.creative_plan.applicability);
  assert.deepEqual(result.renderer_request, rendererSnapshot);
  assert.equal(Object.hasOwn(result.creative_plan, "provider"), false);
  assert.equal(result.renderer_request.provider, "openai");
});

test("Reference Runtime rejects invalid input at the Schema boundary", async () => {
  const runtime = await createReferenceRuntime({validator});
  const invalid = structuredClone(request);
  delete invalid.user_controls.aspect_ratio;

  assert.throws(
    () => runtime.execute(invalid),
    (error) => (
      error instanceof SchemaValidationError
      && error.code === "E_SCHEMA_VALIDATION"
      && error.schema_id === "urn:visual-skill:compile-request:v0.1.0"
      && error.errors.length > 0
    )
  );
});

test("Reference Runtime reports unregistered and inconsistent adapters", () => {
  const runtime = new VisualSkillReferenceRuntime({validator});
  const creativePlan = runtime.compile(request);

  assert.throws(
    () => runtime.render(creativePlan, {adapter_id: "missing.adapter"}),
    (error) => error instanceof ReferenceRuntimeError && error.code === "E_ADAPTER_NOT_FOUND"
  );

  const inconsistent = new VisualSkillReferenceRuntime({
    validator,
    adapters: [{
      adapter_id: "test.adapter",
      render: () => rendererSnapshot
    }]
  });
  assert.throws(
    () => inconsistent.render(creativePlan, {adapter_id: "test.adapter"}),
    (error) => error instanceof ReferenceRuntimeError && error.code === "E_ADAPTER_ID_MISMATCH"
  );
});

test("Reference Runtime validates adapter registration", () => {
  assert.throws(
    () => new VisualSkillReferenceRuntime({validator, adapters: [{adapter_id: "broken"}]}),
    (error) => error instanceof ReferenceRuntimeError && error.code === "E_ADAPTER_INVALID"
  );

  const adapter = {adapter_id: "duplicate", render: () => rendererSnapshot};
  assert.throws(
    () => new VisualSkillReferenceRuntime({validator, adapters: [adapter, adapter]}),
    (error) => error instanceof ReferenceRuntimeError && error.code === "E_ADAPTER_DUPLICATE"
  );
});

test("Package entry point exposes Runtime, Core, validation, and Adapter APIs", async () => {
  const api = await import("../src/index.mjs");

  assert.equal(typeof api.createReferenceRuntime, "function");
  assert.equal(typeof api.compileCreativePlan, "function");
  assert.equal(typeof api.createSchemaValidator, "function");
  assert.equal(typeof api.renderWithOpenAIGptImage2, "function");
});
