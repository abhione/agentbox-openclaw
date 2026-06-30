/**
 * @openclaw/agentbox - OpenClaw Provider for AgentBox
 * 
 * Run OpenClaw agents in isolated containers with VNC screen sharing.
 * "Zoom for Agents" - See what your agents see.
 */

export { 
  OpenClawProvider, 
  openclawProvider,
  type BoxRecord,
  type BoxEndpoints,
  type BoxRuntimeState,
  type OpenClawBoxConfig,
  type CreateBoxRequest,
  type CreatedBox,
  type InspectedBox,
  type ExecOptions,
  type ExecResult,
  type AttachSpec,
  type AttachKind,
  type BuildAttachOptions,
} from './provider.js';

// Re-export the singleton as default
export { openclawProvider as default } from './provider.js';

// Dashboard server
export { DashboardServer } from './dashboard/server.js';

// Version
export const VERSION = '0.1.0';
