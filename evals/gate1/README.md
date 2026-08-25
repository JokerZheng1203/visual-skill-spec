# Gate 1 Eval Workspace

规范性计划见 [Gate 1：Real Skill Prototype & Evaluation Plan](../../docs/gate1-real-skill-prototype-evaluation-plan.md)。

当前状态：Design Freeze 已于 `2026-08-25T11:04:15.969Z` 完成并通过校验；真实 Dev Dataset 尚未收集，Dev Generation 未开始。dev 选定最终 Candidate 与 Control 后，还必须完成 Holdout Freeze，才能开始 holdout。

## Private Artifacts

以下真实照片衍生内容必须只存在于 `private/`、`dataset/private/`、`runs/` 或 `ratings/private/`，这些目录已整体加入 `.gitignore`：

- original / generated images；
- UserFacts、UserContent、PhotoAnalysis；
- CreativePlan、RendererRequest 和 provider prompt；
- raw provider response、provider credentials；
- evaluator identity 与 raw identifiable ratings。

**Git history 不得包含真实 UserFacts、UserContent、PhotoAnalysis、CreativePlan、RendererRequest 或 Provider Prompt。** 如果真实衍生数据被意外 staged，必须在 commit 前移除；如果已经进入 commit，必须停止实验并完成历史清理后才能继续。

## Repo-safe Artifacts

仓库只允许保存：

- schemas、policies、synthetic templates；
- gate config、匿名 `photo_id` 和 hashes；
- `manifests/sanitized/` 下的 sanitized generation manifest 与 `ratings/sanitized/` 下的 sanitized ratings；
- aggregate statistics 和 final report。

任何 CreativePlan / RendererRequest 示例必须是 synthetic 或现有 first-party fixture，不能来自 Gate 1 真实照片。

## 固定协议

- dev / holdout 按 `scene_group_id` 和 `capture_session_id` 分组切分，并在查看输出前冻结；
- `intended_domain` 在 Candidate applicability 前由 Dataset Design 冻结；
- Candidate 与 Plain Prompt 各最多两轮 dev revision；
- 所有 generation unit、失败、重试和 invalid run 原因必须进入 private raw manifest，再导出 sanitized manifest；
- Quality Policy、Hard Failure Taxonomy、聚合方法、随机种子和 Gate thresholds 不得在查看 holdout 后修改。

## Freeze 协议

- `design_freeze`：在 dev generation 前冻结设计、policies、templates、denominator、threshold、seed、revision 协议和起始 Candidate / Control；
- `holdout_freeze`：在 dev 后、holdout generation 前冻结最终 Candidate / Control、baseline、sanitized dataset manifest、AnalysisPolicy、Renderer Adapter 和 provider model snapshot；
- dev 修订必须创建新的版本化 artifact，不得覆盖 Design Freeze 中记录的起始文件；
- 只有对应 freeze 的必需字段和 SHA-256 完整且 `status` 为 `complete`，冻结才生效。

## Manifest Join 契约

成功 generation record 必须包含全局唯一且非空的 `output_id`；失败或未生成结果的 logical unit 使用 `null`。Pair Assignment manifest 以唯一 `pair_id` 连接左右 `output_id`，ratings 不直接复制 arm 映射。

```text
pairwise rating.pair_id → pair assignment.output_id → generation.output_id → arm_id
quality rating.output_id → generation.output_id → arm_id
```

包含 output-to-arm 映射的 Pair Assignment manifest 在评分锁定前属于 private artifact。

## 下一步

1. 收集并授权 10 张 rights-cleared Dev 照片；
2. 在 `dataset/private/dataset-manifest.jsonl` 记录 Dev manifest 并运行 Dataset validator；
3. 为每张 Dev 照片分别创建 private UserFacts / UserContent / PhotoAnalysis 并运行 Scene Card validator；
4. 校验全部通过后，才进入 Candidate 与 Control 的同等级 Dev Prototype；
5. dev 选定最终 artifacts 后执行 Holdout Freeze Review，完成后才开始 holdout generation。
