# Contributing · 参与贡献

Thanks for helping improve wen2tu! 感谢你帮助改进文兔兔！Issues and pull requests may be written in English or Chinese. Issue 和 PR 可以用中文或英文。

## Ground rules · 基本原则

- **Local-first is a promise.** Never add code that sends map content, file names or usage details to a server. 不要加入任何会上传脑图内容、文件名或使用细节的代码。
- **Data safety first.** A change must not be able to replace or lose the user's current map unless they asked for it. 任何改动都不能在用户未要求时覆盖或丢失当前脑图。
- **Both languages.** Every user-facing string goes in `src/i18n/locales/en.json` *and* `zh-CN.json` (a test checks the keys match). User content is never translated. 所有界面文字都要同时写入两份翻译文件。

## Getting started · 开始开发

```bash
npm install
npm run dev
```

Before opening a pull request, run 提交 PR 前请运行:

```bash
npm run check      # lint + unit tests + type-check + build
npm run test:e2e   # end-to-end tests (first time: npx playwright install chromium)
```

## Where things live · 代码结构

- File format, validation and sanitizing: `src/features/mindmap/`. Changing the format? Bump `DOCUMENT_VERSION` and add a migration in `migrations.ts`, plus tests.
- Opening, saving, recovery and the sidebar list: `src/features/workspace/workspaceController.ts` — UI-free and covered by `workspaceController.test.ts`.
- Importers/exporters: `src/features/import-export/`.

## Commits · 提交信息

Small, focused commits using [Conventional Commits](https://www.conventionalcommits.org/), e.g. `feat: add OPML export`, `fix: keep selection after undo`, `docs: …`, `test: …`.

## Reporting bugs · 报告问题

Use the issue templates. Please include the browser and version, and if possible a small `.mind.json` that reproduces the problem (remove anything private first). 请附上浏览器版本，最好提供一个可以复现问题的小文件（先删掉隐私内容）。

Security issues: see [SECURITY.md](SECURITY.md).
