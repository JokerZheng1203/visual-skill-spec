import {compileCreativePlan, validateCompileRequestSemantics} from "./compiler.mjs";
import {
  OPENAI_GPT_IMAGE_2_ADAPTER_ID,
  openAIGptImage2Adapter
} from "./adapters/openai-gpt-image-2.mjs";
import {assertSchema, createSchemaValidator, SCHEMA_IDS} from "./schema-validator.mjs";

export class ReferenceRuntimeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ReferenceRuntimeError";
    this.code = code;
    this.details = structuredClone(details);
  }
}

function normalizeAdapters(adapters) {
  const registry = new Map();
  for (const adapter of adapters) {
    if (
      adapter === null
      || typeof adapter !== "object"
      || typeof adapter.adapter_id !== "string"
      || adapter.adapter_id.length === 0
      || typeof adapter.render !== "function"
    ) {
      throw new ReferenceRuntimeError(
        "E_ADAPTER_INVALID",
        "Every Renderer Adapter must expose a non-empty adapter_id and a render function."
      );
    }
    if (registry.has(adapter.adapter_id)) {
      throw new ReferenceRuntimeError(
        "E_ADAPTER_DUPLICATE",
        `Duplicate Renderer Adapter: ${adapter.adapter_id}`,
        {adapter_id: adapter.adapter_id}
      );
    }
    registry.set(adapter.adapter_id, adapter);
  }
  return registry;
}

export class VisualSkillReferenceRuntime {
  #validator;
  #adapters;

  constructor({validator, adapters = [openAIGptImage2Adapter]}) {
    if (!validator || typeof validator.getSchema !== "function") {
      throw new ReferenceRuntimeError(
        "E_VALIDATOR_INVALID",
        "Reference Runtime requires an initialized JSON Schema validator."
      );
    }
    this.#validator = validator;
    this.#adapters = normalizeAdapters(adapters);
  }

  get adapter_ids() {
    return [...this.#adapters.keys()];
  }

  compile(request) {
    assertSchema(this.#validator, SCHEMA_IDS.compileRequest, request, "compile request");
    validateCompileRequestSemantics(request);

    const creativePlan = compileCreativePlan(request);
    assertSchema(
      this.#validator,
      SCHEMA_IDS.applicability,
      creativePlan.applicability,
      "applicability result"
    );
    assertSchema(this.#validator, SCHEMA_IDS.creativePlan, creativePlan, "creative plan");
    return creativePlan;
  }

  render(creativePlan, {adapter_id: adapterId = OPENAI_GPT_IMAGE_2_ADAPTER_ID} = {}) {
    assertSchema(this.#validator, SCHEMA_IDS.creativePlan, creativePlan, "creative plan");

    const adapter = this.#adapters.get(adapterId);
    if (!adapter) {
      throw new ReferenceRuntimeError(
        "E_ADAPTER_NOT_FOUND",
        `Renderer Adapter is not registered: ${adapterId}`,
        {adapter_id: adapterId, available_adapter_ids: this.adapter_ids}
      );
    }

    const rendererRequest = adapter.render(structuredClone(creativePlan));
    if (rendererRequest.adapter_id !== adapterId) {
      throw new ReferenceRuntimeError(
        "E_ADAPTER_ID_MISMATCH",
        `Renderer Adapter ${adapterId} returned ${rendererRequest.adapter_id}.`,
        {expected: adapterId, actual: rendererRequest.adapter_id}
      );
    }
    assertSchema(this.#validator, SCHEMA_IDS.rendererRequest, rendererRequest, "renderer request");
    return rendererRequest;
  }

  execute(request, options = {}) {
    const creativePlan = this.compile(request);
    const rendererRequest = this.render(creativePlan, options);
    return {
      applicability: structuredClone(creativePlan.applicability),
      creative_plan: creativePlan,
      renderer_request: rendererRequest
    };
  }
}

export async function createReferenceRuntime(options = {}) {
  const validator = options.validator ?? await createSchemaValidator();
  return new VisualSkillReferenceRuntime({...options, validator});
}
