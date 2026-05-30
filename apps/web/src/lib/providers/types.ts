/** Segment data returned by provider.retrievePNR() */
export interface SegmentInfo {
  from:          string;   // IATA origin airport
  to:            string;   // IATA destination airport
  carrier:       string;   // IATA airline code
  flightNumber?: string;
  departureAt?:  string;   // ISO-8601 UTC
  arrivalAt?:    string;
  cabin?:        string;   // Y|W|C|F
}

/** Passenger data returned by provider.retrievePNR() */
export interface PassengerInfo {
  name:            string;
  type:            'ADT' | 'CHD' | 'INF';
  passportNumber?: string;
  dateOfBirth?:    string;
  nationality?:    string;
  ticketNumber?:   string;  // populated if already ticketed at provider
}

/** Full PNR snapshot from the provider */
export interface PnrData {
  pnrCode:    string;
  segments:   SegmentInfo[];
  passengers: PassengerInfo[];
}

/** One issued ticket as returned by provider.issueTicket() */
export interface IssuedTicketInfo {
  passengerName:  string;
  ticketNumber:   string;   // 13-digit IATA e.g. "065-1234567890"
  fareHalalas?:   number;
  taxHalalas?:    number;
  totalHalalas?:  number;
  /** One status per segment in segment order — defaults to 'open' if provider omits */
  couponStatuses: ('open' | 'used' | 'void' | 'refunded')[];
}

/** Result of provider.issueTicket() — one entry per passenger */
export interface IssuanceResult {
  tickets: IssuedTicketInfo[];
}

/** Result of provider.voidTicket() */
export interface VoidResult {
  success: boolean;
}

/** Parameters for provider.refundTicket() */
export interface RefundParams {
  reason?: 'voluntary' | 'involuntary' | 'schedule_change' | 'medical';
  notes?:  string;
}

/** Result of provider.refundTicket() */
export interface RefundResult {
  refundReference?:    string;   // provider-assigned refund ID
  refundAmountHalalas?: number;  // may differ from original fare after penalties
}

/** Parameters for provider.exchangeTicket() */
export interface ExchangeParams {
  newPnrId?:      string;   // if exchange targets a different PNR in our system
  fareHalalas?:   number;
  taxHalalas?:    number;
  totalHalalas?:  number;
}

/** Result of provider.exchangeTicket() — stored in pendingOperationPayload for Phase 3 replay */
export interface ExchangeResult {
  newTicketNumber: string;
  newPnrId?:       string;   // if provider created a new PNR (rare)
  newFareHalalas?:   number;
  newTaxHalalas?:    number;
  newTotalHalalas?:  number;
  couponStatuses:  ('open' | 'used' | 'void' | 'refunded')[];
}

/**
 * Contract that every GDS provider adapter must implement.
 * Credentials are opaque (provider-specific JSON from provider_credentials.credentials).
 */
export interface FlightProvider {
  /** Retrieve current PNR state from the GDS */
  retrievePNR(pnrCode: string, credentials: unknown): Promise<PnrData>;

  /** Issue tickets for all passengers in the PNR */
  issueTicket(pnrCode: string, credentials: unknown): Promise<IssuanceResult>;

  /** Void a specific ticket (usually same-day BSP window) */
  voidTicket(ticketNumber: string, credentials: unknown): Promise<VoidResult>;

  /** Submit a refund request for a ticket */
  refundTicket(ticketNumber: string, credentials: unknown, params?: RefundParams): Promise<RefundResult>;

  /** Exchange a ticket for a new itinerary */
  exchangeTicket(ticketNumber: string, credentials: unknown, params?: ExchangeParams): Promise<ExchangeResult>;
}
