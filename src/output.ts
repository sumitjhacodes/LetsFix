import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel('FixIt');
  }
  return channel;
}

export function disposeOutputChannel(): void {
  channel?.dispose();
  channel = undefined;
}

export function clearAndShow(title: string): vscode.OutputChannel {
  const out = getOutputChannel();
  out.clear();
  out.appendLine(title);
  out.appendLine('─'.repeat(Math.min(60, title.length)));
  out.appendLine('');
  out.show(true);
  return out;
}
