# The `.mind.json` file format

wen2tu saves mind maps as UTF-8 JSON with a small versioned envelope, so files stay readable and can be upgraded safely.

```json
{
  "format": "wen2tu",
  "version": 1,
  "map": {
    "direction": 2,
    "nodeData": {
      "id": "a1b2c3d4e5f60718",
      "topic": "Central topic",
      "children": [
        { "id": "…", "topic": "Child", "expanded": false, "children": [] }
      ]
    },
    "arrows": [{ "id": "…", "label": "depends on", "from": "<node id>", "to": "<node id>" }],
    "summaries": [{ "id": "…", "label": "group", "parent": "<node id>", "start": 0, "end": 1 }]
  }
}
```

## Fields

| Field | Meaning |
| --- | --- |
| `format` | Always `"wen2tu"`. |
| `version` | Format version. The app refuses files newer than it understands and upgrades older ones. |
| `map.direction` | Layout: `0` left, `1` right, `2` both sides, `3` downward. |
| `map.compact` | Optional compact spacing. |
| `map.theme` | Optional color scheme (see below). Omitted when the map follows the system's light/dark setting. |
| `map.shape` | Optional corner shape for the center, first-level and boxed topics: `square`, `rounded` or `pill`. |
| `map.nodeData` | The root node. |
| `map.arrows` | Optional links between any two nodes. |
| `map.summaries` | Optional brackets that summarize a range of siblings (`start`–`end` child indexes of `parent`). |

### Node

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Unique within the file. Missing or duplicate ids are regenerated on load. |
| `topic` | string | Plain text (never HTML). Up to 20,000 characters. |
| `children` | node[] | Child nodes, in order. |
| `expanded` | boolean | `false` when collapsed; omitted otherwise. |
| `direction` | `0` \| `1` | Side of the root for first-level nodes. |
| `style` | object | CSS strings: `fontSize`, `fontFamily`, `color`, `background`, `fontWeight`, `fontStyle`, `width`, `border`, `borderBottom`, `borderRadius`, `padding`, `textDecoration`. |
| `tags` | string[] | Labels shown under the topic. |
| `icons` | string[] | Emoji shown after the topic. |
| `hyperLink` | string | `http:`, `https:` or `mailto:` URL. |
| `note` | string | Free-form note. |
| `branchColor` | string | CSS color of the branch line. |
| `shape` | string | Optional extra shape: `card`, `diamond`, `flag`, `hexagon`, `chamfer`, `note`, `ellipse`, `cloud`, `leaf`, `ticket`, `folder`, `double`, `tag`. Unknown values are ignored (the topic shows as a regular box). |
| `image` | object | `{ url, width, height, fit? }`; `url` must be `https:` or a raster `data:` URL. |

### Theme

```json
{
  "name": "ocean",
  "type": "light",
  "palette": ["#0f7ea8", "#1aa3a3", "#3a86ff"],
  "cssVar": { "--bgcolor": "#f1f7fb", "--root-bgcolor": "#0f4c75", "--root-color": "#ffffff" }
}
```

`name` is a preset id or `"custom"`. `palette` colors are handed to main branches in turn. `cssVar` may only contain these variables: `--bgcolor`, `--color`, `--main-color`, `--main-bgcolor`, `--main-bgcolor-transparent`, `--main-border`, `--main-radius`, `--root-color`, `--root-bgcolor`, `--root-border-color`, `--root-radius`, `--selected`, `--accent-color`, `--panel-color`, `--panel-bgcolor`, `--panel-border-color`.

## Safety rules applied on load

Files are untrusted input. When opening a file the app:

- validates the structure with a schema and rejects files that do not match;
- drops unknown fields (including Mind Elixir's `dangerouslySetInnerHTML`);
- drops links and images with other protocols, and CSS values (in styles and themes) that could load resources;
- drops arrows and summaries that point at missing nodes;
- refuses maps over 50,000 nodes or 500 levels deep, or files over 20 MB.

## Compatibility

- Plain Mind Elixir data (an object with `nodeData` at the top level) is accepted and wrapped in the envelope.
- When the format changes, `version` is increased and a migration is added in `src/features/mindmap/migrations.ts`.
