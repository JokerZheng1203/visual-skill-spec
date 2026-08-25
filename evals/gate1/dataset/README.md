# Gate 1 Dev Dataset

本目录只定义 10 张真实 Dev 照片的人工准备入口，不包含、也不得伪造任何真实数据。原图和所有照片衍生记录必须位于已忽略的 `private/` 下，不得进入 Git。

## Dataset manifest

人工创建：

```text
evals/gate1/dataset/private/dataset-manifest.jsonl
```

每张照片一行 JSON，至少包含：

```text
photo_id
split = dev
intended_domain
scene_group_id
capture_session_id
contributor_id
primary_stratum
orientation
target_aspect_ratio
source_sha256
rights_status
exif_removed = true
```

`rights_status` 仅允许 `self_owned | consented | licensed`。`orientation` 仅允许 `portrait | landscape | square`。照片必须移除 EXIF，并使用原始文件 bytes 的 SHA-256；`photo_id` 与 `source_sha256` 都必须唯一。

真实 10 张 Dev 照片尚未收集时，不创建占位 manifest。只有 Dev records 而没有 Holdout records 是合法的。

## Private Scene Card files

每个 Dev `photo_id` 分别人工创建三个文件：

```text
evals/gate1/dataset/private/facts/<photo_id>.json
evals/gate1/dataset/private/content/<photo_id>.json
evals/gate1/dataset/private/analysis/<photo_id>.json
```

- `facts` 只保存 UserFacts；
- `content` 只保存 UserContent；
- `analysis` 只保存 PhotoAnalysis。

不得合并三类数据，也不得通过 PhotoAnalysis 写入或覆盖用户确认事实。验证脚本只使用中性的 validation-only UserControls 与未阻断 Runtime Safety 来检查 Candidate CompileRequest 边界，不会调用图片 API，也不会自动修复数据。

## Validation

```bash
node scripts/validate-gate1-dataset.mjs
node scripts/validate-gate1-scene-cards.mjs
```

也可以显式传入 manifest；Scene Card validator 的第二个参数是 private root：

```bash
node scripts/validate-gate1-dataset.mjs <dataset-manifest.jsonl>
node scripts/validate-gate1-scene-cards.mjs <dataset-manifest.jsonl> <private-root>
```

任一结构、split、rights、EXIF、analysis completeness、epistemic consistency、inference DAG、UserFacts authority 或 CompileRequest 校验失败时，脚本以非零状态退出并输出明确错误。不会启动生成。
