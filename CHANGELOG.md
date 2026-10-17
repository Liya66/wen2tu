# Changelog

## Unreleased

### Features
- 统计兔 data2tu prototype at `/chart/` and `/en/chart/`: paste a table (Excel/Sheets copy, CSV, Markdown from an AI answer, database client output, optionally with its SQL query) and get the three best-fitting charts. Reads units (`1,234`, `12.5%`, `¥3.2万`, `1.2亿`, `$1.2M`), periods (`2024-03`, `2024年3月`, `Q1`, `Jan-24`), date ranges, missing values, summary rows and total columns; tells long from wide tables. Charts (ECharts, loaded on demand) use one muted slate hue: shades for ordered series and stacks, the largest line highlighted with the rest in gray, small multiples past three unordered groups.
- Chart style panel (Style button, like the mind map editor's): title, eight one-hue palettes or a custom base color, value labels, legend, bar direction, category order, 万/亿 (K/M) or full numbers, gridlines. Colors tab: give any series, slice, bar or timeline row its own color; colors are kept by name. Choices that are too faint or hard to tell apart (also for red–green color-blind readers) get a warning and a one-click fix that moves the color's lightness.
- Chart exports from each card: PNG (2×) and SVG, with the card background or transparent (light colors), copy as image, and the detected data as CSV (plain numbers, ISO dates, BOM for Excel).

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
