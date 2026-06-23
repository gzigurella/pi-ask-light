# pi-ask-light

**Lightweight `ask_user` tool for [pi coding agent](https://pi.dev).**

Uses pi's built-in `ctx.ui` methods (`select`, `confirm`, `input`) instead of custom TUI overlay rendering. **Zero extra dependencies, ~180 lines, no lag.**

## Why

The original [`pi-ask-user`](https://github.com/edlsh/pi-ask-user) is 64KB / 1800+ lines with heavy imports (`@sinclair/typebox`, full TUI components, fuzzy filtering, custom layout engine). This causes noticeable lag when loading and executing.

`pi-ask-light` does the same thing in **7KB / 180 lines** using only pi's built-in UI primitives. No lag, no bloat.

## Install

```bash
pi install git:https://github.com/<your-username>/pi-ask-light
```

Or manually:

```bash
mkdir -p ~/.pi/agent/extensions
curl -o ~/.pi/agent/extensions/ask-light.ts https://raw.githubusercontent.com/<your-username>/pi-ask-light/main/index.ts
```

Restart pi to load the extension.

## Usage

The tool is automatically available to pi as `ask_user`. The LLM calls it with these parameters:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `question` | `string` | required | Question to show the user |
| `context` | `string` | — | Brief summary shown above the question |
| `options` | `string[] | object[]` | — | Multiple choice options |
| `allowMultiple` | `boolean` | `false` | Allow selecting multiple options |
| `allowFreeform` | `boolean` | `true` | Add "Write custom answer" option |
| `allowComment` | `boolean` | `false` | Add optional comment field |

### Examples

**Single select with custom answer:**
```
ask_user({
  question: "Which approach should we use?",
  options: ["REST API", "GraphQL", "gRPC"],
  allowFreeform: true
})
```

**Multi-select:**
```
ask_user({
  question: "Which files need review?",
  options: ["auth.ts", "api.ts", "db.ts"],
  allowMultiple: true
})
```

**Freeform only (no options):**
```
ask_user({ question: "Describe the bug you found" })
```

## How it works

The tool uses pi's built-in `ctx.ui.select()`, `ctx.ui.input()` methods directly. No custom rendering, no overlay components, no fuzzy filter — just the primitives pi already provides.

## Comparison

| | `pi-ask-user` | `pi-ask-light` |
|---|---|---|
| Size | 64KB / 1800+ lines | **7KB / 180 lines** |
| Dependencies | typebox, pi-tui (Container, Editor, Markdown, fuzzyFilter...), single-select-layout | **typebox only** |
| UI | Custom overlay with manual rendering | **ctx.ui built-in methods** |
| Load time | Slow (jiti parses 64KB + deps) | **Fast (parses 7KB)** |
| Runtime | Noticeable lag on each call | **Instant** |

## License

MIT
