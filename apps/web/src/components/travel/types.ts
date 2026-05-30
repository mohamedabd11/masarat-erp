// Frontend-only travel types.
// These mirror the server shapes returned by /api/travel/* routes.
// Do NOT import from @masarat/travel-providers here — this file runs in the browser.

export interface TravelCredential {
  id:           string;
  providerCode: string;
  label:        string;
  isActive:     boolean;
  createdAt:    string;
}

export interface FlightOffer {
  id:              string;
  provider:        string;
  airline:         string;
  flightNumber:    string;
  origin:          string;
  destination:     string;
  departureAt:     string;
  arrivalAt:       string;
  durationMinutes: number;
  cabin:           string;
  fareHalalas:     number;
  taxHalalas:      number;
  totalHalalas:    number;
  currency:        string;
  seatsAvailable:  number | null;
  fareClass:       string;
  fareBasis:       string;
  _raw:            unknown;   // Provider-native payload — passed back to createPNR, never read by UI
}

export interface PassengerInput {
  type:            'ADT' | 'CHD';
  firstName:       string;
  lastName:        string;
  dateOfBirth?:    string;   // YYYY-MM-DD
  passportNumber?: string;
  passportExpiry?: string;   // YYYY-MM-DD
  nationality?:    string;   // ISO 3166-1 alpha-2
}

export interface PnrSegment {
  airline:       string;
  flightNumber:  string;
  origin:        string;
  destination:   string;
  departureDate: string;
  departureTime: string;
  arrivalDate:   string;
  arrivalTime:   string;
}

export interface CreatedPnr {
  pnrCode:      string;
  gds:          string;
  status:       string;
  expiresAt?:   string;
  segments:     PnrSegment[];
  totalHalalas: number;
  currency:     string;
  pnrDbId:      string;
}
