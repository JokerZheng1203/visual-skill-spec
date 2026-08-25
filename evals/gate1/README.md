# Gate 1 Eval Workspace

规范性计划见 [Gate 1：Real Skill Prototype & Evaluation Plan](../../docs/gate1-real-skill-prototype-evaluation-plan.md)。

当前状态：`design_draft`。在 `gate-config.json` 的版本、arms、阈值、数据分层和 Plain Prompt control 完成审核前，不得开始 holdout 生成。

## 数据规则

- `dataset/images/`、`runs/*/outputs/`、评价者身份和 provider 凭据不得提交仓库；
- 可以提交匿名 manifest、hash、CreativePlan、RendererRequest、盲评 pair、匿名 ratings 和聚合报告；
- dev 与 holdout split 必须在查看生成结果前冻结；
- 所有生成、失败和重试都必须进入 generation manifest。

## 下一步

1. 冻结配置与 control Prompt；
2. 定义 dataset manifest 字段；
3. 收集并授权 10 张 dev 照片；
4. 为 dev 照片创建 UserFacts 与 PhotoAnalysis；
5. 在不修改 Core/Runtime/Adapter/Schema 的前提下开始 prototype run。
