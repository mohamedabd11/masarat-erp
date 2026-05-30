import type { FlightProvider } from './types';
import { AmadeusProvider } from './amadeus';

// Singleton instances — providers are stateless, safe to share
const REGISTRY: Record<string, FlightProvider> = {
  amadeus: new AmadeusProvider(),
  // sabre:    new SabreProvider(),    // Phase 11
  // galileo:  new GalileoProvider(),  // Phase 12
  // worldspan: new WorldspanProvider(), // future
};

export function getProvider(providerCode: string): FlightProvider {
  const p = REGISTRY[providerCode];
  if (!p) throw new Error(`Unsupported GDS provider: ${providerCode}`);
  return p;
}
