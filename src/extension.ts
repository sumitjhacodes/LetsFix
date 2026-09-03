import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { disposeOutputChannel } from './output';
import { TerminalCapture } from './terminalCapture';

let capture: TerminalCapture | undefined;

export function activate(context: vscode.ExtensionContext): void {
  capture = new TerminalCapture();
  capture.start();
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
