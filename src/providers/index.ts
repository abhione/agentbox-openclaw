/**
 * Provider registry for OpenClaw Agent Observatory
 */

export * from './types.js';
export { DockerProvider } from './docker.js';
export { E2BProvider } from './e2b.js';

import type { OpenClawProvider, ProviderName } from './types.js';
import { DockerProvider } from './docker.js';
import { E2BProvider } from './e2b.js';

const providers: Map<ProviderName, OpenClawProvider> = new Map();

export function getProvider(name: ProviderName): OpenClawProvider {
  let provider = providers.get(name);
  
  if (!provider) {
    switch (name) {
      case 'docker':
        provider = new DockerProvider();
        break;
      case 'e2b':
        provider = new E2BProvider();
        break;
      default:
        throw new Error(`Unknown provider: ${name}`);
    }
    providers.set(name, provider);
  }
  
  return provider;
}

export function listProviders(): ProviderName[] {
  return ['docker', 'e2b'];
}

export function isProviderAvailable(name: ProviderName): boolean {
  switch (name) {
    case 'docker':
      return true; // Docker is always available locally
    case 'e2b':
      return !!process.env.E2B_API_KEY;
    default:
      return false;
  }
}
