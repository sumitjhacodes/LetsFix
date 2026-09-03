import * as vscode from 'vscode';
import { buildContext, type FixItMode } from './contextBuilder';
import { MissingApiKeyError, setApiKey, streamChatCompletion } from './llmClient';
import { clearAndShow } from './output';
import type { TerminalCapture } from './terminalCapture';

function getEditorOrTerminalSelection(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const text = editor.document.getText(editor.selection);
    if (text.trim()) {
      return text;
    }
  }
  return undefined;
}

async function promptForApiKey(secrets: vscode.SecretStorage): Promise<boolean> {
  const key = await vscode.window.showInputBox({
    title: 'LetsFix: Set API Key',
    prompt: 'Enter your OpenAI-compatible API key (stored securely in VS Code Secret Storage)',
    password: true,
    ignoreFocusOut: true,
    placeHolder: 'sk-...',
  });
  if (!key?.trim()) {
    return false;
  }
  await setApiKey(secrets, key);
  void vscode.window.showInformationMessage('LetsFix API key saved.');
  return true;
}

async function runMode(
  mode: FixItMode,
  capture: TerminalCapture,
  secrets: vscode.SecretStorage,
  options: { selectionOnly?: boolean } = {}
): Promise<void> {
  let source:
    | { kind: 'command'; command: NonNullable<ReturnType<TerminalCapture['getBestForExplain']>> }
    | { kind: 'selection'; text: string }
    | undefined;

  if (options.selectionOnly) {
    const text = getEditorOrTerminalSelection();
    if (!text?.trim()) {
      void vscode.window.showWarningMessage(
        'LetsFix: select error text in the editor (or copy it into an editor) first, then run Explain Selection.'
      );
      return;
    }
    source = { kind: 'selection', text };
  } else {
    const command = capture.getBestForExplain();
    if (command && (command.output || command.commandLine)) {
      source = { kind: 'command', command };
    } else {
      const text = getEditorOrTerminalSelection();
      if (text?.trim()) {
        source = { kind: 'selection', text };
      }
    }
  }

  if (!source) {
    void vscode.window.showWarningMessage(
      'LetsFix: no terminal error captured yet. Run a failing command in the integrated terminal (with shell integration), or select error text and use Explain Selection.'
    );
    return;
  }

  const ctx = await buildContext(mode, source);
  const title =
    mode === 'explain'
      ? 'LetsFix — Explain'
      : 'LetsFix — Fix';
  const out = clearAndShow(title);

  if (source.kind === 'command') {
    out.appendLine(`Command: ${source.command.commandLine || '(unknown)'}`);
    if (source.command.exitCode !== undefined) {
      out.appendLine(`Exit code: ${source.command.exitCode}`);
    }
    out.appendLine('');
  }

  out.appendLine('Thinking…');
  out.appendLine('');

  const controller = new AbortController();

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: mode === 'explain' ? 'LetsFix is explaining…' : 'LetsFix is drafting a fix…',
        cancellable: true,
      },
      async (_progress, token) => {
        token.onCancellationRequested(() => controller.abort());

        try {
          for await (const chunk of streamChatCompletion(
            secrets,
            [
              { role: 'system', content: ctx.systemPrompt },
              { role: 'user', content: ctx.userPrompt },
            ],
            controller.signal
          )) {
            out.append(chunk);
          }
          out.appendLine('');
          out.appendLine('');
          out.appendLine('─ Done');
        } catch (err) {
          if (controller.signal.aborted) {
            out.appendLine('\n\n[Cancelled]');
            return;
          }
          throw err;
        }
      }
    );
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      const set = await vscode.window.showWarningMessage(err.message, 'Set API Key');
      if (set === 'Set API Key') {
        const ok = await promptForApiKey(secrets);
        if (ok) {
          await runMode(mode, capture, secrets, options);
        }
      }
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    out.appendLine(`\n\nError: ${message}`);
    void vscode.window.showErrorMessage(`LetsFix: ${message}`);
  }
}

export function registerCommands(
  context: vscode.ExtensionContext,
  capture: TerminalCapture
): void {
  const secrets = context.secrets;

  context.subscriptions.push(
    vscode.commands.registerCommand('fixit.explainLastError', () =>
      runMode('explain', capture, secrets)
    ),
    vscode.commands.registerCommand('fixit.fixLastError', () => runMode('fix', capture, secrets)),
    vscode.commands.registerCommand('fixit.explainSelection', () =>
      runMode('explain', capture, secrets, { selectionOnly: true })
    ),
    vscode.commands.registerCommand('fixit.setApiKey', () => promptForApiKey(secrets))
  );
}
