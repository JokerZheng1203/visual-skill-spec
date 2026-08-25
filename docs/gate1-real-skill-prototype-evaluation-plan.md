# Gate 1：Real Skill Prototype & Evaluation Plan

状态：Design Draft  
Gate：`gate1-v0`  
依赖：Gate 0 PASS / Visual Skill Spec v0.1  
首个候选：`travel-editorial`  
实验对照：`plain-travel-editorial-v1`、`simple-film@0.1.0`

## 1. Gate 1 唯一目标

用真实个人照片验证：模型无关 Visual Skill 是否能稳定产生比强静态 Prompt 和简单效果更有价值的结果。

Gate 1 只回答三个问题：

1. Adaptive Visual Skill 是否优于不读取 PhotoAnalysis 的强静态 Prompt；
2. Creative Skill 是否优于只做轻量视觉处理的 Simple Film baseline；
3. 结果是否在目标照片范围内具有足够的适用率、质量稳定性和单位满意产出效率。

Gate 1 不验证留存、真实分享、付费、Marketplace、Creator、模型路由或生产基础设施。`save_intent`、`share_intent` 只能作为主观意向记录，不得写入 `ProductBehaviorEvent`，也不得声称为真实用户行为。

## 2. 冻结边界

Gate 0 的 Core、Runtime、Schema 和 GPT Image Adapter 在 Gate 1 期间冻结。Gate 1 可以修改：

- `Travel Editorial` Skill 定义与版本；
- Plain Prompt control；
- Eval 数据、生成脚本、盲评脚本和报告；
- 仅影响全部实验 arm 的阻断性执行 bug。

如果必须修改 Core、Runtime、Schema 或 Adapter，当前 run 作废，修复后重新执行所有 arm。不得只为候选 Skill 修改底层实现。

### 2.1 隐私边界

Gate 1 数据严格分为两层。

Private Artifacts 默认不得进入 Git：original images、generated images、UserFacts、UserContent、PhotoAnalysis、CreativePlan、RendererRequest、provider prompt、raw provider response、provider credentials、evaluator identity 和 raw identifiable ratings。它们只能位于已整体 gitignore 的 `evals/gate1/private/`、`dataset/private/`、`runs/` 或 `ratings/private/`。

Repo-safe Artifacts 仅包括 schemas/templates、gate config、anonymous photo ID、hashes、sanitized manifests、sanitized ratings、aggregate statistics 和 final report。真实照片产生的 CreativePlan、RendererRequest 与 Provider Prompt 即使不含原图也属于 private derived data。

**Git history 不得包含真实 UserFacts、UserContent、PhotoAnalysis、CreativePlan、RendererRequest 或 Provider Prompt。** 仓库中的此类示例只允许来自 synthetic 或现有 first-party fixtures。

## 3. 实验 Arms

| Arm | 类型 | 输入与处理 | 目的 |
|---|---|---|---|
| A `candidate_skill` | Candidate | `Travel Editorial` → Core → CreativePlan → GPT Image Adapter | 测量完整 Adaptive Skill 价值 |
| B `plain_prompt_control` | Control | 同一源照片、UserFacts、UserContent 和输出参数；只使用冻结静态 Prompt，不读取 PhotoAnalysis、不执行 Skill Rules | 隔离 Skill 编译与自适应价值 |
| C `simple_effect_baseline` | Baseline | `Simple Film@0.1.0` → 相同 Core/Adapter；不做 adaptive composition，不新增文字 | 测量 Creative Skill 相对简单效果的价值 |

### 3.1 公平性契约

所有 arm 必须使用：

- 同一张源照片；
- 同一 provider 与模型快照；
- 相同 quality tier、output format、background 和目标 aspect ratio；
- 同一批次窗口；
- 相同失败重试规则；
- 无人工挑图、无 best-of-N 筛选。

对比 A vs B 时，UserFacts、标题、副标题、语言和创意目标完全一致，唯一核心差异是 A 可以使用声明过的 PhotoAnalysis 和 Skill Rules，B 只能使用静态 Prompt。

对比 A vs C 时，C 不增加 editorial layout 与 typography 是 baseline 的定义，而不是需要消除的变量。这个对比测试“最终创作价值”，不用于估计单一编译器组件的因果提升。

## 4. Real Skill Prototype

Gate 1 只优化 `Travel Editorial`，不同时优化 `Paper Journey`。

### 4.1 Prototype 约束

- Spec 版本保持 `0.1.0`；
- 当前 `travel-editorial@0.1.0` 作为起点；
- dev 修改必须提升 Skill metadata version，holdout 前冻结目标版本；
- 最多进行两轮 dev 修订；
- 每次修订记录：失败照片、观察、修改字段、预期影响和回归结果；
- 禁止为单张照片写 photo-id 特例；
- 禁止在 holdout 开始后继续修改 Skill 或 control Prompt。

Plain Prompt Control 获得与 Candidate 相同的最多两轮 dev revision。允许修改的只有 global static wording、Prompt structure，以及一般性的 preservation、editorial、typography instructions。Control 始终不得读取 PhotoAnalysis、CreativePlan、ApplicabilityResult 或 Skill Rules，不得添加 photo-specific condition，也不得人工为单张照片补 Prompt。

单个异常 dev 输出不能单独触发 Candidate 或 Control 修改。Revision 必须满足下列任一证据条件：

- 同类型问题出现在至少 2 个不同 dev `photo_id`；
- 同一照片的诊断性独立再生成能够复现。

诊断性再生成不计入固定 30 个 dev outputs，但必须记录 `reason_for_extra_dev_replication`。dev 结束后同时冻结并记录：

```text
candidate_skill_version
candidate_skill_sha256
plain_prompt_version
plain_prompt_sha256
```

A vs B 的正式解释固定为 **Optimized Adaptive Skill vs Optimized Static Prompt**。

### 4.2 Prototype 重点

只允许围绕以下真实能力优化：

- Applicability 是否正确区分 applicable / conditional / not_applicable；
- 人物身份、地标和空间关系保留；
- 不同负空间与主体占比下的构图适配；
- `creative_intensity` 的有限映射；
- model typography 的标题、副标题准确性；
- unknown 不被发明为地点、日期、关系或文字。

## 5. 数据集设计

总数据集固定为 40 张真实照片：

```text
10 dev
30 frozen holdout
```

dev 用于最多两轮 Skill 修订；所有 Gate 判定只使用 holdout。holdout 一旦解盲或评分，不得再用于调参。若 Gate 结果为 ITERATE，下一次确认必须新增独立 holdout，不得重复使用本轮 holdout 证明提升。

### 5.1 Holdout 主分层

| 主分层 | 数量 |
|---|---:|
| 单人旅行 / 城市生活 | 8 |
| 双人或多人 | 4 |
| 无人物城市 / 街景 / 建筑 | 8 |
| 风景 / 海边 / 自然 | 6 |
| 夜景 / 低光 / 低质量困难样本 | 4 |
| 合计 | 30 |

dev 10 张按相同比例近似抽样。横竖构图目标为：12 竖图、12 横图、6 方形或近方形 holdout。至少覆盖高/低信息密度、明显/不足负空间、有人/无人和可见源文字。

30 张 Gate holdout 均必须在 manifest 中预先标记 `intended_domain: true`。Intended domain 由 Dataset Design 在 Candidate applicability 运行前判定，Candidate Skill 无权决定。额外 off-domain diagnostic photo 不属于这 30 张 Gate holdout。

### 5.2 数据准入

- 仅使用自有、明确授权或取得参与者同意的照片；
- 不使用无法确认授权的人脸、未成年人敏感照片、证件、聊天截图或私密文档；
- 去除 EXIF；地点、日期和人物关系只通过独立 UserFacts 记录；
- 每张照片使用匿名 `photo_id` 和 SHA-256；
- 原图、生成图和评价者身份不得提交到公共仓库；
- 不因为照片“不好看”而排除困难样本。

Dataset manifest 还必须包含 `scene_group_id`、`capture_session_id` 和匿名 `contributor_id`。同一 burst、near-duplicate、高度相似 scene 或 capture session 不得跨 dev / holdout，优先按 `scene_group_id` 分组后使用冻结的 split seed 切分。

同一 contributor 的 holdout 占比优先不超过 25%，硬上限为 40%；超过优先值必须在 Freeze Report 说明，超过硬上限则不能开始 holdout。

### 5.3 PhotoAnalysis 冻结

每张照片只生成一份 Global PhotoAnalysis。候选和 baseline 从同一份分析中按各自 `analysis_requirements` 消费数据。不得生成 arm-specific analysis。

每个 Scene Card 在生成前完成：

1. AnalysisPolicy confidence 校验；
2. inference basis / DAG 校验；
3. UserFacts 冲突检查；
4. known / unknown 完整性检查；
5. 人工只可纠正为 UserFacts 或 unknown，不得把猜测升级为 observation。

## 6. 生成协议

### 6.1 Dev

10 张 × 3 arms × 1 replicate = 30 个输出。dev 输出只用于定位 Skill 失败和冻结 prototype，不进入最终 Gate 指标。

保持单 replicate 控制成本。只有满足 4.1 的修订证据规则时，才允许诊断性额外 generation；不能根据单次模型随机异常调整 Skill 或 Prompt。

### 6.2 Holdout

30 张 × 3 arms × 2 independent replicates = 180 个计划输出。

使用冻结的 `generation_order_seed` 将 `photo_id × arm × replicate` 全量随机交错。禁止先生成全部 A、再生成 B、最后生成 C，确保三个 arm 分布在同一 provider 时间窗口。

每个请求记录：

- `run_id`、`photo_id`、arm、replicate；
- Skill version 或 control prompt hash；
- AnalysisPolicy、CreativePlan 和 RendererRequest hash；
- provider model snapshot；
- started/completed time、latency、request status；
- retry count、错误码和实际成本；
- output SHA-256。

Provider 输出不保证像素级确定性，因此两个 replicate 用于测量方差，不用于挑选最佳结果。CreativePlan、rule trace、diagnostics 和 RendererRequest 必须对相同输入保持完全一致。

### 6.3 失败处理

- Schema、semantic、Safety 或 not_applicable 不允许绕过；
- `not_applicable` 不生成候选结果，进入 applicability coverage，不进入盲评质量分；
- `conditional` 正常生成，但保留风险标签，标签不展示给评价者；
- provider technical failure 最多按原请求重试一次；
- 重试仍失败则记录为 technical failure，不手工替换照片；
- 全部失败和重试计入成本与 end-to-end success rate。

Technical success 的单位是 scheduled logical generation unit，而不是单次 provider attempt。每个 logical unit 在允许的一次 retry 后最终得到有效输出即为 success；retry attempt 只额外进入成本与 requests-per-satisfied 分子。

### 6.4 Provider-wide incident

Run 仅在有证据表明外部问题跨 arm 影响整个 run 时，才可使用以下 `run_invalid_reason`：

```text
provider_wide_incident
credential_failure
runner_bug_affecting_all_arms
```

这时 Gate result 为 `INVALID`，不是 FAIL；修复后重新执行受影响 run。若 Candidate 请求异常而 B/C 正常，必须计为 Candidate technical failure，不能标记 provider incident。

## 7. 盲评设计

### 7.1 Pairwise comparisons

Holdout 产生两个独立对比：

- A vs B：Adaptive Skill vs Plain Prompt；
- A vs C：Creative Skill vs Simple Film。

每张照片、每个 replicate 计划形成一个 pair，共 60 planned pairs / contrast，合计 120 planned pairs。Candidate not_applicable 或任一 arm technical failure 会形成缺失 pair，必须保留在 generation manifest，但不伪造盲评选择。每个有效 pair 至少由 3 名独立评价者判断，至少 2 名应符合目标用户画像。

目标用户画像是：主要使用手机记录旅行或城市生活、每月至少整理或分享一次个人照片、非职业视觉设计师。职业摄影师或设计师可以参与质量复核，但不能替代目标用户评价者。

Pairwise 和 Quality Rating UI 必须展示 Source Photo、允许展示的 user-confirmed context，以及 Output Left / Output Right。Confirmed context 只允许包含用户实际提供且授权评价者查看的 location、date、relationships、title、subtitle；缺失或未授权字段直接隐藏，不得用 inference 补齐。

不得展示 PhotoAnalysis、Inference、CreativePlan、Prompt、Skill、Arm、model decision 或 Applicability。左右顺序通过记录的固定随机种子打乱，不显示真实文件名。

最低 rater pool 为 9 名 unique raters，其中至少 6 名 target-user raters，推荐 9–12 名。每个有效 pair 固定分配 3 名 rater。Assignment 使用冻结 seed 做 balanced allocation；同一评价者不得看到同一 `photo_id` 的 replicate 1 和 replicate 2，除非客观无法满足且在评分前记录例外。单个 evaluator 最多分配 50 pairs，不能评完整 120 pairs。

Repo-safe rating 只记录 `rater_id_anonymous`、`target_user` 和 `assignment_seed`；真实 evaluator identity 私下保存。

选择项：

```text
左明显更好
左略好
基本相当
右略好
右明显更好
```

同时记录最多两个原因标签：身份、场景、构图、风格、文字、伪影、审美、其他。

### 7.2 Quality ratings

每个输出使用 1–5 分评价：

- identity preservation；
- scene fidelity；
- composition；
- style consistency；
- text accuracy；
- artifact control；
- aesthetic quality。

每个成功输出固定获得 3 名评价者的 quality ratings。每个 metric 的最终分数为 valid numeric ratings 的 median。如果至少 2/3 rater 将该 metric 标为 N/A，则最终 metric 为 N/A；否则使用其余有效数值的 median。随后按冻结 Gate 1 Quality Policy 的权重和 v0.1 N/A 重归一化算法计算质量分。

Gate 1 使用独立冻结的 `gate1-quality-v1`，不使用 dev 阶段可修改的 Candidate Skill `evaluation` 决定 PASS。Skill 自身 evaluation 可继续作为 Spec metadata，但不能改变 Gate denominator、weights、pass threshold 或 hard failures。

Candidate 的 `satisfied output` 定义为：

```text
frozen Gate1QualityPolicy passed = true
AND no confirmed hard failure
```

Hard failure taxonomy 在 `gate1-hard-failure-v1` 中冻结。Confirmed hard failure 需要至少 2 名评价者同意，或由不知道 arm 的 blind adjudicator 确认。

Systemic hard failure 预定义为：同一 hard-failure category 出现在至少 3 个输出，并覆盖至少 2 个不同 `photo_id`。不得在查看结果后重新解释“系统性”。

### 7.3 Intent，不是行为

可额外询问：

- `save_intent: yes | no`；
- `share_intent: yes | no`。

它们只属于 Gate 1 rating record，不能写成 `save` / `share` ProductBehaviorEvent，也不能用于声称真实转化。

## 8. 指标定义

### 8.1 Primary

```text
candidate_win_share =
  (candidate wins + 0.5 × ties) / all valid blind decisions
```

同时报告 decisive win rate：

```text
candidate wins / (candidate wins + comparator wins)
```

95% confidence interval 必须按 `photo_id` cluster bootstrap，保留同一照片的 replicates 和评价者相关性。不得把所有评价点击当成完全独立样本。

报告必须同时列出 planned pairs、valid pairs 和缺失原因。不得通过排除 not_applicable 或 technical failure 提高表面 win share；applicability coverage 与 technical success 是独立硬门槛。

### 8.2 Reliability denominators

所有指标按 holdout、arm 和 replicate 从 frozen sanitized manifest 计算：

```text
applicability_coverage =
candidate intended-domain photo-replicates classified applicable or conditional
/
all intended-domain candidate photo-replicates
```

`not_applicable` 保留在 denominator。

```text
conditional_rate =
candidate intended-domain photo-replicates classified conditional
/
all intended-domain candidate photo-replicates
```

```text
technical_success_rate =
logical generation units that eventually return valid provider output
/
logical generation units that should have sent a provider request
```

按 arm 分别报告。`not_applicable` 和 `safety_blocked` 因未调用 provider，不进入 technical denominator。

```text
end_to_end_satisfied_rate =
satisfied candidate outputs
/
all intended-domain candidate photo-replicates
```

`not_applicable`、`safety_blocked`、technical failure 和 quality failure 都降低该指标。这是 Gate 的 Primary Reliability 指标。

```text
rendered_satisfied_rate =
satisfied candidate outputs
/
successfully rendered candidate outputs
```

它只作为辅助诊断。

```text
confirmed_hard_failure_rate =
successfully rendered candidate outputs with confirmed hard failure
/
successfully rendered candidate outputs
```

报告必须显示每个 rate 的 numerator、denominator 和结果，而不能只显示百分比。

### 8.3 Quality summaries

- conditional rate；
- 每个质量维度的 median、P25、P75；
- 各照片分层和 replicate 的方差。

Quality metric 使用预注册的 median 与 N/A 聚合规则。跨 arm 主结论仍来自 blind win share 与相同维度的原始分数，不比较不同 Skill metadata policy 的 weighted score。

### 8.4 Efficiency

```text
requests_per_satisfied_output =
  candidate requests including retries / satisfied candidate outputs

cost_per_satisfied_output =
  all candidate provider charges / satisfied candidate outputs
```

如果 satisfied candidate outputs 为 0，两个指标均返回 `Infinity`，不得使用 0 或 null 掩盖失败。

成本使用 run 当日实际账单或 provider usage 记录，不在计划中硬编码价格。

### 8.5 Bootstrap freeze

Win-share 置信区间固定使用：

```text
cluster_key = photo_id
iterations = 10000
seed = 20260825
ci_level = 0.95
ci_method = percentile
```

禁止在看到结果后更换 bootstrap method、seed、CI method 或 cluster definition。

## 9. Gate 判定

### PASS：必须全部满足

| 条件 | 阈值 |
|---|---:|
| Holdout intended-domain applicability coverage | ≥ 85% |
| 每个 arm technical success rate | ≥ 95% |
| Candidate end-to-end satisfied rate | ≥ 60% |
| Candidate confirmed hard failure rate | ≤ 10%，且无重复系统性故障 |
| A vs B candidate win share | ≥ 60%，cluster 95% CI lower bound > 50% |
| A vs C candidate win share | ≥ 65%，cluster 95% CI lower bound > 50% |
| Requests per satisfied candidate output | ≤ 2.5 |
| 冻结与追踪 | 无未记录的 Skill、Prompt、模型或参数变更 |

`save_intent`、`share_intent`、latency 和绝对成本是辅助指标，不单独决定 PASS。

### ITERATE

以下情况进入 ITERATE，不宣称 Gate 通过：

- comparative win share 高于 50% 但未达到 PASS；
- end-to-end satisfied rate 为 40%–60%；
- 失败集中于一个可以明确修复的 Skill 决策；
- applicability 过窄但推荐机制仍能准确阻止失败生成。

只能回到 dev 修订，并为下一次确认补充新 holdout。

### STOP / PIVOT

出现任一情况：

- A vs B 或 A vs C win share ≤ 50%；
- end-to-end satisfied rate < 40%；
- applicability coverage < 70%；
- identity、landmark、文字或伪影出现重复系统性 hard failure；
- 单位满意产出无法在合理重试次数内形成。

## 10. 执行阶段

| 阶段 | 工作 | 退出条件 |
|---|---|---|
| G1.0 Freeze | 冻结配置、独立 Quality Policy、Hard Failure Taxonomy、数据字段、denominator 和随机参数 | Gate config hash 可记录，`frozen=true` |
| G1.1 Dataset | 收集、授权、脱敏并分层 40 张图 | manifest 完整；10/30 split 冻结 |
| G1.2 Scene Cards | 生成并校验 UserFacts / PhotoAnalysis | 40/40 可通过 CompileRequest 边界 |
| G1.3 Dev Prototype | 生成 30 个固定 dev 输出；Candidate 与 Control 各最多两轮同等级修订 | 两者 version 与 SHA-256 同时冻结 |
| G1.4 Holdout Generate | 生成最多 180 个计划输出 | generation manifest 完整，无挑图 |
| G1.5 Blind Eval | 120 pairs × 至少 3 ratings | 评分完整、盲态未破坏 |
| G1.6 Report | 聚合质量、偏好、可靠性和成本 | PASS / ITERATE / STOP 单一结论 |

建议工作量为 6–9 个工作日，不包含等待评价者的日历时间。

## 11. 产物与目录

```text
evals/gate1/
├── gate-config.json
├── README.md
├── controls/
│   └── plain-travel-editorial-v1.prompt.md
├── policies/
│   ├── gate1-quality-policy.json
│   └── hard-failure-taxonomy.json
├── templates/
│   ├── dataset-manifest.example.jsonl
│   ├── generation-manifest.example.jsonl
│   └── ratings.example.jsonl
├── dataset/private/
├── manifests/sanitized/
├── prototypes/
│   └── travel-editorial/
├── runs/<run_id>/
├── ratings/
│   ├── private/
│   └── sanitized/
└── reports/
    └── gate1-report.md
```

`dataset/private/`、`runs/`、`ratings/private/` 和顶层 `private/` 全部 gitignored。真实 UserFacts、UserContent、PhotoAnalysis、CreativePlan、RendererRequest、provider prompt、原图、生成图、raw response、评价者身份和凭据均不得进入 Git。仅 synthetic templates、匿名/hash-only sanitized records、聚合数据和最终报告可提交。

## 12. Gate 1 开始前检查

```text
[ ] Gate 0 npm ci / validate / test 继续通过
[ ] Private / repo-safe 边界与 Git history 禁令冻结
[ ] Gate 1 Quality Policy 独立冻结
[ ] Hard Failure Taxonomy 与 systemic 定义冻结
[ ] intended-domain 定义与每个 rate denominator 冻结
[ ] dataset split、scene group leakage 和 contributor 上限冻结
[ ] Candidate 与 Plain Prompt dev revision 上限及证据规则冻结
[ ] rater pool、assignment、Source Photo / confirmed context UI 冻结
[ ] metric median / N/A aggregation 冻结
[ ] generation order、pair side、assignment、bootstrap seeds 冻结
[ ] provider-wide incident policy 冻结
[ ] PASS / ITERATE / STOP thresholds 保持预注册
[ ] Freeze Review 记录配置与 policy hashes
[ ] 设置 `gate-config.frozen = true`
[ ] 之后才开始 10 张 dev 数据收集与生成
[ ] 实际成本记录方式确认
[ ] 不存在手工挑图或未记录重试路径
```

当前下一动作是 G1.0 Freeze Review：审核本计划、`gate-config.json`、两个 frozen policies 和 synthetic templates，记录 hashes 后将 `gate-config.frozen` 设为 `true`。此时不应继续抽象 Visual Skill Spec，也不得开始 holdout generation。
