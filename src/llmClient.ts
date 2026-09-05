import * as vscode from 'vscode';
import { resolveProvider, type ApiStyle } from './providers';

export const API_KEY_SECRET = 'fixit.apiKey';

export class MissingApiKeyError extends Error {
  constructor() {
    super('LetsFix API key is not set. Run "LetsFix: Set API Key" first.');
    this.name = 'MissingApiKeyError';
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
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

async function readErrorDetail(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '';
  }
}

function throwHttpError(response: Response, detail: string): never {
  throw new Error(
    `LLM request failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ''}`
  );
}

async function* parseOpenAiSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
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
        // skip malformed chunk
      }
    }
  }
}

async function* streamOpenAiCompatible(
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
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
    throwHttpError(response, await readErrorDetail(response));
  }
  if (!response.body) {
    throw new Error('LLM response had no body (streaming unsupported by this provider URL).');
  }
  yield* parseOpenAiSse(response.body);
}

async function* streamAnthropic(
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const chatMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.2,
      system: system || undefined,
      messages: chatMessages,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    throwHttpError(response, await readErrorDetail(response));
  }
  if (!response.body) {
    throw new Error('Anthropic response had no body.');
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
      if (!line.startsWith('data:')) {
        continue;
      }
      const data = line.slice(5).trim();
      if (!data) {
        continue;
      }
      try {
        const parsed = JSON.parse(data) as {
          type?: string;
          delta?: { type?: string; text?: string };
        };
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          yield parsed.delta.text;
        }
      } catch {
        // skip
      }
    }
  }
}

async function* streamGoogle(
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const url = `${baseUrl}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents,
      generationConfig: { temperature: 0.2 },
    }),
    signal,
  });

  if (!response.ok) {
    throwHttpError(response, await readErrorDetail(response));
  }
  if (!response.body) {
    throw new Error('Gemini response had no body.');
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
      if (!line.startsWith('data:')) {
        continue;
      }
      const data = line.slice(5).trim();
      if (!data) {
        continue;
      }
      try {
        const parsed = JSON.parse(data) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = parsed.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('');
        if (text) {
          yield text;
        }
      } catch {
        // skip
      }
    }
  }
}

/**
 * Streams a chat completion from the configured provider (OpenAI, Claude, Gemini, Grok, Kimi, …).
 */
export async function* streamChatCompletion(
  secrets: vscode.SecretStorage,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const apiKey = await getApiKey(secrets);
  const provider = resolveProvider();
  const style: ApiStyle = provider.apiStyle;

  if (style === 'anthropic') {
    yield* streamAnthropic(apiKey, provider.baseUrl, provider.model, messages, signal);
    return;
  }
  if (style === 'google') {
    yield* streamGoogle(apiKey, provider.baseUrl, provider.model, messages, signal);
    return;
  }
  yield* streamOpenAiCompatible(apiKey, provider.baseUrl, provider.model, messages, signal);
}

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
