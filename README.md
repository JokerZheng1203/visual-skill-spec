# Visual Skill Spec v0.1

这是一个可执行的 Visual Skill 规范参考包。它把照片二次创作拆成模型无关的 Core Skill 与 provider-specific Renderer Adapter：

```text
VisualSkill + UserFacts + UserContent + PhotoAnalysis
          + AnalysisPolicy + UserControls + RuntimeSafetyPolicy
                              ↓
                       ApplicabilityResult
                              ↓
                         CreativePlan
                              ↓
                       Renderer Adapter
                              ↓
                       Provider Request
```

`CreativePlan` 是 Core 的最终产物，不包含 prompt、provider 或 model。当前参考 Adapter 将 CreativePlan 编译为 GPT Image 2 请求，但不会发起网络调用。

## 快速开始

要求 Node.js 24+。

```bash
npm install
npm run validate
npm test
```

- `npm run validate`：校验 Preserve、Reimagine 与 Baseline 示例、编译 CreativePlan，并校验 Renderer 请求。
- `npm test`：运行 Schema、语义冲突、applicability、确定性和快照测试。

宿主应用通过 Reference Runtime 执行完整但不联网的管线：

```js
import {createReferenceRuntime} from "./src/index.mjs";

const runtime = await createReferenceRuntime();
const result = runtime.execute({skill, ...compileRequest});

result.applicability;
result.creative_plan;
result.renderer_request;
```

`runtime.compile()` 只产出并校验 CreativePlan；`runtime.render()` 只选择 Adapter 并产出、校验 RendererRequest。默认 Adapter 为 `openai.gpt-image-2`。

## 目录

- `docs/visual-skill-spec-v0.1.md`：中文规范正文。
- `schemas/`：JSON Schema 2020-12 公共契约。
- `profiles/`：可替换的 AnalysisPolicy 参考配置。
- `src/index.mjs`：Reference Implementation 公共入口。
- `src/runtime.mjs`：Schema → Core → Adapter 的宿主编排层。
- `src/compiler.mjs`：模型无关的 Core Compiler、applicability 与 evaluation。
- `src/adapters/openai-gpt-image-2.mjs`：GPT Image 2 prompt 和 provider 参数映射。
- `src/reference-compiler.mjs`：仅用于旧导入路径的兼容 re-export。
- `examples/preserve/`：完整 Travel Editorial 示例。
- `examples/reimagine/`：最小 Paper Journey 示例。
- `examples/baseline/simple-film/`：Gate 1 使用的 Simple Film 对照 fixture；Core family 仍为 `preserve`。
- `tests/`：规范行为和反例测试。

## 当前边界

- Core family 只有 `preserve` 与 `reimagine`。
- Runtime Safety 的优先级高于 UserControls、UserContent、Skill Rules 与 defaults。
- baseline/control 仅通过 `experiment_metadata.role` 表达。
- 示例为原创 first-party 内容，不依赖调研仓库的 Prompt、名称或素材。
- 不包含图片上传、真实模型调用、任务队列、数据库、Web UI 或 Marketplace。
