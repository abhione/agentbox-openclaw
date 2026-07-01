/**
 * OpenClaw Onboarding Configuration
 * 
 * Generates valid openclaw.json configs for containers
 */

export interface OnboardingAnswers {
  // Model provider
  provider: 'anthropic' | 'openai' | 'bedrock' | 'ollama';
  
  // API credentials
  anthropicKey?: string;
  openaiKey?: string;
  bedrockAccessKey?: string;
  bedrockSecretKey?: string;
  bedrockRegion?: string;
  ollamaHost?: string;
  
  // Model selection
  model?: string;
  
  // Channels (optional)
  telegramToken?: string;
  discordToken?: string;
  slackBotToken?: string;
  slackAppToken?: string;
}

export interface OnboardingQuestion {
  id: keyof OnboardingAnswers;
  type: 'text' | 'password' | 'select';
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  showIf?: (answers: Partial<OnboardingAnswers>) => boolean;
}

export const ONBOARDING_QUESTIONS: OnboardingQuestion[] = [
  {
    id: 'provider',
    type: 'select',
    label: 'LLM Provider',
    required: true,
    options: [
      { value: 'anthropic', label: 'Anthropic (Claude)' },
      { value: 'openai', label: 'OpenAI (GPT)' },
      { value: 'bedrock', label: 'AWS Bedrock' },
      { value: 'ollama', label: 'Ollama (Local)' },
    ],
  },
  {
    id: 'anthropicKey',
    type: 'password',
    label: 'Anthropic API Key',
    placeholder: 'sk-ant-...',
    required: true,
    showIf: (a) => a.provider === 'anthropic',
  },
  {
    id: 'openaiKey',
    type: 'password',
    label: 'OpenAI API Key',
    placeholder: 'sk-...',
    required: true,
    showIf: (a) => a.provider === 'openai',
  },
  {
    id: 'bedrockAccessKey',
    type: 'password',
    label: 'AWS Access Key ID',
    required: true,
    showIf: (a) => a.provider === 'bedrock',
  },
  {
    id: 'bedrockSecretKey',
    type: 'password',
    label: 'AWS Secret Access Key',
    required: true,
    showIf: (a) => a.provider === 'bedrock',
  },
  {
    id: 'bedrockRegion',
    type: 'select',
    label: 'AWS Region',
    required: true,
    showIf: (a) => a.provider === 'bedrock',
    options: [
      { value: 'us-east-1', label: 'US East (N. Virginia)' },
      { value: 'us-west-2', label: 'US West (Oregon)' },
      { value: 'eu-west-1', label: 'Europe (Ireland)' },
      { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
    ],
  },
  {
    id: 'ollamaHost',
    type: 'text',
    label: 'Ollama Host',
    placeholder: 'http://host.docker.internal:11434',
    showIf: (a) => a.provider === 'ollama',
  },
  {
    id: 'model',
    type: 'select',
    label: 'Model',
    required: true,
    options: [
      { value: 'anthropic/claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
      { value: 'anthropic/claude-opus-4-5', label: 'Claude Opus 4.5' },
      { value: 'openai/gpt-4o', label: 'GPT-4o' },
      { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0', label: 'Bedrock Claude Sonnet 4' },
      { value: 'ollama/llama3.3', label: 'Ollama Llama 3.3' },
    ],
  },
  {
    id: 'telegramToken',
    type: 'password',
    label: 'Telegram Bot Token (optional)',
    placeholder: '123456:ABC-...',
  },
];

export function generateOpenClawConfig(answers: OnboardingAnswers): object {
  const config: Record<string, unknown> = {
    gateway: {
      mode: 'local',
      port: 18789,
      bind: '0.0.0.0',
    },
    models: {
      default: answers.model || 'anthropic/claude-sonnet-4-20250514',
    },
    tools: {
      exec: { enabled: true },
      browser: { enabled: true },
    },
    channels: {},
  };

  // Add provider-specific auth
  if (answers.provider === 'anthropic' && answers.anthropicKey) {
    config.auth = {
      anthropic: { apiKey: answers.anthropicKey },
    };
  } else if (answers.provider === 'openai' && answers.openaiKey) {
    config.auth = {
      openai: { apiKey: answers.openaiKey },
    };
  } else if (answers.provider === 'bedrock') {
    config.auth = {
      bedrock: {
        accessKeyId: answers.bedrockAccessKey,
        secretAccessKey: answers.bedrockSecretKey,
        region: answers.bedrockRegion || 'us-east-1',
      },
    };
  } else if (answers.provider === 'ollama') {
    config.auth = {
      ollama: { host: answers.ollamaHost || 'http://host.docker.internal:11434' },
    };
  }

  // Add Telegram channel if configured
  if (answers.telegramToken) {
    (config.channels as Record<string, unknown>).telegram = {
      botToken: answers.telegramToken,
    };
  }

  return config;
}

export function getVisibleQuestions(answers: Partial<OnboardingAnswers>): OnboardingQuestion[] {
  return ONBOARDING_QUESTIONS.filter(q => !q.showIf || q.showIf(answers));
}
