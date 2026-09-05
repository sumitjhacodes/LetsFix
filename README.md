# LetsFix

Explain and fix terminal errors in VS Code / Cursor using **your own** API key — OpenAI, Claude, Gemini, Grok, Kimi, Groq, OpenRouter, or any OpenAI-compatible endpoint.

When a command fails, LetsFix explains it, suggests fixes, and — when the reply includes shell commands — opens an **Actions** panel with **Copy** and **Run in terminal** (with confirmation).

Marketplace ID: `SumitJha2002.letsfix`

## 30-second setup

1. Install **LetsFix** from Extensions (or the VSIX below).
2. Command Palette → **LetsFix: Choose AI Provider** → pick OpenAI / Claude / Gemini / Grok / …
3. **LetsFix: Set API Key** → paste that provider’s key.
4. Fail a command in the integrated terminal → click the status bar, or press `Ctrl+Alt+E` / `Ctrl+Alt+F`.
5. If suggested commands appear, use **Copy** or **Run in terminal** in the Actions panel.

## Install

### From VSIX (local builds)

1. `npm run package`
2. Extensions → **Install from VSIX…** → `letsfix-1.2.0.vsix`

### From source

1. `npm install`
2. `npm run compile`
3. Press **F5** (Extension Development Host)

## Features (1.2.0)

- **Multi-provider** — OpenAI, Claude, Gemini, Grok, Kimi, Groq, OpenRouter, Custom
- **Actions panel** — Copy / Run suggested shell commands from Fix (and Explain when commands are detected)
- **Auto-explain on fail** — opt-in via `fixit.autoExplainOnFail`
- **Context menus** — right-click selection in the editor, or the terminal tab/context, for Explain / Fix
- **Status bar** after non-zero exit codes

## Settings

| Setting | Purpose |
|---------|---------|
| `fixit.provider.id` | Provider preset |
| `fixit.provider.baseUrl` | API base URL |
| `fixit.provider.model` | Model id |
| `fixit.maxOutputChars` | Truncate huge logs |
| `fixit.autoExplainOnFail` | Auto-run Explain after a failed command (default off) |

## Usage

| Action | How |
|--------|-----|
| Explain last failed command | **LetsFix: Explain Last Error** (`Ctrl+Alt+E`) |
| Suggest a fix | **LetsFix: Fix Last Error** (`Ctrl+Alt+F`) |
| Explain selection | Select text → right-click → **LetsFix: Explain Selection** |
| Terminal menu | Right-click terminal → Explain / Fix |
| Status bar | Click **LetsFix: error — click to explain** |

Full answers still stream in **View → Output → LetsFix**. Runnable commands also open **LetsFix Actions**.

### Shell integration

Requires VS Code / Cursor ≥ 1.93 with terminal shell integration enabled. If nothing was captured, paste the error into an editor and use **Explain Selection**.

## Develop

```bash
npm install
npm run compile
npm run package    # creates letsfix-1.2.0.vsix
```

### Smoke checklist

- [ ] Fail a command → status bar → Explain → Actions panel if commands present
- [ ] Fix → **Run in terminal** confirms before sending
- [ ] Enable `fixit.autoExplainOnFail` → fail again → Explain runs automatically
- [ ] Editor selection context menu → Explain Selection
- [ ] Switch Gemini/Claude → Set API Key → still works

## Privacy

API keys stay in Secret Storage. Terminal output is sent only to the provider you configure. No LetsFix backend.

## License

MIT
