import * as vscode from 'vscode';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function runInTerminal(command: string): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(
    `Run this command in the terminal?\n\n${command}`,
    { modal: true },
    'Run'
  );
  if (confirm !== 'Run') {
    return;
  }

  let terminal = vscode.window.activeTerminal;
  if (!terminal) {
    terminal = vscode.window.createTerminal('LetsFix');
  }
  terminal.show(true);
  terminal.sendText(command, true);
}

export class FixPanel {
  public static current: FixPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      async (message: { type?: string; command?: string }) => {
        if (!message.command) {
          return;
        }
        if (message.type === 'copy') {
          await vscode.env.clipboard.writeText(message.command);
          void vscode.window.showInformationMessage('LetsFix: command copied.');
          return;
        }
        if (message.type === 'run') {
          await runInTerminal(message.command);
        }
      },
      null,
      this.disposables
    );
  }

  static show(title: string, replyMarkdown: string, commands: string[]): void {
    if (commands.length === 0) {
      return;
    }

    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.Beside;

    if (FixPanel.current) {
      FixPanel.current.panel.reveal(column);
      FixPanel.current.render(title, replyMarkdown, commands);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'letsfixFixPanel',
      'LetsFix Actions',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );
    FixPanel.current = new FixPanel(panel);
    FixPanel.current.render(title, replyMarkdown, commands);
  }

  private render(title: string, replyMarkdown: string, commands: string[]): void {
    this.panel.title = title;
    const preview = replyMarkdown.trim().slice(0, 1200);
    const commandRows = commands
      .map((cmd, index) => {
        const safe = escapeHtml(cmd);
        const payload = escapeHtml(JSON.stringify(cmd));
        return `<div class="cmd">
  <pre>${safe}</pre>
  <div class="actions">
    <button data-action="copy" data-cmd="${payload}">Copy</button>
    <button class="primary" data-action="run" data-cmd="${payload}">Run in terminal</button>
  </div>
  <div class="meta">Command ${index + 1} of ${commands.length}</div>
</div>`;
      })
      .join('\n');

    this.panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      color-scheme: light dark;
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --muted: var(--vscode-descriptionForeground);
      --border: var(--vscode-widget-border, #444);
      --btn: var(--vscode-button-background);
      --btnFg: var(--vscode-button-foreground);
      --btn2: var(--vscode-button-secondaryBackground);
      --btn2Fg: var(--vscode-button-secondaryForeground);
      --code: var(--vscode-textCodeBlock-background, rgba(127,127,127,.15));
    }
    body {
      font-family: var(--vscode-font-family);
      color: var(--fg);
      background: var(--bg);
      padding: 16px;
      line-height: 1.45;
    }
    h1 { font-size: 1.1rem; margin: 0 0 8px; }
    .hint { color: var(--muted); font-size: 0.9rem; margin-bottom: 16px; }
    .preview {
      white-space: pre-wrap;
      background: var(--code);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px 12px;
      margin-bottom: 16px;
      max-height: 180px;
      overflow: auto;
      font-size: 0.85rem;
    }
    .cmd {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
    }
    pre {
      margin: 0 0 10px;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.9rem;
    }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    button {
      border: none;
      border-radius: 4px;
      padding: 6px 12px;
      cursor: pointer;
      background: var(--btn2);
      color: var(--btn2Fg);
      font: inherit;
    }
    button.primary {
      background: var(--btn);
      color: var(--btnFg);
    }
    .meta { margin-top: 8px; color: var(--muted); font-size: 0.8rem; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="hint">Review suggested commands, then Copy or Run (with confirmation).</p>
  <div class="preview">${escapeHtml(preview)}${replyMarkdown.length > 1200 ? '\n…' : ''}</div>
  ${commandRows}
  <script>
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action');
        const cmd = JSON.parse(btn.getAttribute('data-cmd') || '""');
        vscode.postMessage({ type: action, command: cmd });
      });
    });
  </script>
</body>
</html>`;
  }

  dispose(): void {
    FixPanel.current = undefined;
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}
