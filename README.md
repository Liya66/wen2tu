<p align="center">
  <img src="brand/wen2tu-logo.webp" width="420" alt="wen2tu logo: a bunny holding a carrot pencil, connected to mind map topics">
</p>

<h1 align="center">wen2tu · 文兔兔</h1>

<p align="center">
  Open-source, local-first mind maps in your browser.<br>
  <b>English</b> · <a href="README.zh-CN.md">简体中文</a>
</p>

---

*文兔兔* (wen-tu-tu) sounds like “文 to 图” — *text to map*. Write an outline, get a mind map; or start drawing right away.

- **Your files, your device.** Open and save `.mind.json` files on your computer. No account, no server, no upload.
- **Never lose work.** Every edit is copied to browser storage within a fraction of a second, and restored after a crash or an accidental reload.
- **A real editor.** Add, edit, drag, collapse and link nodes; undo and redo; keyboard shortcuts for everything common.
- **Make it yours.** 12 color schemes, custom colors, 12 templates (project plan, SWOT, trip plan, process…) and a style panel for topics: 13 shapes (diamond, cloud, sticky note, ticket, tag…), corners, outline or underline borders, fills, text color and size, branch colors. Pour your own outline (e.g. from an AI) into any template's look.
- **Bring your outlines.** Paste Markdown or an indented outline (e.g. from an AI chat) — onto a selected topic it becomes subtopics, otherwise a new map. Import Markdown and OPML files; a built-in prompt asks any AI for the right format.
- **Share the result.** Export PNG, SVG, a Markdown outline, or an interactive HTML file — one file that opens offline in any browser (zoom, fold branches, click links) and can be imported back. Images include the map background, or choose a transparent export (dark schemes switch to a light version for white pages).
- **Bilingual.** English and Simplified Chinese interface; switching never touches your content.

## Browser support

| Browser | Open & save files directly | Fallback |
| --- | --- | --- |
| Chrome, Edge, Opera, Brave, Arc (desktop) | ✅ Saving writes back to the same file | — |
| Firefox, Safari, mobile browsers | ❌ (API not available) | Open via file picker; **saving downloads a new copy** and never overwrites the original |

In every browser, the maps in the sidebar are kept in browser storage (IndexedDB) until you remove them, so your work is safe between visits even before you save a file.

## Privacy

wen2tu has no backend. Map content is processed only in your browser and is never sent anywhere. The hosted site at Cloudflare Pages uses [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/) to count page views: it sets no cookies, does not fingerprint, and cannot see your maps. Self-hosted copies include no analytics at all.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl/⌘ S` · `Ctrl/⌘ Shift S` | Save · Save as |
| `Ctrl/⌘ O` | Open |
| `Ctrl/⌘ Z` · `Ctrl/⌘ Shift Z` | Undo · Redo |
| `Tab` · `Enter` · `Shift Enter` | Add child · sibling after · sibling before |
| `F2` or double-click | Edit node |
| `Delete` | Delete selected nodes |
| Arrow keys | Move between nodes |
| `Ctrl/⌘ K` then `0–9` | Collapse/expand to a level |

## File format

`.mind.json` is plain, versioned JSON — see [docs/FILE_FORMAT.md](docs/FILE_FORMAT.md). Plain [Mind Elixir](https://github.com/SSShooter/mind-elixir-core) exports can be opened too.

## Development

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit and component tests (Vitest)
npm run test:e2e     # end-to-end tests (Playwright) against the production build
npm run check        # lint + tests + type-check + build
```

Project layout:

```
src/
├── app/                 App shell, global shortcuts and page lifecycle
├── components/          Toolbar, sidebar, canvas, dialogs, status bar
├── features/
│   ├── mindmap/         Document model, schema validation, sanitizing, migrations
│   ├── workspace/       WorkspaceController (open/save/recover) and IndexedDB store
│   ├── file-manager/    File System Access API and download fallback
│   └── import-export/   Markdown/OPML import, Markdown/PNG/SVG export
└── i18n/                i18next setup and en / zh-CN translations
```

Deploying your own copy to Cloudflare Pages: see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Contributing

Issues and pull requests are welcome — please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License

[MIT](LICENSE). wen2tu is built on [Mind Elixir](https://github.com/SSShooter/mind-elixir-core) (MIT) and other open-source packages; all production dependencies use MIT or ISC licenses.
