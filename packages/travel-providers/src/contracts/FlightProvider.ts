import type { ProviderCredentials, FlightSearchParams, FlightOffer, PnrCreateParams, PnrResult, TicketIssueParams, IssuedTicket, VoidParams, RefundParams, RefundResult } from '../types';
import type { BookingProvider } from './BookingProvider';

/**
 * Flight operations contract — every GDS provider implements this.
 *
 * The system never holds GDS credentials itself; each method receives the
 * agency-owned credentials so nothing is stored in memory between requests.
 */
export interface FlightProvider extends BookingProvider {
  /** Search for available flight offers. */
  searchFlights(
    params:      FlightSearchParams,
    credentials: ProviderCredentials,
  ): Promise<FlightOffer[]>;

  /** Create a PNR (booking) from a selected offer. */
  createPNR(
    params:      PnrCreateParams,
    credentials: ProviderCredentials,
  ): Promise<PnrResult>;

  /** Retrieve an existing PNR. */
  retrievePNR(
    pnrCode:     string,
    credentials: ProviderCredentials,
  ): Promise<PnrResult>;

  /** Cancel (ignore) a PNR without issuing a ticket. */
  cancelPNR(
    pnrCode:     string,
    credentials: ProviderCredentials,
  ): Promise<void>;

  /** Issue tickets for a confirmed PNR. */
  issueTicket(
    params:      TicketIssueParams,
    credentials: ProviderCredentials,
  ): Promise<IssuedTicket[]>;

  /** Void a ticket (before departure, same-day). */
  voidTicket(
    params:      VoidParams,
    credentials: ProviderCredentials,
  ): Promise<void>;

  /** Process a refund for a partially or fully unused ticket. */
  refundTicket(
    params:      RefundParams,
    credentials: ProviderCredentials,
  ): Promise<RefundResult>;
}
