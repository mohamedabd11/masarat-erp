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
  ticketNumber?:   string;  // populated if already ticketed
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
  /** One status per segment, in segment order — defaults to 'open' if provider doesn't return */
  couponStatuses: ('open' | 'used' | 'void' | 'refunded')[];
}

/** Result of provider.issueTicket() — one entry per passenger */
export interface IssuanceResult {
  tickets: IssuedTicketInfo[];
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
}
