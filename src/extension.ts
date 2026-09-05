import * as vscode from 'vscode';
import { registerCommands, runMode, shouldAutoExplain } from './commands';
import { disposeOutputChannel } from './output';
import { TerminalCapture } from './terminalCapture';

let capture: TerminalCapture | undefined;

export function activate(context: vscode.ExtensionContext): void {
  capture = new TerminalCapture();
  capture.start();

  capture.setFailureHandler((entry) => {
    const auto = vscode.workspace.getConfiguration('fixit').get<boolean>('autoExplainOnFail', false);
    if (!auto) {
      return;
    }
    if (!shouldAutoExplain(entry.commandLine)) {
      return;
    }
    void runMode('explain', capture!, context.secrets, { quiet: true });
  });

  context.subscriptions.push({
    dispose: () => {
      capture?.dispose();
      capture = undefined;
    },
  });

  registerCommands(context, capture);
}

export function deactivate(): void {
  capture?.dispose();
  capture = undefined;
  disposeOutputChannel();
}
