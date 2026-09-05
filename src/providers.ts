import * as vscode from 'vscode';

export type ApiStyle = 'openai' | 'anthropic' | 'google';

export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'groq'
  | 'xai'
  | 'moonshot'
  | 'openrouter'
  | 'custom';

export interface ProviderPreset {
  id: ProviderId;
  label: string;
  description: string;
  apiStyle: ApiStyle;
  baseUrl: string;
  defaultModel: string;
  keyPlaceholder: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'GPT models (api.openai.com)',
    apiStyle: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    description: 'Claude models (api.anthropic.com)',
    apiStyle: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-5',
    keyPlaceholder: 'sk-ant-...',
  },
  {
    id: 'google',
    label: 'Google (Gemini)',
    description: 'Gemini models (Google AI Studio)',
    apiStyle: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    keyPlaceholder: 'AIza...',
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    description: 'Grok models (api.x.ai)',
    apiStyle: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-2-latest',
    keyPlaceholder: 'xai-...',
  },
  {
    id: 'moonshot',
    label: 'Moonshot (Kimi)',
    description: 'Kimi / Moonshot models',
    apiStyle: 'openai',
    baseUrl: 'https://api.moonshot.ai/v1',
    defaultModel: 'moonshot-v1-8k',
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'groq',
    label: 'Groq',
    description: 'Fast OpenAI-compatible inference',
    apiStyle: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    keyPlaceholder: 'gsk_...',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    description: 'One key for many models (Claude, Gemini, GPT, …)',
    apiStyle: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    keyPlaceholder: 'sk-or-...',
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    description: 'Any endpoint that speaks /chat/completions',
    apiStyle: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    keyPlaceholder: 'your-api-key',
  },
];

export function getPreset(id: string | undefined): ProviderPreset {
  return PROVIDER_PRESETS.find((p) => p.id === id) ?? PROVIDER_PRESETS[0];
}

export interface ResolvedProvider {
  id: ProviderId;
  label: string;
  apiStyle: ApiStyle;
  baseUrl: string;
  model: string;
  keyPlaceholder: string;
}

/** Resolve provider from settings; presets fill defaults when baseUrl/model are empty. */
export function resolveProvider(): ResolvedProvider {
  const config = vscode.workspace.getConfiguration('fixit');
  const id = (config.get<string>('provider.id') || 'openai') as ProviderId;
  const preset = getPreset(id);
  const baseUrl = (config.get<string>('provider.baseUrl') || preset.baseUrl).replace(/\/$/, '');
  const model = config.get<string>('provider.model') || preset.defaultModel;
  return {
    id: preset.id,
    label: preset.label,
    apiStyle: preset.apiStyle,
    baseUrl,
    model,
    keyPlaceholder: preset.keyPlaceholder,
  };
}

export async function applyProviderPreset(preset: ProviderPreset): Promise<void> {
  const config = vscode.workspace.getConfiguration('fixit');
  await config.update('provider.id', preset.id, vscode.ConfigurationTarget.Global);
  await config.update('provider.baseUrl', preset.baseUrl, vscode.ConfigurationTarget.Global);
  await config.update('provider.model', preset.defaultModel, vscode.ConfigurationTarget.Global);
}
