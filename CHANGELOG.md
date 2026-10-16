# Changelog

## 0.1.0 — first public release · 首个公开版本

### Features
- Mind map editor based on Mind Elixir: add, edit, drag, collapse, link and summarize nodes; undo/redo; keyboard shortcuts.
- Workspace of multiple maps kept in browser storage, with crash/reload recovery.
- Open, save and save as `.mind.json` files. Chromium browsers write back to the original file; other browsers download a copy.
- Detects files changed by other programs and asks before overwriting them.
- Optional automatic saving to linked files.
- Import Markdown (headings, nested lists, GFM task lists) and OPML.
- Paste Markdown or indented outlines: onto a selected topic as subtopics (one undo step), or as a new map; “From pasted text…” dialog with a copyable AI prompt; “Paste outline” in the topic menu for people who don't use the shortcut.
- Export PNG, SVG and Markdown outlines, and interactive HTML: a single offline file with a read-only viewer that carries the map data and imports back. Images carry the map background; transparent exports use a light version of dark color schemes.
- English and Simplified Chinese interface.
- Chinese interface by default (English one click away).
- A welcome map on first visit (about wen2tu, AI tip, shortcuts, files, next steps, open source) that follows the interface language until edited; reopen it from Settings.
- Large maps open zoomed out to fit the screen (down to 60%).
- Bunny logo, app icons and a warm interface palette taken from the logo; maps use the matching “文兔兔 / wen2tu” and “夜兔兔 / ye2tu” color schemes by default.
- 12 color schemes plus custom colors and branch palettes; layout direction and compact spacing.
- 12 map templates in both languages, each with topic shapes by level; pour your own outline (with a template-aware AI prompt) into a template's look.
- 13 extra topic shapes under Style → More…: title card, diamond, flag, hexagon, cut corners, sticky note, ellipse, cloud, leaf, ticket, folder tab, double border, tag.
- Copy the current map as Markdown.
- Branch lines (Style → Map): strength (standard, soft, faint, hidden), weight and style (curved, elbow, straight). Hidden keeps plain subtopics' underlines; a topic's border set to None removes its underline.
- Topic style panel: corner shape, outline/underline borders, fills, text color/size/bold/italic/strikethrough, branch colors. Color pickers preview live and commit once, as a single undo step.

### Known limitations · 已知限制
- Direct file saving needs the File System Access API (Chrome, Edge and other Chromium browsers on desktop). Firefox and Safari use downloads.
- After a browser restart, Chromium asks again for permission to write a linked file on the first save.
- Markdown import skips code blocks, tables, block quotes, images and raw HTML. Markdown and the map are not edited side by side yet.
- Editing on touch screens works but is not optimized.
