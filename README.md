# LetsFix

Explain and fix terminal errors in VS Code / Cursor using your own OpenAI-compatible API key.

When a command fails in the integrated terminal, run **LetsFix: Explain Last Error** or **LetsFix: Fix Last Error**. LetsFix sends the last failed command, exit code, output, and light file context to your LLM and streams the answer into the **LetsFix** output channel.

Marketplace ID: `SumitJha2002.letsfix`

## Install

### From VSIX (easiest for local builds)

1. Build the package (see [Develop](#develop)).
2. In VS Code or Cursor: **Extensions** → `⋯` → **Install from VSIX…**
3. Select the generated `letsfix-1.0.3.vsix`.

### From source (Extension Development Host)

1. `npm install`
2. `npm run compile`
3. Press **F5** to launch an Extension Development Host window.

## Setup

1. Command Palette → **LetsFix: Set API Key** — paste an OpenAI-compatible key (stored in Secret Storage, not settings).
2. Optional settings (`Settings` → search `LetsFix`):
   - `fixit.provider.baseUrl` — default `https://api.openai.com/v1`  
     Also works with Groq (`https://api.groq.com/openai/v1`), OpenRouter (`https://openrouter.ai/api/v1`), etc.
   - `fixit.provider.model` — default `gpt-4o-mini`
   - `fixit.maxOutputChars` — truncate huge logs before sending

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
npm run package    # creates letsfix-1.0.3.vsix
```

### Manual smoke checklist

- [ ] Fail a command (`npm run does-not-exist`) → status bar appears → Explain
- [ ] Git error (`git status` in a non-repo / bad flag) → Fix
- [ ] TypeScript compile error → Explain Selection with compiler output
- [ ] Missing API key prompts **Set API Key**, then retries

## Privacy

Your API key stays in the editor’s secret storage. Terminal output and file snippets are sent only to the API base URL you configure. There is no LetsFix backend in v1.

## License

MIT
