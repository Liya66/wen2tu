# Changelog

## 0.1.0 — first public release · 首个公开版本

### Features
- Mind map editor based on Mind Elixir: add, edit, drag, collapse, link and summarize nodes; undo/redo; keyboard shortcuts.
- Workspace of multiple maps kept in browser storage, with crash/reload recovery.
- Open, save and save as `.mind.json` files. Chromium browsers write back to the original file; other browsers download a copy.
- Detects files changed by other programs and asks before overwriting them.
- Optional automatic saving to linked files.
- Import Markdown (headings, nested lists, GFM task lists) and OPML.
- Export PNG, SVG and Markdown outlines.
- English and Simplified Chinese interface.
- 10 color schemes plus custom colors and branch palettes; layout direction and compact spacing.
- 9 map templates in both languages.
- Topic style panel: corner shape, outline/underline borders, fills, text color/size/bold/italic/strikethrough, branch colors. Color pickers preview live and commit once, as a single undo step.

### Known limitations · 已知限制
- Direct file saving needs the File System Access API (Chrome, Edge and other Chromium browsers on desktop). Firefox and Safari use downloads.
- After a browser restart, Chromium asks again for permission to write a linked file on the first save.
- Markdown import skips code blocks, tables, block quotes, images and raw HTML. Markdown and the map are not edited side by side yet.
- Editing on touch screens works but is not optimized.
