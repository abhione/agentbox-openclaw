/**
 * OpenClaw Config Generator
 * 
 * Generates valid openclaw.json configs that actually work
 */

import { getPersonaById, generateAgentFiles, type AgentPersona } from './personas.js';

export interface ConfigInput {
  agentName: string;
  model: string;
  provider: 'anthropic' | 'openai' | 'bedrock' | 'ollama';
  credentials: {
    anthropicKey?: string;
    openaiKey?: string;
    bedrockAccessKey?: string;
    bedrockSecretKey?: string;
    bedrockRegion?: string;
    ollamaHost?: string;
  };
  telegramToken?: string;
  telegramAllowedUsers?: string[];
  personaId?: string;
}

export interface GeneratedConfig {
  openclawConfig: Record<string, unknown>;
  credentialFiles: { [path: string]: string };
}

export function generateOpenClawConfig(input: ConfigInput): GeneratedConfig {
  // Generate a random token for gateway auth
  const gatewayToken = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
  
  const config: Record<string, unknown> = {
    meta: {
      lastTouchedVersion: '2026.6.11',
      lastTouchedAt: new Date().toISOString(),
    },
    wizard: {
      lastRunAt: new Date().toISOString(),
      lastRunVersion: '2026.6.11',
      lastRunCommand: 'agentbox-deploy',
      lastRunMode: 'local',
    },
    gateway: {
      mode: 'local',
      port: 18789,
      bind: 'lan',
      auth: {
        mode: 'token',
        token: gatewayToken,
      },
    },
    agents: {
      defaults: {
        model: {
          primary: input.model,
          fallbacks: [],
        },
        workspace: '/home/agent/workspace',
      },
    },
    browser: {
      enabled: true,
      defaultProfile: 'chromium',
      ssrfPolicy: {
        dangerouslyAllowPrivateNetwork: true,
      },
      profiles: {
        chromium: {
          driver: 'existing-session',
          attachOnly: true,
          cdpUrl: 'http://127.0.0.1:18800',
          color: '#4285F4',
        },
      },
    },
    tools: {
      web: {
        search: {},
      },
      exec: {
        host: 'gateway',
        security: 'full',
      },
    },
    auth: {
      profiles: {},
    },
    channels: {},
    approvals: {},
    cron: {},
    models: {
      providers: {},
      mode: 'merge',
    },
    plugins: {},
    session: {
      scope: 'per-sender',
      dmScope: 'per-channel-peer',
      reset: {
        mode: 'idle',
        idleMinutes: 60,
      },
    },
    skills: {},
    mcp: {},
    commands: {},
    messages: {
      queue: {
        mode: 'followup',
        debounceMs: 500,
      },
    },
    env: {},
  };

  // Credential files to inject
  const credentialFiles: { [path: string]: string } = {};

  // Auth profiles for provider resolution
  const authProfiles = (config.auth as { profiles: Record<string, unknown> }).profiles;
  
  // Model providers config - this is where API keys actually go
  const modelProviders = (config.models as { providers: Record<string, unknown> }).providers;
  
  if (input.provider === 'anthropic' && input.credentials.anthropicKey) {
    authProfiles['anthropic:default'] = {
      provider: 'anthropic',
      mode: 'token',
    };
    // API key goes in models.providers.anthropic
    modelProviders['anthropic'] = {
      apiKey: input.credentials.anthropicKey,
      api: 'anthropic-messages',
      baseUrl: 'https://api.anthropic.com',
    };
    // Also store in credentials file for backup
    credentialFiles['credentials/anthropic-key'] = input.credentials.anthropicKey;
  } else if (input.provider === 'openai' && input.credentials.openaiKey) {
    authProfiles['openai:default'] = {
      provider: 'openai',
      mode: 'token',
    };
    modelProviders['openai'] = {
      apiKey: input.credentials.openaiKey,
      baseUrl: 'https://api.openai.com/v1',
    };
    credentialFiles['credentials/openai-key'] = input.credentials.openaiKey;
  } else if (input.provider === 'bedrock' && input.credentials.bedrockAccessKey) {
    authProfiles['bedrock:default'] = {
      provider: 'bedrock',
      mode: 'iam',
      region: input.credentials.bedrockRegion || 'us-east-1',
    };
    modelProviders['bedrock'] = {
      accessKeyId: input.credentials.bedrockAccessKey,
      secretAccessKey: input.credentials.bedrockSecretKey,
      region: input.credentials.bedrockRegion || 'us-east-1',
    };
  } else if (input.provider === 'ollama') {
    authProfiles['ollama:default'] = {
      provider: 'ollama',
      host: input.credentials.ollamaHost || 'http://host.docker.internal:11434',
    };
    modelProviders['ollama'] = {
      baseUrl: input.credentials.ollamaHost || 'http://host.docker.internal:11434',
    };
  }

  // Add Telegram channel if configured
  if (input.telegramToken) {
    const telegramConfig: Record<string, unknown> = {
      enabled: true,
      botToken: input.telegramToken,
      streaming: {
        mode: 'partial',
      },
    };
    
    // If allowed users specified, use allowlist policy
    if (input.telegramAllowedUsers && input.telegramAllowedUsers.length > 0) {
      telegramConfig.dmPolicy = 'allowlist';
      telegramConfig.allowFrom = input.telegramAllowedUsers;
    } else {
      telegramConfig.dmPolicy = 'open';
    }
    
    (config.channels as Record<string, unknown>).telegram = telegramConfig;
  }

  return { openclawConfig: config, credentialFiles };
}

export function generateWorkspaceFiles(input: ConfigInput): { [path: string]: string } {
  const persona = input.personaId ? getPersonaById(input.personaId) : null;
  
  if (persona) {
    return generateAgentFiles(persona, input.agentName);
  }

  // Default files for custom agents
  return {
    'SOUL.md': `# SOUL.md - Who You Are

*Your name is ${input.agentName}.*

Be helpful, honest, and thorough. Ask clarifying questions when needed.

---

*This file defines who you are. Update it as you learn and grow.*
`,
    'AGENTS.md': `# AGENTS.md - Your Workspace

## Identity
- **Name:** ${input.agentName}

## Every Session
1. Read \`SOUL.md\` — this is who you are
2. Check recent messages for context

## Safety
- Don't exfiltrate private data
- Ask before sending external communications
- When in doubt, ask
`,
    'MEMORY.md': `# MEMORY.md - Long-Term Memory

## About Me
- **Name:** ${input.agentName}
- **Created:** ${new Date().toISOString().split('T')[0]}

## Key Learnings
*(Add important learnings here as you work)*
`,
    'memory/NOW.md': `# NOW.md - Current Context

## Status
Just deployed! Ready to start working.

## Current Focus
Waiting for first task.
`,
  };
}
