# Gate 1 Eval Workspace

规范性计划见 [Gate 1：Real Skill Prototype & Evaluation Plan](../../docs/gate1-real-skill-prototype-evaluation-plan.md)。

当前状态：`design_draft`，设计修订已具备 Freeze Review 条件，但 `gate-config.frozen` 仍为 `false`。正式审核并记录 hash 前不得开始 dev；Candidate 与 Control 在 dev 后同时冻结，之后才能开始 holdout。

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

## 下一步

1. 执行 Freeze Review，记录 Gate config、Quality Policy、Hard Failure Taxonomy 和 control 起始版本的 hash；
2. 将 `gate-config.frozen` 设为 `true`；
3. 按 template 收集并授权 10 张 dev 照片；
4. 为 dev 照片创建 private UserFacts / UserContent / PhotoAnalysis；
5. 在不修改 Core/Runtime/Adapter/Schema 的前提下开始 Candidate 与 Control 的同等级 dev 优化。
