// ── Shared domain types ───────────────────────────────────────────────────────

export type ProviderCode = 'amadeus' | 'galileo' | 'sabre' | 'hotelbeds' | 'tbo';
export type ProviderType = 'gds' | 'hotel' | 'both';
export type CabinClass   = 'economy' | 'premium_economy' | 'business' | 'first';
export type PassengerType = 'ADT' | 'CHD' | 'INF';

// ── Credential payload (decrypted) ────────────────────────────────────────────

export interface ProviderCredentials {
  providerCode: ProviderCode;
  /** Decrypted key-value pairs, e.g. { clientId, clientSecret } */
  payload:      Record<string, string>;
}

// ── Provider registry ─────────────────────────────────────────────────────────

export interface ProviderField {
  key:      string;
  labelAr:  string;
  labelEn:  string;
  isSecret: boolean;
}

export interface SupportedProvider {
  code:           ProviderCode;
  nameAr:         string;
  nameEn:         string;
  providerType:   ProviderType;
  requiredFields: ProviderField[];
}

// ── Flight search ─────────────────────────────────────────────────────────────

export interface PassengerCount {
  type:  PassengerType;
  count: number;
}

export interface FlightSearchParams {
  origin:        string;
  destination:   string;
  departureDate: string;          // YYYY-MM-DD
  returnDate?:   string;          // YYYY-MM-DD — omit for one-way
  passengers:    PassengerCount[];
  cabin?:        CabinClass;
  directOnly?:   boolean;
}

export interface FlightOffer {
  id:             string;
  provider:       ProviderCode;
  airline:        string;         // IATA airline code
  flightNumber:   string;
  origin:         string;         // IATA airport code
  destination:    string;
  departureAt:    string;         // ISO 8601 datetime
  arrivalAt:      string;
  durationMinutes: number;
  cabin:          CabinClass;
  fareHalalas:    number;
  taxHalalas:     number;
  totalHalalas:   number;
  currency:       string;
  seatsAvailable: number | null;
  fareClass:      string;
  fareBasis:      string;
}

// ── PNR ───────────────────────────────────────────────────────────────────────

export interface PassengerInfo {
  type:            PassengerType;
  firstName:       string;
  lastName:        string;
  dateOfBirth?:    string;  // YYYY-MM-DD
  passportNumber?: string;
  nationality?:    string;  // ISO 3166-1 alpha-2
  passportExpiry?: string;  // YYYY-MM-DD
}

export interface PnrCreateParams {
  offer:        FlightOffer;
  passengers:   PassengerInfo[];
  contactEmail: string;
  contactPhone?: string;
}

export interface SegmentInfo {
  airline:       string;
  flightNumber:  string;
  origin:        string;
  destination:   string;
  departureDate: string;
  departureTime: string;
  arrivalDate:   string;
  arrivalTime:   string;
  bookingClass:  string;
  fareBasis:     string;
  status:        string;  // HK|TK|UN|NO|WL
}

export interface PnrResult {
  pnrCode:      string;
  gds:          ProviderCode;
  status:       string;
  expiresAt?:   string;  // ISO 8601
  passengers:   PassengerInfo[];
  segments:     SegmentInfo[];
  totalHalalas: number;
  currency:     string;
}

// ── Ticketing ─────────────────────────────────────────────────────────────────

export interface FormOfPayment {
  type:            'cash' | 'credit_card' | 'bank';
  amountHalalas:   number;
}

export interface TicketIssueParams {
  pnrCode:       string;
  passengerNames: string[];
  formOfPayment: FormOfPayment;
}

export interface IssuedTicket {
  ticketNumber:  string;   // 14-digit IATA ticket number
  passengerName: string;
  passengerType: PassengerType;
  status:        'issued';
  fareHalalas:   number;
  taxHalalas:    number;
  totalHalalas:  number;
  issuedAt:      string;   // ISO 8601
}

export interface VoidParams {
  ticketNumber: string;
  reason?:      string;
}

export interface RefundParams {
  ticketNumber:   string;
  reason:         string;
  penaltyHalalas: number;
}

export interface RefundResult {
  refundHalalas:  number;
  penaltyHalalas: number;
  processedAt:    string;  // ISO 8601
}

// ── Hotel search ──────────────────────────────────────────────────────────────

export interface HotelSearchParams {
  destinationCode: string;
  checkIn:         string;  // YYYY-MM-DD
  checkOut:        string;  // YYYY-MM-DD
  rooms:           number;
  adults:          number;
  children?:       number;
}

export interface HotelOffer {
  id:             string;
  provider:       ProviderCode;
  hotelCode:      string;
  hotelName:      string;
  destination:    string;
  checkIn:        string;
  checkOut:       string;
  roomType:       string;
  mealPlan:       string;
  priceHalalas:   number;
  currency:       string;
  refundable:     boolean;
  cancellationDeadline?: string;
}

export interface HotelBookingParams {
  offer:        HotelOffer;
  guestName:    string;
  contactEmail: string;
  contactPhone?: string;
  specialRequests?: string;
}

export interface HotelReservation {
  reservationId: string;
  provider:      ProviderCode;
  hotelCode:     string;
  status:        string;
  confirmationNumber?: string;
}
