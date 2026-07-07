/**
 * Shared types for OpenClaw Agent Observatory providers
 */

export type BoxRuntimeState = 'running' | 'paused' | 'stopped' | 'missing' | 'creating';
export type ProviderName = 'docker' | 'e2b' | (string & {});

export interface BoxRecord {
  id: string;
  name: string;
  provider: ProviderName;
  createdAt: string;
  workspacePath?: string;
  ports?: {
    gateway?: number;
    vnc?: number;
    novnc?: number;
    browserControl?: number;
  };
  config?: OpenClawBoxConfig;
  // Provider-specific
  containerId?: string;      // Docker
  sandboxId?: string;        // E2B
  vncPassword?: string;      // E2B VNC auth
}

export interface BoxEndpoints {
  gateway?: string;
  vnc?: string;
  novnc?: string;
  web?: string;
}

export interface OpenClawBoxConfig {
  name: string;
  model?: string;
  persona?: string;
  channels?: {
    telegram?: { botToken: string; allowedUserIds?: string[] };
    discord?: { botToken: string };
    slack?: { botToken: string; appToken: string };
  };
}

export interface PortAllocation {
  gateway: number;
  browserControl: number;
  vnc: number;
  novnc: number;
}

export interface CreateBoxRequest {
  name: string;
  workspacePath?: string;
  config: OpenClawBoxConfig;
  anthropicApiKey: string;
  telegramUserId?: string;
  /** Custom agent workspace files (SOUL.md, AGENTS.md, etc.) — overrides default persona generation */
  agentFiles?: Record<string, string>;
  /** Raw onboarding answers (stored for re-deployment/debugging) */
  onboardingAnswers?: Record<string, string | string[]>;
  onLog?: (msg: string) => void;
}

export interface BoxWithState extends BoxRecord {
  state: BoxRuntimeState;
}

/**
 * Provider interface - each cloud/local provider implements this
 */
export interface OpenClawProvider {
  readonly name: ProviderName;
  
  create(req: CreateBoxRequest): Promise<BoxRecord>;
  start(box: BoxRecord): Promise<void>;
  stop(box: BoxRecord): Promise<void>;
  destroy(box: BoxRecord): Promise<void>;
  probeState(box: BoxRecord): Promise<BoxRuntimeState>;
  getEndpoints(box: BoxRecord): Promise<BoxEndpoints>;
  exec(box: BoxRecord, command: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  
  // Optional capabilities
  pause?(box: BoxRecord): Promise<void>;
  resume?(box: BoxRecord): Promise<void>;
  checkpoint?(box: BoxRecord, name: string): Promise<string>;
}
