# Brand assets

- `wen2tu-logo.webp` — the full logo (transparent background).
- `icon-source.png` — the bunny cut out of the logo, used for all icons.
- `make_icon.py` — regenerates `icon-source.png` from the logo (requires Pillow):

```bash
python3 brand/make_icon.py brand/wen2tu-logo.webp brand/icon-source.png
```

Colors (also defined as CSS variables in `src/styles/app.css`):

| Name | Hex | Used for |
| --- | --- | --- |
| Ink | `#2c2d35` | Outlines, text, center topic |
| Carrot | `#ff9341` | Accent, buttons, selection |
| Blossom | `#fc9e9f` | Highlights, unsaved marker |
| Leaf | `#77b26c` | Success |
| Pebble | `#a7a6a9` | Secondary lines |
| Cream | `#fdeccd` | Warm backgrounds, app icon |
