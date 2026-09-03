import * as vscode from 'vscode';

export interface CapturedCommand {
  commandLine: string;
  cwd?: string;
  exitCode: number | undefined;
  output: string;
  endedAt: number;
}

const MAX_BUFFER = 20;
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}

export class TerminalCapture {
  private readonly buffer: CapturedCommand[] = [];
  private readonly inFlight = new Map<object, { chunks: string[]; commandLine: string; cwd?: string }>();
  private readonly statusBar: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBar.command = 'fixit.explainLastError';
    this.statusBar.hide();
  }

  start(): void {
    this.disposables.push(
      vscode.window.onDidStartTerminalShellExecution(async (event) => {
        const execution = event.execution;
        const key = execution as object;
        const state = {
          chunks: [] as string[],
          commandLine: execution.commandLine?.value ?? '',
          cwd: execution.cwd?.fsPath,
        };
        this.inFlight.set(key, state);

        try {
          const stream = execution.read();
          for await (const data of stream) {
            state.chunks.push(data);
          }
        } catch {
          // Stream may end abruptly when the terminal closes; keep what we have.
        }
      }),
      vscode.window.onDidEndTerminalShellExecution((event) => {
        const execution = event.execution;
        const key = execution as object;
        const state = this.inFlight.get(key);
        this.inFlight.delete(key);

        const output = stripAnsi((state?.chunks ?? []).join('')).trim();
        const entry: CapturedCommand = {
          commandLine: state?.commandLine || execution.commandLine?.value || '',
          cwd: state?.cwd ?? execution.cwd?.fsPath,
          exitCode: event.exitCode,
          output,
          endedAt: Date.now(),
        };

        this.buffer.push(entry);
        if (this.buffer.length > MAX_BUFFER) {
          this.buffer.shift();
        }
        this.updateStatusBar(entry);
      }),
      this.statusBar
    );
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this.inFlight.clear();
    this.buffer.length = 0;
  }

  getLastFailed(): CapturedCommand | undefined {
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      const entry = this.buffer[i];
      if (entry.exitCode !== undefined && entry.exitCode !== 0) {
        return entry;
      }
    }
    return undefined;
  }

  getLast(): CapturedCommand | undefined {
    return this.buffer[this.buffer.length - 1];
  }

  getBestForExplain(): CapturedCommand | undefined {
    return this.getLastFailed() ?? this.getLast();
  }

  private updateStatusBar(entry: CapturedCommand): void {
    if (entry.exitCode !== undefined && entry.exitCode !== 0) {
      this.statusBar.text = '$(error) FixIt: error — click to explain';
      this.statusBar.tooltip = `Last failed: ${entry.commandLine || '(unknown command)'} (exit ${entry.exitCode})`;
      this.statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      this.statusBar.show();
    } else {
      this.statusBar.hide();
    }
  }
}
