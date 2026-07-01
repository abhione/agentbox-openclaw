/**
 * @openclaw/agentbox - OpenClaw Agent Observatory
 * 
 * Deploy, monitor, and watch OpenClaw agents work in real-time.
 * "Zoom for AI Agents" - See what your agents see.
 * 
 * Supports:
 * - Local Docker containers
 * - E2B Cloud Desktop VMs
 */

// Provider system
export {
  getProvider,
  listProviders,
  isProviderAvailable,
  DockerProvider,
  E2BProvider,
  type OpenClawProvider,
  type BoxRecord,
  type BoxWithState,
  type BoxEndpoints,
  type BoxRuntimeState,
  type OpenClawBoxConfig,
  type CreateBoxRequest,
  type ProviderName,
  type PortAllocation,
} from './providers/index.js';

// Config generation
export {
  generateOpenClawConfig,
  generateSoulMd,
} from './config-generator.js';

// Personas
export { AGENT_PERSONAS as PERSONAS, type AgentPersona } from './personas.js';

// Dashboard server
export { DashboardServer } from './dashboard/server.js';

// Version
export const VERSION = '0.2.0';
