import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {fileURLToPath} from "node:url";
import {
  SpecError,
  calculateQualityEvaluation,
  compileCreativePlan,
  evaluateApplicability,
  validateCompileRequestSemantics,
  validateSkillSemantics
} from "../src/compiler.mjs";
import {renderWithOpenAIGptImage2} from "../src/adapters/openai-gpt-image-2.mjs";
import {assertSchema, createSchemaValidator, SCHEMA_IDS} from "../src/schema-validator.mjs";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testsDir, "..");

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(projectRoot, relativePath), "utf8"));
}

function deepClone(value) {
  return structuredClone(value);
}

function expectSpecError(callback, code) {
  assert.throws(callback, (error) => error instanceof SpecError && error.code === code);
}

function schemaAccepts(ajv, schemaId, value) {
  const validate = ajv.getSchema(schemaId);
  assert.ok(validate, `missing schema ${schemaId}`);
  return validate(value);
}

function containsKey(value, key) {
  if (Array.isArray(value)) return value.some((item) => containsKey(item, key));
  if (value === null || typeof value !== "object") return false;
  return Object.hasOwn(value, key) || Object.values(value).some((item) => containsKey(item, key));
}

const ajv = await createSchemaValidator();
const preserveSkill = await readJson("examples/preserve/travel-editorial.skill.json");
const preserveBody = await readJson("examples/preserve/travel-editorial.request.json");
const preserveRendererSnapshot = await readJson("examples/preserve/travel-editorial.renderer-request.json");
const preserveRequest = {skill: preserveSkill, ...preserveBody};

const reimagineSkill = await readJson("examples/reimagine/paper-journey.skill.json");
const reimagineBody = await readJson("examples/reimagine/paper-journey.request.json");
const reimagineRendererSnapshot = await readJson("examples/reimagine/paper-journey.renderer-request.json");
const reimagineRequest = {skill: reimagineSkill, ...reimagineBody};

test("Core Compiler and GPT Image Adapter expose separate module surfaces", async () => {
  const core = await import("../src/compiler.mjs");
  const adapter = await import("../src/adapters/openai-gpt-image-2.mjs");
  const compatibilityFacade = await import("../src/reference-compiler.mjs");

  assert.equal(typeof core.compileCreativePlan, "function");
  assert.equal(Object.hasOwn(core, "renderWithOpenAIGptImage2"), false);
  assert.equal(typeof adapter.renderWithOpenAIGptImage2, "function");
  assert.equal(Object.hasOwn(adapter, "compileCreativePlan"), false);
  assert.equal(typeof compatibilityFacade.compileCreativePlan, "function");
  assert.equal(typeof compatibilityFacade.renderWithOpenAIGptImage2, "function");
});

test("Preserve and minimal Reimagine fixtures satisfy all public schemas", () => {
  for (const request of [preserveRequest, reimagineRequest]) {
    assertSchema(ajv, SCHEMA_IDS.skill, request.skill);
    assertSchema(ajv, SCHEMA_IDS.compileRequest, request);
    validateCompileRequestSemantics(request);

    const plan = compileCreativePlan(request);
    assertSchema(ajv, SCHEMA_IDS.applicability, plan.applicability);
    assertSchema(ajv, SCHEMA_IDS.creativePlan, plan);
    assertSchema(ajv, SCHEMA_IDS.rendererRequest, renderWithOpenAIGptImage2(plan));
  }
});

test("CreativePlan is deterministic and contains no provider prompt or model", () => {
  const first = compileCreativePlan(preserveRequest);
  const second = compileCreativePlan(preserveRequest);
  assert.deepEqual(first, second);
  assert.equal(Object.hasOwn(first, "prompt"), false);
  assert.equal(Object.hasOwn(first, "provider"), false);
  assert.equal(Object.hasOwn(first, "model"), false);
  assert.ok(Object.keys(first).length > 0);
  assert.equal(containsKey(first, "prompt"), false);
  assert.equal(containsKey(first, "provider"), false);
  assert.equal(containsKey(first, "model"), false);
});

test("UserFacts, UserContent, and UserControls are separate contracts", () => {
  const plan = compileCreativePlan(preserveRequest);
  const locations = plan.resolved_facts.filter((fact) => fact.path === "scene.location");
  assert.deepEqual(locations, [{path: "scene.location", value: "Shanghai", source: "user_fact"}]);
  assert.equal(plan.resolved_facts.some((fact) => fact.value === "Beijing"), false);
  assert.equal(plan.analysis_unknowns.some((item) => item.path === "scene.date"), false);
  assert.equal(plan.analysis_unknowns.some((item) => item.path === "scene.weather"), true);
  assert.equal(plan.decisions.typography.language, "zh-CN");
  assert.equal(plan.diagnostics.some((item) => item.code === "W_USER_FACT_OVERRIDES_ANALYSIS"), true);
  assert.equal(plan.resolved_facts.find((fact) => fact.path === "typography.content.title").source, "user_content");

  const contentInsideFacts = deepClone(preserveRequest);
  contentInsideFacts.user_facts.copy = {title: "wrong layer"};
  assert.equal(schemaAccepts(ajv, SCHEMA_IDS.compileRequest, contentInsideFacts), false);

  const factsInsideContent = deepClone(preserveRequest);
  factsInsideContent.user_content.location = "wrong layer";
  assert.equal(schemaAccepts(ajv, SCHEMA_IDS.compileRequest, factsInsideContent), false);
});

test("Rule ids and read/write paths are stable and whitelisted", () => {
  const duplicate = deepClone(preserveSkill);
  duplicate.rules[1].rule_id = duplicate.rules[0].rule_id;
  expectSpecError(() => validateSkillSemantics(duplicate), "E_DUPLICATE_RULE_ID");

  const unknownDefault = deepClone(preserveSkill);
  unknownDefault.rules[0].when = {path: "defaults.missing.value", op: "exists"};
  expectSpecError(() => validateSkillSemantics(unknownDefault), "E_RULE_UNKNOWN_READ_PATH");

  const illegalRead = deepClone(preserveSkill);
  illegalRead.rules[0].when = {path: "user_facts.favorite_color", op: "exists"};
  expectSpecError(() => validateSkillSemantics(illegalRead), "E_RULE_UNKNOWN_READ_PATH");

  const illegalWrite = deepClone(preserveSkill);
  illegalWrite.rules[0].then = [{op: "set", path: "plan.provider.prompt", value: "unsafe"}];
  expectSpecError(() => validateSkillSemantics(illegalWrite), "E_RULE_ILLEGAL_WRITE_PATH");

  const controlOverride = deepClone(preserveSkill);
  controlOverride.rules[0].then = [{op: "set", path: "plan.output.aspect_ratio", value: "1:1"}];
  expectSpecError(() => validateSkillSemantics(controlOverride), "E_RULE_WRITES_AUTHORITATIVE_PATH");
});

test("Structured targets produce deterministic preservation/transformation conflicts", () => {
  const conflicting = deepClone(preserveSkill);
  conflicting.transformation.push({
    constraint_id: "replace-person-identity",
    target: {domain: "subject", path: "subject.identity", subject_ref: "primary-person"},
    mode: "required",
    description: "Natural-language wording does not control conflict detection."
  });
  expectSpecError(() => validateSkillSemantics(conflicting), "E_CONSTRAINT_CONFLICT");
});

test("control is not a Core family and remains experiment metadata only", () => {
  const invalid = deepClone(preserveSkill);
  invalid.family = "control";
  assert.equal(schemaAccepts(ajv, SCHEMA_IDS.skill, invalid), false);

  const baseline = deepClone(preserveSkill);
  baseline.experiment_metadata.role = "control";
  assert.equal(schemaAccepts(ajv, SCHEMA_IDS.skill, baseline), true);
});

test("Applicability supports applicable, conditional, and blocking results", () => {
  assert.equal(evaluateApplicability(preserveRequest).status, "applicable");

  const conditional = deepClone(preserveRequest);
  conditional.photo_analysis.observations.find((item) => item.path === "composition.negative_space_ratio").value = 0.1;
  const conditionalResult = evaluateApplicability(conditional);
  assert.equal(conditionalResult.status, "conditional");
  assert.equal(conditionalResult.score, 0.7);
  const conditionalPlan = compileCreativePlan(conditional);
  assert.equal(conditionalPlan.diagnostics.some((item) => item.code === "W_CONDITIONAL_APPLICABILITY"), true);

  const blocked = deepClone(preserveRequest);
  blocked.photo_analysis.inferences.find((item) => item.path === "scene.type").value = "portrait";
  const blockedResult = evaluateApplicability(blocked);
  assert.equal(blockedResult.status, "not_applicable");
  expectSpecError(() => compileCreativePlan(blocked), "E_NOT_APPLICABLE");
});

test("Applicability evaluates analysis inputs as matched, unmatched, or unknown", () => {
  const preferredUnknown = deepClone(preserveRequest);
  preferredUnknown.photo_analysis.observations = preferredUnknown.photo_analysis.observations.filter(
    (item) => item.path !== "composition.negative_space_ratio"
  );
  preferredUnknown.photo_analysis.inferences = preferredUnknown.photo_analysis.inferences.filter(
    (item) => item.path !== "mood.tone"
  );
  preferredUnknown.photo_analysis.unknowns.push({
    path: "composition.negative_space_ratio",
    reason: "The frame boundary is ambiguous."
  });
  const conditional = evaluateApplicability(preferredUnknown);
  assert.equal(conditional.status, "conditional");
  assert.equal(conditional.score, 1);
  assert.deepEqual(conditional.unknown_requirements, ["usable-negative-space"]);
  assert.equal(
    conditional.requirement_results.find((item) => item.requirement_id === "usable-negative-space").state,
    "unknown"
  );

  const ignoredUnknown = deepClone(preferredUnknown);
  ignoredUnknown.skill.applicability.requirements.find(
    (item) => item.requirement_id === "usable-negative-space"
  ).on_unknown = "ignore";
  assert.equal(evaluateApplicability(ignoredUnknown).status, "applicable");

  const requiredUnknown = deepClone(preserveRequest);
  requiredUnknown.photo_analysis.inferences = requiredUnknown.photo_analysis.inferences.filter(
    (item) => item.path !== "scene.type"
  );
  requiredUnknown.photo_analysis.unknowns.push({path: "scene.type", reason: "Scene type cannot be classified."});
  const blocked = evaluateApplicability(requiredUnknown);
  assert.equal(blocked.status, "not_applicable");
  assert.deepEqual(blocked.unknown_requirements, ["travel-scene"]);
});

test("PhotoAnalysis cannot represent the same semantic path as known and unknown", () => {
  const invalid = deepClone(reimagineRequest);
  invalid.photo_analysis.unknowns.push({path: "scene.type", reason: "Contradicts the inference."});
  expectSpecError(() => validateCompileRequestSemantics(invalid), "E_ANALYSIS_EPISTEMIC_CONFLICT");
});

test("AnalysisPolicy, not Core constants, controls confidence thresholds", () => {
  const lowInference = deepClone(reimagineRequest);
  lowInference.photo_analysis.inferences[0].confidence = 0.59;
  expectSpecError(() => validateCompileRequestSemantics(lowInference), "E_INFERENCE_CONFIDENCE_TOO_LOW");

  const lowObservation = deepClone(reimagineRequest);
  lowObservation.photo_analysis.observations[0].confidence = 0.49;
  expectSpecError(() => validateCompileRequestSemantics(lowObservation), "E_OBSERVATION_CONFIDENCE_TOO_LOW");

  const permissiveProfile = deepClone(lowInference);
  permissiveProfile.analysis_policy = {
    profile_id: "permissive-test-profile",
    minimum_confidence: {observation: 0.4, inference: 0.55}
  };
  assert.equal(validateCompileRequestSemantics(permissiveProfile), true);
});

test("Inference basis forms a directed acyclic graph", () => {
  const cyclic = deepClone(preserveRequest);
  cyclic.photo_analysis.inferences.find((item) => item.path === "scene.type").basis = ["mood.tone"];
  cyclic.photo_analysis.inferences.find((item) => item.path === "mood.tone").basis = ["scene.type"];
  expectSpecError(() => validateCompileRequestSemantics(cyclic), "E_INFERENCE_CYCLE");
});

test("Renderer Adapter owns provider prompt compilation and matches snapshots", () => {
  const preserveRender = renderWithOpenAIGptImage2(compileCreativePlan(preserveRequest));
  const reimagineRender = renderWithOpenAIGptImage2(compileCreativePlan(reimagineRequest));
  assert.deepEqual(preserveRender, preserveRendererSnapshot);
  assert.deepEqual(reimagineRender, reimagineRendererSnapshot);
  assert.match(preserveRender.prompt, /TYPOGRAPHY/);
  assert.doesNotMatch(reimagineRender.prompt, /TYPOGRAPHY/);
  assert.equal(Object.hasOwn(preserveRender, "input_fidelity"), false);

  const withForbiddenParameter = {...preserveRender, input_fidelity: "high"};
  assert.equal(schemaAccepts(ajv, SCHEMA_IDS.rendererRequest, withForbiddenParameter), false);
});

test("Typography reserves model, postprocess, and none rendering strategies", () => {
  const modelRender = renderWithOpenAIGptImage2(compileCreativePlan(preserveRequest));
  assert.equal(modelRender.typography_strategy, "model");
  assert.match(modelRender.prompt, /TYPOGRAPHY\n/);

  const postprocessRequest = deepClone(preserveRequest);
  postprocessRequest.user_controls.typography_rendering = "postprocess";
  const postprocessRender = renderWithOpenAIGptImage2(compileCreativePlan(postprocessRequest));
  assert.equal(postprocessRender.typography_strategy, "postprocess");
  assert.match(postprocessRender.prompt, /TYPOGRAPHY RESERVED FOR POSTPROCESS/);
  assert.doesNotMatch(postprocessRender.prompt, /- title:/);
  assert.deepEqual(postprocessRender.postprocess, {
    language: "zh-CN",
    title: "夏日散步",
    subtitle: "Shanghai · 2026"
  });

  const noneRender = renderWithOpenAIGptImage2(compileCreativePlan(reimagineRequest));
  assert.equal(noneRender.typography_strategy, "none");
  assert.doesNotMatch(noneRender.prompt, /TYPOGRAPHY/);

  const inconsistent = deepClone(preserveRequest);
  inconsistent.user_controls.text_mode = "none";
  expectSpecError(() => validateCompileRequestSemantics(inconsistent), "E_TYPOGRAPHY_CONTROL_CONFLICT");
});

test("Runtime Safety has final authority over Skill and UserControls", () => {
  const safetyOverride = deepClone(preserveRequest);
  safetyOverride.runtime_safety.overrides.push({
    path: "plan.output.aspect_ratio",
    value: "1:1",
    reason: "Runtime policy constrains this execution to a square canvas."
  });
  const plan = compileCreativePlan(safetyOverride);
  assert.equal(plan.decisions.output.aspect_ratio, "1:1");
  assert.deepEqual(plan.safety_decision.applied_overrides, ["plan.output.aspect_ratio"]);
  assert.equal(plan.diagnostics.some((item) => item.code === "W_RUNTIME_SAFETY_OVERRIDE"), true);

  const blocked = deepClone(preserveRequest);
  blocked.runtime_safety.blocked = true;
  blocked.runtime_safety.reasons = ["Input violates the active runtime policy."];
  expectSpecError(() => evaluateApplicability(blocked), "E_RUNTIME_SAFETY_BLOCKED");
  expectSpecError(() => compileCreativePlan(blocked), "E_RUNTIME_SAFETY_BLOCKED");
});

test("QualityEvaluation and ProductBehaviorEvent are separate contracts", () => {
  const qualityInput = {
    output_id: "output-001",
    skill_id: "travel-editorial",
    skill_version: "0.1.0",
    metrics: {
      identity_preservation: {score: 5},
      scene_fidelity: {score: 4},
      composition: {score: 4.5},
      style_consistency: {score: 4},
      text_accuracy: {not_applicable_reason: "Typography is disabled for this output."},
      artifact_control: {score: 4},
      aesthetic_quality: {score: 4.5}
    },
    hard_failures: []
  };
  const quality = calculateQualityEvaluation(qualityInput, preserveSkill.evaluation);
  const behavior = {
    event_id: "event-001",
    output_id: "output-001",
    event_type: "save",
    occurred_at: "2026-08-19T12:00:00+08:00"
  };

  assert.equal(schemaAccepts(ajv, SCHEMA_IDS.qualityEvaluation, quality), true);
  const normalizedTotal = Object.values(quality.normalized_weights).reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(normalizedTotal - 1) < 1e-8);
  assert.equal(Object.hasOwn(quality.normalized_weights, "text_accuracy"), false);
  assert.equal(quality.weighted_score, 4.361111);
  assert.equal(schemaAccepts(ajv, SCHEMA_IDS.productBehaviorEvent, behavior), true);
  assert.equal(schemaAccepts(ajv, SCHEMA_IDS.qualityEvaluation, {...quality, saved: true}), false);
  assert.equal(schemaAccepts(ajv, SCHEMA_IDS.productBehaviorEvent, {...behavior, aesthetic_quality: 5}), false);

  const allNA = deepClone(qualityInput);
  for (const name of Object.keys(allNA.metrics)) {
    allNA.metrics[name] = {not_applicable_reason: "No scorable evidence."};
  }
  expectSpecError(() => calculateQualityEvaluation(allNA, preserveSkill.evaluation), "E_EVALUATION_NO_SCORABLE_WEIGHT");

  const hardFailed = calculateQualityEvaluation(
    {...qualityInput, hard_failures: ["identity changed"]},
    preserveSkill.evaluation
  );
  assert.equal(hardFailed.passed, false);
});
