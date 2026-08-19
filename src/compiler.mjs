const USER_FACT_PATHS = new Set([
  "user_facts.location",
  "user_facts.date",
  "user_facts.people_relationships"
]);

const USER_CONTENT_PATHS = new Set([
  "user_content.language",
  "user_content.copy.title",
  "user_content.copy.subtitle",
  "user_content.copy.caption"
]);

const CONTROL_PATHS = new Set([
  "controls.creative_intensity",
  "controls.text_mode",
  "controls.typography_rendering",
  "controls.aspect_ratio"
]);

const PLAN_WRITE_PATHS = new Set([
  "plan.objective",
  "plan.composition.layout",
  "plan.composition.negative_space_strategy",
  "plan.composition.subject_scale",
  "plan.visual.color_strategy",
  "plan.visual.accent_color",
  "plan.visual.texture",
  "plan.visual.lighting",
  "plan.visual.mood",
  "plan.visual.graphic_marks",
  "plan.typography.mode",
  "plan.typography.rendering",
  "plan.typography.language",
  "plan.output.aspect_ratio",
  "plan.output.quality_tier",
  "plan.output.format",
  "plan.output.background",
  "plan.notes"
]);

const AUTHORITATIVE_PLAN_PATHS = new Set([
  "plan.typography.mode",
  "plan.typography.rendering",
  "plan.typography.language",
  "plan.output.aspect_ratio"
]);

const APPEND_PATHS = new Set([
  "plan.visual.graphic_marks",
  "plan.notes"
]);

const USER_FACT_SEMANTIC_PATHS = new Map([
  ["location", "scene.location"],
  ["date", "scene.date"],
  ["people_relationships", "subject.relationships"]
]);

const USER_CONTENT_SEMANTIC_PATHS = new Map([
  ["language", "typography.language"],
  ["copy.title", "typography.content.title"],
  ["copy.subtitle", "typography.content.subtitle"],
  ["copy.caption", "typography.content.caption"]
]);

export class SpecError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "SpecError";
    this.code = code;
    this.details = details;
  }
}

function clone(value) {
  return structuredClone(value);
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasOwnPath(object, path) {
  let cursor = object;
  for (const segment of path.split(".")) {
    if (cursor === null || typeof cursor !== "object" || !Object.hasOwn(cursor, segment)) {
      return false;
    }
    cursor = cursor[segment];
  }
  return true;
}

function getOwnPath(object, path) {
  let cursor = object;
  for (const segment of path.split(".")) {
    if (cursor === null || typeof cursor !== "object" || !Object.hasOwn(cursor, segment)) {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function setOwnPath(object, path, value) {
  const segments = path.split(".");
  let cursor = object;
  for (const segment of segments.slice(0, -1)) {
    if (!Object.hasOwn(cursor, segment) || cursor[segment] === null || typeof cursor[segment] !== "object") {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  }
  cursor[segments.at(-1)] = clone(value);
}

function appendOwnPath(object, path, value) {
  const current = getOwnPath(object, path);
  if (!Array.isArray(current)) {
    throw new SpecError("E_RULE_APPEND_TARGET", `Append target is not an array: ${path}`, {path});
  }
  const additions = Array.isArray(value) ? value : [value];
  for (const item of additions) {
    if (!current.some((existing) => sameValue(existing, item))) {
      current.push(clone(item));
    }
  }
}

function evidenceIndex(photoAnalysis, kind) {
  return new Map(photoAnalysis[kind].map((entry) => [entry.path, entry]));
}

function knownAnalysisPaths(skill, kind) {
  if (kind === "observations") return new Set(skill.analysis_requirements.observation_paths);
  if (kind === "inferences") return new Set(skill.analysis_requirements.inference_paths);
  return new Set([
    ...skill.analysis_requirements.observation_paths,
    ...skill.analysis_requirements.inference_paths
  ]);
}

function validateReadPath(skill, path) {
  if (USER_FACT_PATHS.has(path) || USER_CONTENT_PATHS.has(path) || CONTROL_PATHS.has(path)) return;

  if (path.startsWith("defaults.")) {
    const defaultPath = path.slice("defaults.".length);
    if (hasOwnPath(skill.defaults, defaultPath)) return;
    throw new SpecError("E_RULE_UNKNOWN_READ_PATH", `Unknown defaults path: ${path}`, {path});
  }

  const analysisMatch = path.match(/^analysis\.(observations|inferences|unknowns)\.(.+)$/);
  if (analysisMatch) {
    const [, kind, semanticPath] = analysisMatch;
    if (knownAnalysisPaths(skill, kind).has(semanticPath)) return;
  }

  throw new SpecError("E_RULE_UNKNOWN_READ_PATH", `Unknown or undeclared read path: ${path}`, {path});
}

function validateWriteAction(action) {
  if (!PLAN_WRITE_PATHS.has(action.path)) {
    throw new SpecError("E_RULE_ILLEGAL_WRITE_PATH", `Rule cannot write to ${action.path}`, {path: action.path});
  }
  if (action.op === "append" && !APPEND_PATHS.has(action.path)) {
    throw new SpecError("E_RULE_APPEND_TARGET", `Append is not allowed for ${action.path}`, {path: action.path});
  }
  if (AUTHORITATIVE_PLAN_PATHS.has(action.path)) {
    throw new SpecError(
      "E_RULE_WRITES_AUTHORITATIVE_PATH",
      `Skill Rule cannot write to user-authoritative path ${action.path}`,
      {path: action.path}
    );
  }
}

function visitCondition(condition, visit) {
  if (Object.hasOwn(condition, "path")) {
    visit(condition.path);
    return;
  }
  if (Object.hasOwn(condition, "all")) {
    condition.all.forEach((child) => visitCondition(child, visit));
    return;
  }
  if (Object.hasOwn(condition, "any")) {
    condition.any.forEach((child) => visitCondition(child, visit));
    return;
  }
  visitCondition(condition.not, visit);
}

function assertUnique(items, key, code) {
  const seen = new Set();
  for (const item of items) {
    const value = item[key];
    if (seen.has(value)) {
      throw new SpecError(code, `Duplicate ${key}: ${value}`, {[key]: value});
    }
    seen.add(value);
  }
}

function targetKey(target) {
  return `${target.path}#${target.subject_ref ?? ""}`;
}

export function validateSkillSemantics(skill) {
  assertUnique(skill.rules, "rule_id", "E_DUPLICATE_RULE_ID");
  assertUnique(skill.applicability.requirements, "requirement_id", "E_DUPLICATE_REQUIREMENT_ID");
  assertUnique([...skill.preservation, ...skill.transformation], "constraint_id", "E_DUPLICATE_CONSTRAINT_ID");

  if (skill.applicability.thresholds.conditional_min > skill.applicability.thresholds.applicable_min) {
    throw new SpecError("E_APPLICABILITY_THRESHOLDS", "conditional_min cannot exceed applicable_min");
  }

  if (skill.provenance.origin === "licensed" && skill.provenance.source_refs.length === 0) {
    throw new SpecError("E_LICENSE_SOURCE_REQUIRED", "Licensed skills require at least one source reference");
  }

  for (const target of [
    ...skill.preservation.map((item) => item.target),
    ...skill.transformation.map((item) => item.target),
    ...skill.evaluation.hard_fail_targets
  ]) {
    if (!target.path.startsWith(`${target.domain}.`)) {
      throw new SpecError("E_TARGET_DOMAIN_MISMATCH", `Target ${target.path} does not belong to ${target.domain}`, {target});
    }
  }

  const hardPreservation = new Map(
    skill.preservation
      .filter((item) => item.strength === "hard")
      .map((item) => [targetKey(item.target), item])
  );
  for (const transformation of skill.transformation.filter((item) => item.mode === "required")) {
    const preservation = hardPreservation.get(targetKey(transformation.target));
    if (preservation) {
      throw new SpecError(
        "E_CONSTRAINT_CONFLICT",
        `Required transformation conflicts with hard preservation at ${transformation.target.path}`,
        {preservation_id: preservation.constraint_id, transformation_id: transformation.constraint_id}
      );
    }
  }

  const weightTotal = Object.values(skill.evaluation.quality_weights).reduce((sum, weight) => sum + weight, 0);
  if (Math.abs(weightTotal - 1) > 1e-9) {
    throw new SpecError("E_EVALUATION_WEIGHT_TOTAL", `Quality weights must sum to 1; received ${weightTotal}`);
  }

  for (const requirement of skill.applicability.requirements) {
    validateReadPath(skill, requirement.path);
  }
  for (const rule of skill.rules) {
    visitCondition(rule.when, (path) => validateReadPath(skill, path));
    rule.then.forEach(validateWriteAction);
  }

  return true;
}

export function validateCompileRequestSemantics(request) {
  validateSkillSemantics(request.skill);

  const knownEvidence = new Set();
  for (const kind of ["observations", "inferences"]) {
    for (const item of request.photo_analysis[kind]) {
      const minimumConfidence = kind === "observations"
        ? request.analysis_policy.minimum_confidence.observation
        : request.analysis_policy.minimum_confidence.inference;
      if (item.confidence < minimumConfidence) {
        throw new SpecError(
          kind === "observations" ? "E_OBSERVATION_CONFIDENCE_TOO_LOW" : "E_INFERENCE_CONFIDENCE_TOO_LOW",
          `${kind.slice(0, -1)} confidence for ${item.path} is below ${minimumConfidence}; represent it as unknown instead.`,
          {path: item.path, confidence: item.confidence, minimum_confidence: minimumConfidence}
        );
      }
      if (knownEvidence.has(item.path)) {
        throw new SpecError("E_DUPLICATE_ANALYSIS_PATH", `Analysis path is represented more than once: ${item.path}`, {path: item.path});
      }
      knownEvidence.add(item.path);
    }
  }

  const unknownPaths = new Set();
  for (const item of request.photo_analysis.unknowns) {
    if (unknownPaths.has(item.path) || knownEvidence.has(item.path)) {
      throw new SpecError("E_ANALYSIS_EPISTEMIC_CONFLICT", `Path cannot be both known and unknown: ${item.path}`, {path: item.path});
    }
    unknownPaths.add(item.path);
  }

  for (const inference of request.photo_analysis.inferences) {
    for (const basis of inference.basis) {
      if (!knownEvidence.has(basis)) {
        throw new SpecError("E_INFERENCE_BASIS_UNKNOWN", `Inference basis is not present in analysis: ${basis}`, {path: inference.path, basis});
      }
    }
  }

  const inferencePaths = new Set(request.photo_analysis.inferences.map((item) => item.path));
  const graph = new Map(
    request.photo_analysis.inferences.map((item) => [
      item.path,
      item.basis.filter((basis) => inferencePaths.has(basis))
    ])
  );
  const visiting = new Set();
  const visited = new Set();
  function visit(path) {
    if (visiting.has(path)) {
      throw new SpecError("E_INFERENCE_CYCLE", `Inference dependency cycle detected at ${path}`, {path});
    }
    if (visited.has(path)) return;
    visiting.add(path);
    for (const dependency of graph.get(path) ?? []) visit(dependency);
    visiting.delete(path);
    visited.add(path);
  }
  for (const path of graph.keys()) visit(path);

  const {text_mode: textMode, typography_rendering: rendering} = request.user_controls;
  if ((textMode === "none") !== (rendering === "none")) {
    throw new SpecError(
      "E_TYPOGRAPHY_CONTROL_CONFLICT",
      "text_mode and typography_rendering must both be none, or both request typography."
    );
  }

  if (request.runtime_safety.blocked && request.runtime_safety.reasons.length === 0) {
    throw new SpecError("E_RUNTIME_SAFETY_REASON_REQUIRED", "A blocking Runtime Safety decision requires at least one reason.");
  }
  for (const override of request.runtime_safety.overrides) {
    if (!PLAN_WRITE_PATHS.has(override.path)) {
      throw new SpecError("E_RUNTIME_SAFETY_ILLEGAL_PATH", `Runtime Safety cannot write to ${override.path}`, {path: override.path});
    }
  }

  return true;
}

function getInputValue(request, path) {
  if (path.startsWith("user_facts.")) {
    return getOwnPath(request.user_facts, path.slice("user_facts.".length));
  }
  if (path.startsWith("user_content.")) {
    return getOwnPath(request.user_content, path.slice("user_content.".length));
  }
  if (path.startsWith("controls.")) {
    return getOwnPath(request.user_controls, path.slice("controls.".length));
  }
  if (path.startsWith("defaults.")) {
    return getOwnPath(request.skill.defaults, path.slice("defaults.".length));
  }

  const match = path.match(/^analysis\.(observations|inferences|unknowns)\.(.+)$/);
  if (!match) return undefined;
  const [, kind, semanticPath] = match;
  if (kind === "unknowns") {
    return request.photo_analysis.unknowns.some((entry) => entry.path === semanticPath);
  }
  return evidenceIndex(request.photo_analysis, kind).get(semanticPath)?.value;
}

function compare(actual, op, expected) {
  switch (op) {
    case "exists": return actual !== undefined;
    case "eq": return sameValue(actual, expected);
    case "neq": return !sameValue(actual, expected);
    case "gt": return actual > expected;
    case "gte": return actual >= expected;
    case "lt": return actual < expected;
    case "lte": return actual <= expected;
    case "in": return Array.isArray(expected) && expected.some((item) => sameValue(item, actual));
    case "not_in": return Array.isArray(expected) && !expected.some((item) => sameValue(item, actual));
    default: throw new SpecError("E_RULE_OPERATOR", `Unsupported operator: ${op}`, {op});
  }
}

function evaluateCondition(request, condition) {
  if (Object.hasOwn(condition, "all")) return condition.all.every((child) => evaluateCondition(request, child));
  if (Object.hasOwn(condition, "any")) return condition.any.some((child) => evaluateCondition(request, child));
  if (Object.hasOwn(condition, "not")) return !evaluateCondition(request, condition.not);
  return compare(getInputValue(request, condition.path), condition.op, condition.value);
}

function pathIsDeclaredUnknown(request, readPath) {
  const match = readPath.match(/^analysis\.(?:observations|inferences)\.(.+)$/);
  return Boolean(match && request.photo_analysis.unknowns.some((item) => item.path === match[1]));
}

function assertRuntimeSafetyAllowsCompilation(request) {
  if (request.runtime_safety.blocked) {
    throw new SpecError("E_RUNTIME_SAFETY_BLOCKED", "Runtime Safety blocked compilation", {
      policy_id: request.runtime_safety.policy_id,
      reasons: request.runtime_safety.reasons
    });
  }
}

function evaluateApplicabilityValidated(request) {
  const requirements = request.skill.applicability.requirements;
  if (requirements.length === 0) {
    return {
      status: "applicable",
      score: 1,
      reasons: ["No applicability restrictions."],
      requirement_results: [],
      unmet_requirements: [],
      unknown_requirements: [],
      warnings: []
    };
  }

  let matchedWeight = 0;
  let totalWeight = 0;
  let requiredFailure = false;
  let unknownBlock = false;
  let forceConditional = false;
  const reasons = [];
  const requirementResults = [];
  const unmet = [];
  const unknown = [];
  const warnings = [];

  for (const requirement of requirements) {
    const actual = getInputValue(request, requirement.path);
    const isUnknown = actual === undefined || pathIsDeclaredUnknown(request, requirement.path);
    if (isUnknown) {
      requirementResults.push({requirement_id: requirement.requirement_id, state: "unknown"});
      unknown.push(requirement.requirement_id);
      warnings.push(`Unknown requirement ${requirement.requirement_id}: ${requirement.reason}`);
      if (requirement.on_unknown === "not_applicable") {
        totalWeight += requirement.weight;
        unknownBlock = true;
      } else if (requirement.on_unknown === "conditional") {
        forceConditional = true;
      }
      continue;
    }

    totalWeight += requirement.weight;
    const matched = compare(actual, requirement.op, requirement.value);
    requirementResults.push({requirement_id: requirement.requirement_id, state: matched ? "matched" : "unmatched"});
    if (matched) {
      matchedWeight += requirement.weight;
      reasons.push(requirement.reason);
      continue;
    }

    unmet.push(requirement.requirement_id);
    if (requirement.severity === "required") requiredFailure = true;
    if (requirement.severity === "preferred") {
      warnings.push(`Unmet ${requirement.severity} requirement ${requirement.requirement_id}: ${requirement.reason}`);
    }
  }

  const score = totalWeight === 0 ? 1 : Number((matchedWeight / totalWeight).toFixed(6));
  const {applicable_min: applicableMin, conditional_min: conditionalMin} = request.skill.applicability.thresholds;
  let status;
  if (requiredFailure || unknownBlock || score < conditionalMin) status = "not_applicable";
  else if (forceConditional || score < applicableMin) status = "conditional";
  else status = "applicable";

  return {
    status,
    score,
    reasons,
    requirement_results: requirementResults,
    unmet_requirements: unmet,
    unknown_requirements: unknown,
    warnings
  };
}

export function evaluateApplicability(request) {
  validateCompileRequestSemantics(request);
  assertRuntimeSafetyAllowsCompilation(request);
  return evaluateApplicabilityValidated(request);
}

function userFactEntries(userFacts) {
  const entries = [];
  for (const [factPath, semanticPath] of USER_FACT_SEMANTIC_PATHS) {
    const value = getOwnPath(userFacts, factPath);
    if (value !== undefined) entries.push({path: semanticPath, value: clone(value), source: "user_fact"});
  }
  return entries;
}

function userContentEntries(userContent) {
  const entries = [];
  for (const [contentPath, semanticPath] of USER_CONTENT_SEMANTIC_PATHS) {
    const value = getOwnPath(userContent, contentPath);
    if (value !== undefined) entries.push({path: semanticPath, value: clone(value), source: "user_content"});
  }
  return entries;
}

function resolveFacts(request, diagnostics) {
  const userEntries = userFactEntries(request.user_facts);
  const contentEntries = userContentEntries(request.user_content);
  const userByPath = new Map([...userEntries, ...contentEntries].map((entry) => [entry.path, entry]));
  const resolved = [...userEntries, ...contentEntries];

  for (const kind of ["observations", "inferences"]) {
    for (const item of request.photo_analysis[kind]) {
      const userFact = userByPath.get(item.path);
      if (userFact) {
        if (!sameValue(userFact.value, item.value)) {
          const isContent = userFact.source === "user_content";
          diagnostics.push({
            code: isContent ? "W_USER_CONTENT_OVERRIDES_ANALYSIS" : "W_USER_FACT_OVERRIDES_ANALYSIS",
            severity: "warning",
            message: `${isContent ? "User content" : "User fact"} overrides ${kind.slice(0, -1)} at ${item.path}.`,
            path: item.path
          });
        }
        continue;
      }
      resolved.push({
        path: item.path,
        value: clone(item.value),
        source: kind === "observations" ? "observation" : "inference",
        confidence: item.confidence
      });
    }
  }

  return {resolved, userByPath};
}

function applyUserContent(decisions, userContent) {
  if (userContent.language !== undefined) decisions.typography.language = userContent.language;
  if (userContent.copy.title !== undefined) decisions.typography.title = userContent.copy.title;
  if (userContent.copy.subtitle !== undefined) decisions.typography.subtitle = userContent.copy.subtitle;
}

function applyUserControls(decisions, request) {
  decisions.typography.mode = request.user_controls.text_mode;
  decisions.typography.rendering = request.user_controls.typography_rendering;
  decisions.output.aspect_ratio = request.user_controls.aspect_ratio;
  if (decisions.typography.mode === "none") {
    delete decisions.typography.title;
    delete decisions.typography.subtitle;
  }
}

function applyRuntimeSafety(decisions, runtimeSafety, diagnostics) {
  const appliedOverrides = [];
  for (const override of runtimeSafety.overrides) {
    const decisionPath = override.path.slice("plan.".length);
    const previous = getOwnPath(decisions, decisionPath);
    setOwnPath(decisions, decisionPath, override.value);
    appliedOverrides.push(override.path);
    diagnostics.push({
      code: "W_RUNTIME_SAFETY_OVERRIDE",
      severity: "warning",
      message: `Runtime Safety overrides ${override.path}: ${override.reason}`,
      path: override.path
    });
    if (sameValue(previous, override.value)) diagnostics.at(-1).severity = "info";
  }
  return {policy_id: runtimeSafety.policy_id, applied_overrides: appliedOverrides, reasons: clone(runtimeSafety.reasons)};
}

export function compileCreativePlan(request) {
  validateCompileRequestSemantics(request);
  assertRuntimeSafetyAllowsCompilation(request);
  const applicability = evaluateApplicabilityValidated(request);
  if (applicability.status === "not_applicable") {
    throw new SpecError("E_NOT_APPLICABLE", "Skill is not applicable to this input", {applicability});
  }

  const diagnostics = [];
  if (applicability.status === "conditional") {
    diagnostics.push({
      code: "W_CONDITIONAL_APPLICABILITY",
      severity: "warning",
      message: "Skill applicability is conditional; review unmet requirements before rendering."
    });
  }

  const {resolved: resolvedFacts, userByPath} = resolveFacts(request, diagnostics);
  const decisions = clone(request.skill.defaults);

  const ruleTrace = [];
  const orderedRules = request.skill.rules
    .map((rule, index) => ({rule, index}))
    .sort((left, right) => left.rule.priority - right.rule.priority || left.index - right.index);

  for (const {rule} of orderedRules) {
    const matched = evaluateCondition(request, rule.when);
    const writes = [];
    if (matched) {
      for (const action of rule.then) {
        const decisionPath = action.path.slice("plan.".length);
        if (action.op === "set") setOwnPath(decisions, decisionPath, action.value);
        else appendOwnPath(decisions, decisionPath, action.value);
        writes.push(action.path);
      }
    }
    ruleTrace.push({rule_id: rule.rule_id, matched, writes});
  }

  applyUserContent(decisions, request.user_content);
  applyUserControls(decisions, request);
  const safetyDecision = applyRuntimeSafety(decisions, request.runtime_safety, diagnostics);

  const unresolvedUnknowns = request.photo_analysis.unknowns.filter((item) => !userByPath.has(item.path));

  return {
    spec_version: "0.1.0",
    skill_ref: {id: request.skill.metadata.id, version: request.skill.metadata.version},
    family: request.skill.family,
    applicability,
    resolved_facts: resolvedFacts,
    preservation: clone(request.skill.preservation),
    transformation: clone(request.skill.transformation),
    decisions,
    analysis_unknowns: clone(unresolvedUnknowns),
    diagnostics,
    rule_trace: ruleTrace,
    safety_decision: safetyDecision,
    renderer_requirements: clone(request.skill.renderer_requirements),
    evaluation_policy: clone(request.skill.evaluation)
  };
}

export function calculateQualityEvaluation(input, evaluationPolicy) {
  const scoredMetrics = Object.entries(input.metrics).filter(([, metric]) => Object.hasOwn(metric, "score"));
  const availableWeight = scoredMetrics.reduce(
    (sum, [name]) => sum + evaluationPolicy.quality_weights[name],
    0
  );
  if (availableWeight <= 0) {
    throw new SpecError("E_EVALUATION_NO_SCORABLE_WEIGHT", "N/A metrics leave no positive evaluation weight.");
  }

  const normalizedWeights = {};
  let weightedScore = 0;
  for (const [name, metric] of scoredMetrics) {
    const normalized = evaluationPolicy.quality_weights[name] / availableWeight;
    normalizedWeights[name] = Number(normalized.toFixed(9));
    weightedScore += metric.score * normalized;
  }
  weightedScore = Number(weightedScore.toFixed(6));

  return {
    output_id: input.output_id,
    skill_id: input.skill_id,
    skill_version: input.skill_version,
    metrics: clone(input.metrics),
    normalized_weights: normalizedWeights,
    hard_failures: clone(input.hard_failures),
    weighted_score: weightedScore,
    passed: input.hard_failures.length === 0 && weightedScore >= evaluationPolicy.pass_threshold
  };
}
