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

### 5.2 数据准入

- 仅使用自有、明确授权或取得参与者同意的照片；
- 不使用无法确认授权的人脸、未成年人敏感照片、证件、聊天截图或私密文档；
- 去除 EXIF；地点、日期和人物关系只通过独立 UserFacts 记录；
- 每张照片使用匿名 `photo_id` 和 SHA-256；
- 原图、生成图和评价者身份不得提交到公共仓库；
- 不因为照片“不好看”而排除困难样本。

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

### 6.2 Holdout

30 张 × 3 arms × 2 independent replicates = 180 个计划输出。

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

## 7. 盲评设计

### 7.1 Pairwise comparisons

Holdout 产生两个独立对比：

- A vs B：Adaptive Skill vs Plain Prompt；
- A vs C：Creative Skill vs Simple Film。

每张照片、每个 replicate 计划形成一个 pair，共 60 planned pairs / contrast，合计 120 planned pairs。Candidate not_applicable 或任一 arm technical failure 会形成缺失 pair，必须保留在 generation manifest，但不伪造盲评选择。每个有效 pair 至少由 3 名独立评价者判断，至少 2 名应符合目标用户画像。

目标用户画像是：主要使用手机记录旅行或城市生活、每月至少整理或分享一次个人照片、非职业视觉设计师。职业摄影师或设计师可以参与质量复核，但不能替代目标用户评价者。

评价界面只显示随机 output ID。左右顺序通过记录的固定随机种子打乱，不显示 arm、Prompt、Skill、applicability 或文件名。

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

N/A 继续使用 v0.1 重归一化算法。跨 arm 不比较各 Skill 自己的 weighted score，因为不同 Skill policy 权重不同；跨 arm 主结论来自盲测 win share 和相同维度的原始分数。

Candidate 的 `satisfied output` 定义为：

```text
QualityEvaluation.passed = true
AND no confirmed hard failure
```

hard failure 需要至少两名评价者一致，或由不知道 arm 的第二轮裁决确认。

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

### 8.2 Reliability

- applicability coverage；
- conditional rate；
- technical success rate；
- satisfied output rate；
- confirmed hard failure rate；
- 每个质量维度的 median、P25、P75；
- 各照片分层和 replicate 的方差。

### 8.3 Efficiency

```text
requests_per_satisfied_output =
  candidate requests including retries / satisfied candidate outputs

cost_per_satisfied_output =
  all candidate provider charges / satisfied candidate outputs
```

成本使用 run 当日实际账单或 provider usage 记录，不在计划中硬编码价格。

## 9. Gate 判定

### PASS：必须全部满足

| 条件 | 阈值 |
|---|---:|
| Holdout intended-domain applicability coverage | ≥ 85% |
| 每个 arm technical success rate | ≥ 95% |
| Candidate satisfied output rate | ≥ 60% |
| Candidate confirmed hard failure rate | ≤ 10%，且无重复系统性故障 |
| A vs B candidate win share | ≥ 60%，cluster 95% CI lower bound > 50% |
| A vs C candidate win share | ≥ 65%，cluster 95% CI lower bound > 50% |
| Requests per satisfied candidate output | ≤ 2.5 |
| 冻结与追踪 | 无未记录的 Skill、Prompt、模型或参数变更 |

`save_intent`、`share_intent`、latency 和绝对成本是辅助指标，不单独决定 PASS。

### ITERATE

以下情况进入 ITERATE，不宣称 Gate 通过：

- comparative win share 高于 50% 但未达到 PASS；
- satisfied output 为 40%–60%；
- 失败集中于一个可以明确修复的 Skill 决策；
- applicability 过窄但推荐机制仍能准确阻止失败生成。

只能回到 dev 修订，并为下一次确认补充新 holdout。

### STOP / PIVOT

出现任一情况：

- A vs B 或 A vs C win share ≤ 50%；
- satisfied output rate < 40%；
- applicability coverage < 70%；
- identity、landmark、文字或伪影出现重复系统性 hard failure；
- 单位满意产出无法在合理重试次数内形成。

## 10. 执行阶段

| 阶段 | 工作 | 退出条件 |
|---|---|---|
| G1.0 Freeze | 冻结配置、control Prompt、数据字段和评分说明 | 所有 hash 与版本可记录 |
| G1.1 Dataset | 收集、授权、脱敏并分层 40 张图 | manifest 完整；10/30 split 冻结 |
| G1.2 Scene Cards | 生成并校验 UserFacts / PhotoAnalysis | 40/40 可通过 CompileRequest 边界 |
| G1.3 Dev Prototype | 生成 30 个 dev 输出，最多两轮修订 | Candidate 与 control freeze |
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
├── dataset/
│   ├── manifest.jsonl
│   ├── facts/
│   └── analysis/
├── prototypes/
│   └── travel-editorial/
├── runs/<run_id>/
│   ├── generation-manifest.jsonl
│   ├── plans/
│   ├── requests/
│   └── outputs/
├── ratings/
│   ├── pairs.jsonl
│   └── ratings.jsonl
└── reports/
    └── gate1-report.md
```

原图、生成图、评价者身份和 provider 凭据是 private artifacts，不提交仓库。可提交配置、匿名 manifest、hash、聚合数据和最终报告。

## 12. Gate 1 开始前检查

```text
[ ] Gate 0 npm ci / validate / test 继续通过
[ ] 40 张照片授权与隐私规则确认
[ ] dev / holdout split 在看输出前冻结
[ ] Plain Prompt control 冻结并 hash
[ ] Candidate / baseline / model / adapter 版本冻结
[ ] 三个 arm 的输出参数逐字段核对
[ ] evaluator instructions 与 blind randomization 冻结
[ ] 实际成本记录方式确认
[ ] 不存在手工挑图或未记录重试路径
```

当前下一动作是 G1.0：审核并冻结 `gate-config.json` 与 Plain Prompt control，然后开始收集 10 张 dev 照片。此时不应继续抽象 Visual Skill Spec。
