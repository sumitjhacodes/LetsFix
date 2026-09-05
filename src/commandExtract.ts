/**
 * Extract runnable shell commands from model markdown replies.
 */
export function extractShellCommands(markdown: string): string[] {
  const found: string[] = [];
  const fenceRe =
    /```(?:bash|sh|shell|zsh|fish|powershell|pwsh|ps1|cmd|console|terminal|bat|batch)?\s*\r?\n([\s\S]*?)```/gi;

  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(markdown)) !== null) {
    pushBlock(match[1], found);
  }

  // Fallback: indented `$ command` lines outside fences
  if (found.length === 0) {
    for (const line of markdown.split(/\r?\n/)) {
      const m = line.match(/^\s*(?:[-*]\s+)?\$\s+(.+)$/);
      if (m?.[1]?.trim()) {
        pushCommand(m[1].trim(), found);
      }
    }
  }

  return found;
}

function pushBlock(block: string, found: string[]): void {
  for (const raw of block.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) {
      continue;
    }
    if (line.startsWith('$ ')) {
      line = line.slice(2).trim();
    } else if (line.startsWith('PS>') || line.startsWith('>')) {
      line = line.replace(/^(?:PS>)?>+\s*/, '').trim();
    }
    pushCommand(line, found);
  }
}

function pushCommand(cmd: string, found: string[]): void {
  if (!cmd || found.includes(cmd)) {
    return;
  }
  // Skip obvious non-commands / prose leftovers
  if (cmd.length > 2000) {
    return;
  }
  found.push(cmd);
}
