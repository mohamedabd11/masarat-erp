import type {
  FlightProvider,
  PnrData,
  IssuanceResult,
  VoidResult,
  RefundParams,
  RefundResult,
  ExchangeParams,
  ExchangeResult,
} from './types';

/**
 * Amadeus REST v2 adapter — stub for Phase 10.
 *
 * Real implementation will use:
 *   POST /v1/security/oauth2/token                      (client_credentials)
 *   GET  /v1/travel/trip-records/{recordLocator}        (retrievePNR)
 *   POST /v1/ordering/flight-orders/{orderId}/tickets   (issueTicket)
 *   DELETE /v1/ordering/flight-orders/{orderId}/tickets/{ticketId} (voidTicket)
 *   POST /v1/ordering/flight-orders/{orderId}/refunds   (refundTicket)
 *   POST /v1/ordering/flight-orders/{orderId}/exchanges (exchangeTicket)
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

  async voidTicket(ticketNumber: string, _credentials: unknown): Promise<VoidResult> {
    throw new Error(`Amadeus voidTicket not yet implemented — ticket: ${ticketNumber}`);
  }

  async refundTicket(
    ticketNumber: string,
    _credentials: unknown,
    _params?: RefundParams,
  ): Promise<RefundResult> {
    throw new Error(`Amadeus refundTicket not yet implemented — ticket: ${ticketNumber}`);
  }

  async exchangeTicket(
    ticketNumber: string,
    _credentials: unknown,
    _params?: ExchangeParams,
  ): Promise<ExchangeResult> {
    throw new Error(`Amadeus exchangeTicket not yet implemented — ticket: ${ticketNumber}`);
  }
}
