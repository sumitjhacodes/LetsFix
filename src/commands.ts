import * as vscode from 'vscode';
import { extractShellCommands } from './commandExtract';
import { buildContext, type FixItMode } from './contextBuilder';
import { MissingApiKeyError, setApiKey, streamChatCompletion } from './llmClient';
import { clearAndShow } from './output';
import { FixPanel } from './fixPanel';
import {
  applyProviderPreset,
  getPreset,
  PROVIDER_PRESETS,
  resolveProvider,
  type ProviderPreset,
} from './providers';
import type { TerminalCapture } from './terminalCapture';

let busy = false;

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

async function chooseProvider(): Promise<ProviderPreset | undefined> {
  const current = resolveProvider();
  const picked = await vscode.window.showQuickPick(
    PROVIDER_PRESETS.map((p) => ({
      label: p.label,
      description: p.id === current.id ? '(current)' : p.defaultModel,
      detail: p.description,
      preset: p,
    })),
    {
      title: 'LetsFix: Choose AI Provider',
      placeHolder: 'OpenAI, Claude, Gemini, Grok, Kimi, Groq, OpenRouter, or Custom…',
      ignoreFocusOut: true,
    }
  );
  if (!picked) {
    return undefined;
  }
  await applyProviderPreset(picked.preset);
  void vscode.window.showInformationMessage(
    `LetsFix provider set to ${picked.preset.label} (${picked.preset.defaultModel}).`
  );
  return picked.preset;
}

async function promptForApiKey(secrets: vscode.SecretStorage): Promise<boolean> {
  let provider = resolveProvider();

  const chooseFirst = await vscode.window.showQuickPick(
    [
      {
        label: `Use current provider: ${provider.label}`,
        description: provider.model,
        action: 'keep' as const,
      },
      {
        label: 'Choose a different provider…',
        description: 'OpenAI, Claude, Gemini, Grok, Kimi, Groq, OpenRouter, Custom',
        action: 'change' as const,
      },
    ],
    {
      title: 'LetsFix: Set API Key',
      placeHolder: 'Which AI provider is this key for?',
      ignoreFocusOut: true,
    }
  );
  if (!chooseFirst) {
    return false;
  }
  if (chooseFirst.action === 'change') {
    const preset = await chooseProvider();
    if (!preset) {
      return false;
    }
    provider = resolveProvider();
  }

  const key = await vscode.window.showInputBox({
    title: `LetsFix: ${provider.label} API Key`,
    prompt: `Paste your ${provider.label} API key (stored securely in Secret Storage)`,
    password: true,
    ignoreFocusOut: true,
    placeHolder: provider.keyPlaceholder,
  });
  if (!key?.trim()) {
    return false;
  }
  await setApiKey(secrets, key);
  void vscode.window.showInformationMessage(`LetsFix API key saved for ${provider.label}.`);
  return true;
}

async function promptForModel(): Promise<void> {
  const provider = resolveProvider();
  const preset = getPreset(provider.id);
  const model = await vscode.window.showInputBox({
    title: `LetsFix: Model (${provider.label})`,
    prompt: 'Model id for explain/fix requests',
    value: provider.model,
    ignoreFocusOut: true,
    placeHolder: preset.defaultModel,
  });
  if (!model?.trim()) {
    return;
  }
  await vscode.workspace
    .getConfiguration('fixit')
    .update('provider.model', model.trim(), vscode.ConfigurationTarget.Global);
  void vscode.window.showInformationMessage(`LetsFix model set to ${model.trim()}.`);
}

export async function runMode(
  mode: FixItMode,
  capture: TerminalCapture,
  secrets: vscode.SecretStorage,
  options: { selectionOnly?: boolean; quiet?: boolean } = {}
): Promise<void> {
  if (busy) {
    if (!options.quiet) {
      void vscode.window.showInformationMessage('LetsFix is already working on a request.');
    }
    return;
  }

  let source:
    | { kind: 'command'; command: NonNullable<ReturnType<TerminalCapture['getBestForExplain']>> }
    | { kind: 'selection'; text: string }
    | undefined;

  if (options.selectionOnly) {
    const text = getEditorOrTerminalSelection();
    if (!text?.trim()) {
      if (!options.quiet) {
        void vscode.window.showWarningMessage(
          'LetsFix: select error text in the editor (or copy it into an editor) first, then run Explain Selection.'
        );
      }
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
    if (!options.quiet) {
      void vscode.window.showWarningMessage(
        'LetsFix: no terminal error captured yet. Run a failing command in the integrated terminal (with shell integration), or select error text and use Explain Selection.'
      );
    }
    return;
  }

  busy = true;
  const provider = resolveProvider();
  const ctx = await buildContext(mode, source);
  const title = mode === 'explain' ? 'LetsFix — Explain' : 'LetsFix — Fix';
  const out = clearAndShow(title);

  out.appendLine(`Provider: ${provider.label} · Model: ${provider.model}`);
  if (source.kind === 'command') {
    out.appendLine(`Command: ${source.command.commandLine || '(unknown)'}`);
    if (source.command.exitCode !== undefined) {
      out.appendLine(`Exit code: ${source.command.exitCode}`);
    }
  }
  out.appendLine('');
  out.appendLine('Thinking…');
  out.appendLine('');

  const controller = new AbortController();
  let fullReply = '';

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
            fullReply += chunk;
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

    const commands = extractShellCommands(fullReply);
    if (commands.length > 0) {
      FixPanel.show(
        mode === 'fix' ? 'LetsFix — Suggested fixes' : 'LetsFix — Suggested commands',
        fullReply,
        commands
      );
    }
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      if (options.quiet) {
        return;
      }
      const set = await vscode.window.showWarningMessage(err.message, 'Set API Key');
      if (set === 'Set API Key') {
        const ok = await promptForApiKey(secrets);
        if (ok) {
          busy = false;
          await runMode(mode, capture, secrets, options);
        }
      }
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    out.appendLine(`\n\nError: ${message}`);
    if (!options.quiet) {
      void vscode.window.showErrorMessage(`LetsFix: ${message}`);
    }
  } finally {
    busy = false;
  }
}

const NOISY_COMMANDS = /^(clear|cls|ls|dir|pwd|cd|echo|type|cat|which|where)\b/i;

export function shouldAutoExplain(commandLine: string): boolean {
  const trimmed = commandLine.trim();
  if (!trimmed) {
    return false;
  }
  if (NOISY_COMMANDS.test(trimmed)) {
    return false;
  }
  return true;
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
    vscode.commands.registerCommand('fixit.setApiKey', () => promptForApiKey(secrets)),
    vscode.commands.registerCommand('fixit.chooseProvider', () => chooseProvider()),
    vscode.commands.registerCommand('fixit.setModel', () => promptForModel())
  );
}
