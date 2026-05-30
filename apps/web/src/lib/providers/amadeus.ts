import type { FlightProvider, PnrData, IssuanceResult } from './types';

/**
 * Amadeus REST v2 adapter — stub for Phase 10.
 *
 * Real implementation will use:
 *   POST /v1/security/oauth2/token            (client_credentials)
 *   GET  /v1/travel/trip-records/{recordLocator}
 *   POST /v1/ordering/flight-orders/{orderId}/tickets
 *
 * Credentials shape (stored in provider_credentials.credentials):
 *   { clientId: string, clientSecret: string, hostname: string }
 *   hostname: "test.api.amadeus.com" | "api.amadeus.com"
 */
export class AmadeusProvider implements FlightProvider {
  async retrievePNR(pnrCode: string, _credentials: unknown): Promise<PnrData> {
    throw new Error(`Amadeus retrievePNR not yet implemented — pnr: ${pnrCode}`);
  }

  async issueTicket(pnrCode: string, _credentials: unknown): Promise<IssuanceResult> {
    throw new Error(`Amadeus issueTicket not yet implemented — pnr: ${pnrCode}`);
  }
}
