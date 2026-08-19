// Backward-compatible facade. New code should import Core and Adapter directly.
export * from "./compiler.mjs";
export {renderWithOpenAIGptImage2} from "./adapters/openai-gpt-image-2.mjs";
