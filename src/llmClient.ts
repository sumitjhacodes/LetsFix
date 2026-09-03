import * as vscode from 'vscode';

export const API_KEY_SECRET = 'fixit.apiKey';

export class MissingApiKeyError extends Error {
  constructor() {
    super('FixIt API key is not set. Run "FixIt: Set API Key" first.');
    this.name = 'MissingApiKeyError';
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ProviderConfig {
  baseUrl: string;
  model: string;
}

function getProviderConfig(): ProviderConfig {
  const config = vscode.workspace.getConfiguration('fixit');
  const baseUrl = (config.get<string>('provider.baseUrl') || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = config.get<string>('provider.model') || 'gpt-4o-mini';
  return { baseUrl, model };
}

export async function getApiKey(secrets: vscode.SecretStorage): Promise<string> {
  const key = await secrets.get(API_KEY_SECRET);
  if (!key?.trim()) {
    throw new MissingApiKeyError();
  }
  return key.trim();
}

export async function setApiKey(secrets: vscode.SecretStorage, key: string): Promise<void> {
  await secrets.store(API_KEY_SECRET, key.trim());
}

/**
 * Streams an OpenAI-compatible chat completion. Yields text deltas.
 */
export async function* streamChatCompletion(
  secrets: vscode.SecretStorage,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const apiKey = await getApiKey(secrets);
  const { baseUrl, model } = getProviderConfig();
  const url = `${baseUrl}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.2,
    }),
    signal,
  });

  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch {
      // ignore
    }
    throw new Error(
      `LLM request failed (${response.status} ${response.statusText})${detail ? `: ${detail.slice(0, 500)}` : ''}`
    );
  }

  if (!response.body) {
    throw new Error('LLM response had no body (streaming unsupported by this provider URL).');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || !line.startsWith('data:')) {
        continue;
      }
      const data = line.slice(5).trim();
      if (data === '[DONE]') {
        return;
      }
      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
        };
        const delta = parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content;
        if (delta) {
          yield delta;
        }
      } catch {
        // Skip malformed SSE chunks
      }
    }
  }
}

/** Non-streaming fallback if needed later; also useful for tests. */
export async function chatCompletion(
  secrets: vscode.SecretStorage,
  messages: ChatMessage[],
  signal?: AbortSignal
): Promise<string> {
  const parts: string[] = [];
  for await (const chunk of streamChatCompletion(secrets, messages, signal)) {
    parts.push(chunk);
  }
  return parts.join('');
}
