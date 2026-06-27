# Repository Instructions

- 必须生成注释，简单解释即可，不需要太长。
- 业务判断要优先可读：避免依赖 JS 隐式真假值规则，例如 `!markdown.trim()`、`items.length`。优先使用有名字的中间变量和显式比较，例如 `const isMarkdownEmpty = markdown.trim() === ''`、`const hasItems = items.length > 0`。
- 简单的空值兜底可以保留常见写法，但影响保存、删除、权限、校验、路由等业务行为的判断必须写清楚。

## Agent skills

### Issue tracker

Issues are tracked as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

This repo uses the default mattpocock/skills triage label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain docs layout. See `docs/agents/domain.md`.
