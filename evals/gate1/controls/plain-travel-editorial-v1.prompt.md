# Plain Travel Editorial Control v1

状态：Dev Starting Version。允许与 Candidate 相同的最多 2 轮 dev revision；dev 结束后必须冻结最终 version 与 SHA-256，之后才能开始 holdout。

允许的 revision 仅限全局静态 wording、Prompt structure，以及一般性的 preservation、editorial、typography instruction。不得读取 PhotoAnalysis、CreativePlan、ApplicabilityResult 或 Skill Rules，不得加入 photo-specific condition，也不得人工为单张照片补 Prompt。单次异常输出不能触发修改；必须在至少 2 个不同 dev photo 出现同类问题，或由同一照片的诊断性独立再生成复现。

以下模板是强静态 Prompt control。它可以使用用户明确提供的事实和文案，但不得读取 PhotoAnalysis、ApplicabilityResult、CreativePlan 或 Skill Rules。

```text
Edit the source photograph into a restrained, polished travel editorial memory image.

Preserve the recognizable identity and facial features of photographed people. Preserve real landmarks, architecture, objects, source lighting, and the factual spatial relationship of the scene. Do not invent locations, dates, relationships, coordinates, logos, labels, or narrative facts.

Use only the following user-confirmed information when present:
- location: {{user_facts.location}}
- date: {{user_facts.date}}
- relationships: {{user_facts.people_relationships}}
- title: {{user_content.copy.title}}
- subtitle: {{user_content.copy.subtitle}}
- language: {{user_content.language}}

Omit any blank field. Never infer missing copy or facts from the photograph.

Create a quiet editorial composition with restrained paper texture, a source-derived palette, one subtle accent, balanced negative space, and minimal graphic marks. Render the exact user-provided title and subtitle without adding other written content.
```

运行器只允许替换上述占位符；不得根据单张照片附加描述、建议或人工 Prompt。
