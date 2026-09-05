import * as vscode from 'vscode';
import * as path from 'path';
import type { CapturedCommand } from './terminalCapture';

export type FixItMode = 'explain' | 'fix';

const PATH_IN_OUTPUT =
  /(?:^|[\s("'`])((?:[A-Za-z]:)?[^\s"'`()[\]{}:]+?\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|cs|cpp|c|h|rb|php|swift|json|toml|yaml|yml|md))(?::(\d+))?(?::(\d+))?/gm;

export interface BuiltContext {
  mode: FixItMode;
  userPrompt: string;
  systemPrompt: string;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}\n\n…[truncated ${text.length - max} chars]`;
}

async function gatherFileSnippets(output: string, maxFiles = 3, maxLines = 40): Promise<string> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    return '';
  }

  const root = folders[0].uri.fsPath;
  const seen = new Set<string>();
  const snippets: string[] = [];

  let match: RegExpExecArray | null;
  PATH_IN_OUTPUT.lastIndex = 0;
  while ((match = PATH_IN_OUTPUT.exec(output)) !== null && snippets.length < maxFiles) {
    const relOrAbs = match[1];
    const lineNum = match[2] ? Number(match[2]) : undefined;
    const abs = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(root, relOrAbs);
    const normalized = path.normalize(abs);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);

    try {
      const uri = vscode.Uri.file(normalized);
      const doc = await vscode.workspace.openTextDocument(uri);
      const start = lineNum ? Math.max(0, lineNum - 8) : 0;
      const end = lineNum ? Math.min(doc.lineCount, lineNum + 8) : Math.min(doc.lineCount, maxLines);
      const lines: string[] = [];
      for (let i = start; i < end; i++) {
        lines.push(`${i + 1}| ${doc.lineAt(i).text}`);
      }
      const label = vscode.workspace.asRelativePath(uri);
      snippets.push(`### ${label}${lineNum ? ` (around line ${lineNum})` : ''}\n\`\`\`\n${lines.join('\n')}\n\`\`\``);
    } catch {
      // File may not exist in workspace; skip.
    }
  }

  return snippets.join('\n\n');
}

function systemPromptFor(mode: FixItMode): string {
  if (mode === 'explain') {
    return [
      'You are LetsFix, a helpful assistant that explains terminal and build errors.',
      'Explain what failed and why in plain English.',
      'Suggest what to check next.',
      'If you recommend shell commands, put each in a fenced code block tagged bash or powershell.',
      'Do not invent secrets, credentials, or private data.',
      'Keep the answer concise and practical.',
    ].join(' ');
  }
  return [
    'You are LetsFix, a helpful assistant that fixes terminal and build errors.',
    'Give concrete steps and exact commands when safe.',
    'Put every runnable shell command in its own fenced code block tagged bash or powershell (no prose inside the fence).',
    'Never invent secrets or credentials; say when more information is needed.',
    'Do not claim you already ran commands or edited files.',
    'Prefer the smallest safe fix. Keep the answer concise and actionable.',
  ].join(' ');
}

export async function buildContext(
  mode: FixItMode,
  source: { kind: 'command'; command: CapturedCommand } | { kind: 'selection'; text: string }
): Promise<BuiltContext> {
  const config = vscode.workspace.getConfiguration('fixit');
  const maxChars = config.get<number>('maxOutputChars', 12000);

  let body: string;
  if (source.kind === 'command') {
    const c = source.command;
    const output = truncate(c.output || '(no output captured)', maxChars);
    const snippets = await gatherFileSnippets(c.output || '');
    body = [
      `Mode: ${mode}`,
      `Command: ${c.commandLine || '(unknown)'}`,
      `Working directory: ${c.cwd || '(unknown)'}`,
      `Exit code: ${c.exitCode === undefined ? '(unknown)' : c.exitCode}`,
      '',
      'Terminal output:',
      '```',
      output,
      '```',
      snippets ? `\nRelevant files:\n${snippets}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  } else {
    const text = truncate(source.text.trim(), maxChars);
    const snippets = await gatherFileSnippets(text);
    body = [
      `Mode: ${mode}`,
      'The user selected this error text:',
      '```',
      text,
      '```',
      snippets ? `\nRelevant files:\n${snippets}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return {
    mode,
    systemPrompt: systemPromptFor(mode),
    userPrompt: body,
  };
}
