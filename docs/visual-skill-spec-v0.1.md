# Visual Skill Spec v0.1

状态：Draft / Executable Reference  
规范版本：`0.1.0`

本文中的“必须”“不得”和“应当”是规范性要求。JSON Schema 负责结构校验，参考编译器负责跨字段、优先级、路径权限、图结构和冲突等语义校验。

## 1. 核心边界

Core Skill 的职责是：

```text
VisualSkill + UserFacts + UserContent + PhotoAnalysis
          + AnalysisPolicy + UserControls + RuntimeSafetyPolicy
                              ↓
                       ApplicabilityResult
                              ↓
                         CreativePlan
```

`CreativePlan` 是 Core Skill 的最终、模型无关产物。它必须只包含事实、用户内容、未知项、创作决策、约束、诊断、规则追踪、Safety 决策、能力要求和评估策略，不得包含 provider prompt、模型名称或 API 参数。

Renderer Adapter 接收 CreativePlan，并负责 provider prompt、endpoint、模型快照、尺寸、质量和输出参数。更换图片供应商不应要求修改 Core Skill。

## 2. 公共契约

### VisualSkill

VisualSkill 包含身份与来源、`preserve | reimagine` family、输入画像、分析路径声明、SkillDefaults、applicability、结构化 Preservation / Transformation、声明式规则、模型无关 renderer requirements 和质量评估策略。

`control` 不是 Core family。候选、baseline 和 control 只能写入 `experiment_metadata.role`。

### CompileRequest

```text
CompileRequest = VisualSkill + UserFacts + UserContent + PhotoAnalysis
               + AnalysisPolicy + UserControls + RuntimeSafetyPolicy
```

三类用户输入必须分离：

- `UserFacts`：现实事实，例如地点、日期和人物关系；
- `UserContent`：用户提供的标题、副标题和内容语言；v0.1 不支持 caption；
- `UserControls`：用户显式选择的创意强度、文字模式、文字渲染策略和画布比例。

任何字段不得为了方便而跨层复制。

### CreativePlan

CreativePlan 包含 Skill identity、family、ApplicabilityResult、带来源的 resolved facts/content、结构化约束、最终语义决策、unknowns、diagnostics、rule trace、`safety_decision`、renderer requirements 和 evaluation policy。

`creative-plan.schema.json` 使用 `additionalProperties: false`，从结构上排除 prompt、provider 和 model 等泄漏字段。

## 3. 用户输入权威与最终优先级

事实权威固定为：

```text
UserFacts / UserContent > PhotoAnalysis observation > PhotoAnalysis inference
```

当 UserFacts 或 UserContent 与 PhotoAnalysis 冲突时：

1. CreativePlan 只保留相应用户输入；
2. 分别生成 `W_USER_FACT_OVERRIDES_ANALYSIS` 或 `W_USER_CONTENT_OVERRIDES_ANALYSIS`；
3. 不得静默改写用户输入；
4. 被用户输入解决的 unknown 不再进入 CreativePlan。

UserControls 分为两类：

- **Authoritative Controls**：`aspect_ratio`、`text_mode`、`typography_rendering`。它们是确定性约束，Skill Rule 不得覆盖，由 Core 在规则执行后应用；
- **Adaptive Controls**：`creative_intensity`。Skill Rule 可以读取并自行映射为 CreativePlan 决策；Core 不增加 `plan.creative_intensity`，也不执行无语义的最终覆盖。

生成决策的最终优先级固定为：

```text
Runtime Safety > UserControls > UserContent > Skill Rules > SkillDefaults
```

Core 先复制 defaults，再执行 Skill Rules，然后依次应用 UserContent、Authoritative UserControls 和 Runtime Safety。Adaptive Controls 在规则求值时生效。

Skill Rule 不得写入 `plan.typography.mode`、`plan.typography.rendering`、`plan.typography.language` 或 `plan.output.aspect_ratio` 等用户权威路径。此类 Skill 在语义校验阶段返回 `E_RULE_WRITES_AUTHORITATIVE_PATH`，不能运行后静默覆盖。

## 4. PhotoAnalysis 与 AnalysisPolicy

PhotoAnalysis 必须将信息分为三个集合：

- `observations`：直接从像素观察到的 path、value 和 confidence；
- `inferences`：由已知分析项推导出的 path、value、confidence 和 basis；
- `unknowns`：当前图片无法可靠确定的 path 与原因，不得伪造占位值。

Core 不固定 confidence 阈值。CompileRequest 必须携带 `AnalysisPolicy`，由当前 Profile 定义 observation 与 inference 的最低 confidence。低于 Policy 阈值的条目必须进入 unknowns。

仓库提供 `reference-balanced-v0` 参考 Profile：observation `0.5`、inference `0.6`。这些值只是参考配置，不是 Core 常数。

同一路径不得同时出现在 observations、inferences 或 unknowns 的多个集合中。每个 inference basis 必须指向实际存在的 observation 或 inference。

全部 inference path 构成有向依赖图。该图必须是 DAG：允许前向引用，但禁止自环和多节点循环；检测到循环返回 `E_INFERENCE_CYCLE`。

`analysis_requirements` 是 Skill 的数据边界。只有声明过的 observation/inference path 可以进入 CreativePlan、Rule Engine 和 Renderer prompt；上游 Global Scene Card 中未声明的数据不得被该 Skill 消费。每个声明 path 必须在 PhotoAnalysis 中表示为 observation、inference 或 unknown，否则返回 `E_ANALYSIS_REQUIRED_PATH_MISSING`。

## 5. SkillDefaults 与声明式规则

`SkillDefaults` 对应完整 `PlanDecisions`，包含 objective、composition、visual、typography、output 和 notes。

每条 Rule 必须拥有跨版本稳定且在 Skill 内唯一的 `rule_id`。执行顺序为 priority 从低到高，同 priority 按声明顺序；`set` 后写覆盖先写，`append` 保持顺序并去重；全部命中与写入进入 `rule_trace`。

规则读取白名单：

- `user_facts.*`；
- `user_content.*`；
- Skill 声明的 `analysis.observations.*`、`analysis.inferences.*` 和 `analysis.unknowns.*`；
- `controls.*`；
- SkillDefaults 中真实存在的 `defaults.*`。

规则只能写入白名单中且非用户权威的 `plan.*`。不得写入 UserFacts、UserContent、UserControls、PhotoAnalysis、applicability、renderer、provider 或 Runtime Safety。v0.1 不允许任意 JavaScript、模板代码或插件函数。

## 6. 结构化 Preservation / Transformation

约束必须使用受控 `TargetRef`：

```json
{
  "domain": "subject",
  "path": "subject.identity",
  "subject_ref": "primary-person"
}
```

`domain` 必须与 path 第一段一致。自然语言 description 只供人阅读，不参与冲突检测。

同一 `path + subject_ref` 上，`hard` preservation 与 `required` transformation 不兼容，返回 `E_CONSTRAINT_CONFLICT`。Soft preservation 或 allowed transformation 不构成硬冲突。

## 7. Applicability 的三态语义

Applicability 在 CreativePlan 前执行。每个 requirement 产生 `matched | unmatched | unknown`：

- 读取到值并满足条件：matched；
- 读取到值但不满足条件：unmatched；
- analysis path 被列入 unknowns 或没有值：unknown。

Unknown 不能当作普通 unmatched。每个 requirement 必须用 `on_unknown` 选择：

- `not_applicable`：立即阻断；
- `conditional`：从评分分母移除该权重，并强制总体状态不得高于 conditional；
- `ignore`：从评分分母移除且不改变总体状态，但保留 requirement result。

评分：

```text
score = matched included weight / included known-or-blocking weight
```

任一 required requirement 为 unmatched、任一 unknown 选择 not_applicable，或 score 低于 `conditional_min`，结果为 `not_applicable`。Unknown conditional 或 score 低于 `applicable_min` 时结果为 `conditional`。

`not_applicable` 返回携带 ApplicabilityResult 的 `E_NOT_APPLICABLE`。`conditional` 可以继续，但 CreativePlan 必须携带 `W_CONDITIONAL_APPLICABILITY`。

## 8. Evaluation 与 N/A 重归一化

`QualityEvaluation` 只回答作品质量，指标包括 identity preservation、scene fidelity、composition、style consistency、text accuracy、artifact control 和 aesthetic quality。Save、share、download 和 retry 属于独立的 `ProductBehaviorEvent`，不得参与质量分。

Skill 的基础权重之和必须为 `1`。N/A 指标使用 `not_applicable_reason`，并按以下算法重新归一化：

```text
available_weight = Σ base_weight(metric with score)
normalized_weight_i = base_weight_i / available_weight
weighted_score = Σ score_i × normalized_weight_i
```

N/A 指标不进入分子或分母；结果必须保存 `normalized_weights`。若 `available_weight = 0`，返回 `E_EVALUATION_NO_SCORABLE_WEIGHT`。任何 hard failure 都强制 `passed = false`，不能被总分抵消。

## 9. Typography 渲染策略

Typography 同时包含内容模式与渲染策略：

- `model`：图片模型直接渲染文字，用户文案进入 provider prompt；
- `postprocess`：模型只预留干净区域，确定性排版系统随后合成文字；
- `none`：不渲染文字。

`text_mode: none` 必须与 `typography_rendering: none` 配对；其他 text mode 必须选择 model 或 postprocess。Skill Rule 不得覆盖用户选择。

`none` 不等于“不要求文字”。Adapter 必须明确禁止新增标题、caption、label、logo、watermark、装饰字形或虚构文字，同时不得把该指令解释为无条件擦除源照片中真实存在的招牌或道路文字。

## 10. Reference Implementation Runtime

公共入口位于 `src/index.mjs`。`createReferenceRuntime()` 创建宿主编排层，按固定顺序执行：

```text
CompileRequest Schema
        ↓
Core semantic validation
        ↓
CreativePlan compilation + Schema
        ↓
explicit Adapter selection
        ↓
RendererRequest compilation + Schema
```

Runtime 不得参与规则求值或创作决策，也不得把 provider 参数回写 CreativePlan。`compile()`、`render()` 和 `execute()` 分别暴露分阶段与端到端入口。默认注册 `openai.gpt-image-2`；未注册、重复、接口无效或返回 ID 不一致的 Adapter 必须产生稳定 Runtime error code。

Schema 失败统一返回 `SchemaValidationError`，其 `code` 为 `E_SCHEMA_VALIDATION`，并保留 schema ID 与 Ajv errors；Core 语义失败继续返回 `SpecError`；Adapter 注册或选择失败返回 `ReferenceRuntimeError`。

## 11. GPT Image 2 参考 Adapter

Core Compiler 位于 `src/compiler.mjs`，只生成模型无关 CreativePlan。参考 Adapter 位于 `src/adapters/openai-gpt-image-2.mjs`，负责把 CreativePlan 编译为 provider prompt，并映射 endpoint、质量、尺寸、格式和 Typography strategy。`src/reference-compiler.mjs` 仅保留兼容 re-export，不承载实现。

Adapter 固定使用 `gpt-image-2-2026-04-21` 作为可复现快照。请求不得包含 `input_fidelity`，也不得请求透明背景。参考实现只产生请求对象，不访问网络。

## 12. Runtime Safety

Runtime Safety 是 Skill 外部、由宿主运行时注入的最高优先级策略。Skill 不得读取、修改或削弱 Safety 决策。

- `blocked: true` 在 applicability 与 CreativePlan 生成前返回 `E_RUNTIME_SAFETY_BLOCKED`；
- 非阻断 Safety overrides 在 UserControls 之后应用；
- 每个 override 必须包含 path、value 和 reason；
- CreativePlan 必须保存 `safety_decision`；
- 每次实际覆盖生成 `W_RUNTIME_SAFETY_OVERRIDE`。

Runtime Safety 可以覆盖 SkillDefaults、Skill Rules、UserContent 和 UserControls，但不得改写 UserFacts 或伪造事实。

## 13. 代表性错误与诊断

- `E_RULE_UNKNOWN_READ_PATH`
- `E_RULE_ILLEGAL_WRITE_PATH`
- `E_RULE_WRITES_AUTHORITATIVE_PATH`
- `E_DUPLICATE_RULE_ID`
- `E_CONSTRAINT_CONFLICT`
- `E_ANALYSIS_EPISTEMIC_CONFLICT`
- `E_OBSERVATION_CONFIDENCE_TOO_LOW`
- `E_INFERENCE_CONFIDENCE_TOO_LOW`
- `E_INFERENCE_CYCLE`
- `E_NOT_APPLICABLE`
- `E_EVALUATION_WEIGHT_TOTAL`
- `E_EVALUATION_NO_SCORABLE_WEIGHT`
- `E_RUNTIME_SAFETY_BLOCKED`
- `E_ANALYSIS_REQUIRED_PATH_MISSING`
- `E_INPUT_PROFILE_IMAGE_RANGE`
- `E_SCHEMA_VALIDATION`
- `E_ADAPTER_INVALID`
- `E_ADAPTER_DUPLICATE`
- `E_ADAPTER_NOT_FOUND`
- `E_ADAPTER_ID_MISMATCH`

Warnings 必须保留在 CreativePlan 中供 UI、日志和 Evaluation 使用。

## 14. v0.1 非目标

- 真实图片 API 调用；
- 多轮图片编辑；
- 用户自定义脚本；
- Marketplace、Creator 分成和开放发布；
- 模型自动路由；
- 自动化视觉质量评分；
- save/share 行为预测。
