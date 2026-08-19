const ASPECT_RATIO_SIZES = new Map([
  ["1:1", "1024x1024"],
  ["3:2", "1536x1024"],
  ["2:3", "1024x1536"],
  ["4:5", "1024x1280"],
  ["5:4", "1280x1024"],
  ["16:9", "1536x864"],
  ["9:16", "864x1536"]
]);

const QUALITY_MAP = new Map([
  ["draft", "low"],
  ["standard", "medium"],
  ["final", "high"]
]);

export const OPENAI_GPT_IMAGE_2_ADAPTER_ID = "openai.gpt-image-2";

function formatValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function targetInstruction(item, kind) {
  const subject = item.target.subject_ref ? ` for ${item.target.subject_ref}` : "";
  const directive = kind === "preserve" ? item.strength : item.mode;
  const description = item.description ? ` — ${item.description}` : "";
  return `- ${item.target.path}${subject}: ${directive}${description}`;
}

export function renderWithOpenAIGptImage2(creativePlan) {
  const decisions = creativePlan.decisions;
  const sections = [
    "CREATIVE OBJECTIVE",
    decisions.objective,
    "",
    "SOURCE FACTS",
    ...creativePlan.resolved_facts.map((fact) => `- ${fact.path}: ${formatValue(fact.value)} [${fact.source}]`),
    "",
    "PRESERVATION CONSTRAINTS",
    ...creativePlan.preservation.map((item) => targetInstruction(item, "preserve")),
    "",
    "TRANSFORMATION CONSTRAINTS",
    ...creativePlan.transformation.map((item) => targetInstruction(item, "transform")),
    "",
    "COMPOSITION",
    `- layout: ${decisions.composition.layout}`,
    `- negative space: ${decisions.composition.negative_space_strategy}`,
    `- subject scale: ${decisions.composition.subject_scale}`,
    "",
    "VISUAL LANGUAGE",
    `- color strategy: ${decisions.visual.color_strategy}`,
    `- accent color: ${decisions.visual.accent_color}`,
    `- texture: ${decisions.visual.texture}`,
    `- lighting: ${decisions.visual.lighting}`,
    `- mood: ${decisions.visual.mood}`,
    `- graphic marks: ${decisions.visual.graphic_marks.join(", ") || "none"}`
  ];

  if (decisions.typography.rendering === "model") {
    sections.push(
      "",
      "TYPOGRAPHY",
      `- mode: ${decisions.typography.mode}`,
      "- rendering: model",
      `- language: ${decisions.typography.language}`,
      `- title: ${decisions.typography.title ?? "none"}`,
      `- subtitle: ${decisions.typography.subtitle ?? "none"}`
    );
  } else if (decisions.typography.rendering === "postprocess") {
    sections.push(
      "",
      "TYPOGRAPHY RESERVED FOR POSTPROCESS",
      "- do not render any text in the generated image",
      "- preserve a clean area for deterministic text compositing"
    );
  }

  sections.push(
    "",
    "OUTPUT",
    `- aspect ratio: ${decisions.output.aspect_ratio}`,
    `- background: ${decisions.output.background}`
  );

  if (creativePlan.analysis_unknowns.length > 0) {
    sections.push(
      "",
      "UNRESOLVED FACTS",
      ...creativePlan.analysis_unknowns.map((item) => `- ${item.path}: unknown; do not invent (${item.reason})`)
    );
  }

  if (decisions.notes.length > 0) {
    sections.push("", "ADDITIONAL CONSTRAINTS", ...decisions.notes.map((note) => `- ${note}`));
  }

  const outputFormat = decisions.output.format;
  const request = {
    adapter_id: OPENAI_GPT_IMAGE_2_ADAPTER_ID,
    provider: "openai",
    endpoint: creativePlan.renderer_requirements.mode === "image_edit" ? "/v1/images/edits" : "/v1/images/generations",
    model: "gpt-image-2-2026-04-21",
    input_image_role: creativePlan.renderer_requirements.mode === "image_edit" ? "source_photo" : "none",
    prompt: sections.join("\n"),
    typography_strategy: decisions.typography.rendering,
    size: ASPECT_RATIO_SIZES.get(decisions.output.aspect_ratio),
    quality: QUALITY_MAP.get(decisions.output.quality_tier),
    output_format: outputFormat,
    background: decisions.output.background
  };
  if (decisions.typography.rendering === "postprocess") {
    request.postprocess = {
      language: decisions.typography.language,
      title: decisions.typography.title ?? "",
      subtitle: decisions.typography.subtitle ?? ""
    };
  }
  if (outputFormat === "jpeg" || outputFormat === "webp") request.output_compression = 90;
  return request;
}

export const openAIGptImage2Adapter = Object.freeze({
  adapter_id: OPENAI_GPT_IMAGE_2_ADAPTER_ID,
  render: renderWithOpenAIGptImage2
});
