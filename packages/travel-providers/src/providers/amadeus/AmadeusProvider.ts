import type { FlightProvider } from '../../contracts/FlightProvider';
import type {
  ProviderCredentials, FlightSearchParams, FlightOffer,
  PnrCreateParams, PnrResult, TicketIssueParams, IssuedTicket,
  VoidParams, RefundParams, RefundResult,
} from '../../types';

const REQUIRED_FIELDS = ['clientId', 'clientSecret', 'hostname'] as const;

/**
 * Amadeus GDS stub — satisfies FlightProvider contract.
 * Real HTTP calls are NOT implemented; this class is the integration point
 * when the agency provides their own Amadeus credentials.
 */
export class AmadeusProvider implements FlightProvider {
  readonly providerCode = 'amadeus' as const;
  readonly providerType = 'gds'     as const;

  isConfigured(credentials: ProviderCredentials): boolean {
    return REQUIRED_FIELDS.every(
      f => typeof credentials.payload[f] === 'string' && credentials.payload[f]!.length > 0,
    );
  }

  async searchFlights(
    _params:      FlightSearchParams,
    _credentials: ProviderCredentials,
  ): Promise<FlightOffer[]> {
    throw new Error('Amadeus integration not yet enabled for this agency');
  }

  async createPNR(
    _params:      PnrCreateParams,
    _credentials: ProviderCredentials,
  ): Promise<PnrResult> {
    throw new Error('Amadeus integration not yet enabled for this agency');
  }

  async retrievePNR(
    _pnrCode:     string,
    _credentials: ProviderCredentials,
  ): Promise<PnrResult> {
    throw new Error('Amadeus integration not yet enabled for this agency');
  }

  async cancelPNR(
    _pnrCode:     string,
    _credentials: ProviderCredentials,
  ): Promise<void> {
    throw new Error('Amadeus integration not yet enabled for this agency');
  }

  async issueTicket(
    _params:      TicketIssueParams,
    _credentials: ProviderCredentials,
  ): Promise<IssuedTicket[]> {
    throw new Error('Amadeus integration not yet enabled for this agency');
  }

  async voidTicket(
    _params:      VoidParams,
    _credentials: ProviderCredentials,
  ): Promise<void> {
    throw new Error('Amadeus integration not yet enabled for this agency');
  }

  async refundTicket(
    _params:      RefundParams,
    _credentials: ProviderCredentials,
  ): Promise<RefundResult> {
    throw new Error('Amadeus integration not yet enabled for this agency');
  }
}
