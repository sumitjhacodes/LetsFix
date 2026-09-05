# LetsFix

Explain and fix terminal errors in VS Code / Cursor using **your own** API key — OpenAI, Claude, Gemini, Grok, Kimi, Groq, OpenRouter, or any OpenAI-compatible endpoint.

When a command fails in the integrated terminal, run **LetsFix: Explain Last Error** or **LetsFix: Fix Last Error**. LetsFix sends the last failed command, exit code, output, and light file context to your LLM and streams the answer into the **LetsFix** output channel.

Marketplace ID: `SumitJha2002.letsfix`

## Install

### From VSIX (easiest for local builds)

1. Build the package (see [Develop](#develop)).
2. In VS Code or Cursor: **Extensions** → `⋯` → **Install from VSIX…**
3. Select the generated `letsfix-1.1.0.vsix`.

### From source (Extension Development Host)

1. `npm install`
2. `npm run compile`
3. Press **F5** to launch an Extension Development Host window.

## Setup

1. Command Palette → **LetsFix: Choose AI Provider**  
   Pick OpenAI, Anthropic (Claude), Google (Gemini), xAI (Grok), Moonshot (Kimi), Groq, OpenRouter, or Custom.
2. Command Palette → **LetsFix: Set API Key** — paste that provider’s key (stored in Secret Storage).
3. Optional: **LetsFix: Set Model** or Settings → search `LetsFix`:
   - `fixit.provider.id` — provider preset
   - `fixit.provider.baseUrl` — auto-filled; override for Custom
   - `fixit.provider.model` — e.g. `gpt-4o-mini`, `claude-sonnet-4-5`, `gemini-2.0-flash`
   - `fixit.maxOutputChars` — truncate huge logs before sending

### Supported providers

| Provider | API style | Notes |
|----------|-----------|--------|
| OpenAI | OpenAI chat completions | Default |
| Anthropic (Claude) | Native Messages API | Uses your Anthropic key |
| Google (Gemini) | Native Gemini stream API | Google AI Studio key |
| xAI (Grok) | OpenAI-compatible | `api.x.ai` |
| Moonshot (Kimi) | OpenAI-compatible | `api.moonshot.ai` |
| Groq | OpenAI-compatible | Fast inference |
| OpenRouter | OpenAI-compatible | One key → many models |
| Custom | OpenAI-compatible | Any `/chat/completions` base URL |

## Usage

| Action | How |
|--------|-----|
| Explain last failed command | Command Palette → **LetsFix: Explain Last Error** (or `Ctrl+Alt+E` / `Cmd+Alt+E`) |
| Suggest a fix | **LetsFix: Fix Last Error** (`Ctrl+Alt+F` / `Cmd+Alt+F`) |
| Explain selected text | Select error text in an editor → **LetsFix: Explain Selection** |
| Status bar | After a non-zero exit, click **LetsFix: error — click to explain** |

Answers appear in **View → Output → LetsFix**.

### Shell integration

LetsFix uses the VS Code **Terminal Shell Integration** API (requires VS Code / Cursor ≥ 1.93). Keep shell integration enabled so command exit codes and output are captured. If nothing was captured yet, use **Explain Selection** with pasted error text.

## Develop

```bash
npm install
npm run compile
npm run package    # creates letsfix-1.1.0.vsix
```

### Manual smoke checklist

- [ ] Fail a command (`npm run does-not-exist`) → status bar appears → Explain
- [ ] Switch provider (Gemini / Claude) → Set API Key → Explain still works
- [ ] Git error (`git status` in a non-repo / bad flag) → Fix
- [ ] TypeScript compile error → Explain Selection with compiler output
- [ ] Missing API key prompts **Set API Key**, then retries

## Privacy

Your API key stays in the editor’s secret storage. Terminal output and file snippets are sent only to the API base URL for the provider you chose. There is no LetsFix backend.

## License

MIT
