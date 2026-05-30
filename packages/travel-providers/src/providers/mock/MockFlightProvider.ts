import type { FlightProvider } from '../../contracts/FlightProvider';
import type {
  ProviderCredentials, FlightSearchParams, FlightOffer,
  PnrCreateParams, PnrResult, TicketIssueParams, IssuedTicket,
  VoidParams, RefundParams, RefundResult, ProviderCode, ProviderType,
} from '../../types';

// Static flight catalogue (all prices in halalas = SAR × 100)
const CATALOGUE: FlightOffer[] = [
  {
    id: 'mock-sv623-ruh-jed',
    provider: 'amadeus' as unknown as ProviderCode,   // cast: 'mock' is not a real ProviderCode
    airline: 'SV',
    flightNumber: 'SV623',
    origin: 'RUH',
    destination: 'JED',
    departureAt: '2026-06-01T08:00:00+03:00',
    arrivalAt:   '2026-06-01T09:10:00+03:00',
    durationMinutes: 70,
    cabin: 'economy',
    fareHalalas: 50000,
    taxHalalas: 10000,
    totalHalalas: 60000,
    currency: 'SAR',
    seatsAvailable: 9,
    fareClass: 'Y',
    fareBasis: 'YOWSV',
  },
  {
    id: 'mock-fz351-ruh-dxb',
    provider: 'amadeus' as unknown as ProviderCode,
    airline: 'FZ',
    flightNumber: 'FZ351',
    origin: 'RUH',
    destination: 'DXB',
    departureAt: '2026-06-01T14:30:00+03:00',
    arrivalAt:   '2026-06-01T16:45:00+04:00',
    durationMinutes: 135,
    cabin: 'economy',
    fareHalalas: 40000,
    taxHalalas: 5000,
    totalHalalas: 45000,
    currency: 'SAR',
    seatsAvailable: 4,
    fareClass: 'V',
    fareBasis: 'VOWFZ',
  },
  {
    id: 'mock-ms663-dmm-cai',
    provider: 'amadeus' as unknown as ProviderCode,
    airline: 'MS',
    flightNumber: 'MS663',
    origin: 'DMM',
    destination: 'CAI',
    departureAt: '2026-06-02T23:55:00+03:00',
    arrivalAt:   '2026-06-03T01:30:00+02:00',
    durationMinutes: 215,
    cabin: 'economy',
    fareHalalas: 72000,
    taxHalalas: 8000,
    totalHalalas: 80000,
    currency: 'SAR',
    seatsAvailable: 12,
    fareClass: 'M',
    fareBasis: 'MOWMS',
  },
];

export class MockFlightProvider implements FlightProvider {
  readonly providerCode: ProviderCode = 'amadeus' as unknown as ProviderCode;
  readonly providerType: ProviderType = 'gds' as const;

  isConfigured(_credentials: ProviderCredentials): boolean { return true; }

  async searchFlights(params: FlightSearchParams, _credentials: ProviderCredentials): Promise<FlightOffer[]> {
    return CATALOGUE.filter(
      o => o.origin === params.origin.toUpperCase() &&
           o.destination === params.destination.toUpperCase(),
    );
  }

  async createPNR(params: PnrCreateParams, _credentials: ProviderCredentials): Promise<PnrResult> {
    const pnrCode = `MOCK${params.offer.flightNumber.replace(/\D/g, '').slice(0, 3)}${Date.now().toString(36).slice(-3).toUpperCase()}`;
    return {
      pnrCode,
      gds: 'amadeus' as unknown as ProviderCode,
      status: 'HK',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      passengers: params.passengers,
      segments: [{
        airline:       params.offer.airline,
        flightNumber:  params.offer.flightNumber,
        origin:        params.offer.origin,
        destination:   params.offer.destination,
        departureDate: params.offer.departureAt.slice(0, 10),
        departureTime: params.offer.departureAt.slice(11, 16),
        arrivalDate:   params.offer.arrivalAt.slice(0, 10),
        arrivalTime:   params.offer.arrivalAt.slice(11, 16),
        bookingClass:  params.offer.fareClass,
        fareBasis:     params.offer.fareBasis,
        status:        'HK',
      }],
      totalHalalas: params.offer.totalHalalas * params.passengers.reduce((s, p) => s + (p as unknown as { count: number }).count, 0),
      currency: params.offer.currency,
    };
  }

  async retrievePNR(pnrCode: string, _credentials: ProviderCredentials): Promise<PnrResult> {
    return {
      pnrCode,
      gds: 'amadeus' as unknown as ProviderCode,
      status: 'HK',
      passengers: [],
      segments: [],
      totalHalalas: 0,
      currency: 'SAR',
    };
  }

  async cancelPNR(_pnrCode: string, _credentials: ProviderCredentials): Promise<void> {}

  async issueTicket(params: TicketIssueParams, _credentials: ProviderCredentials): Promise<IssuedTicket[]> {
    return params.passengerNames.map((name, i) => ({
      ticketNumber:  `0572${String(Date.now()).slice(-9)}${i + 1}`,
      passengerName: name,
      passengerType: 'ADT' as const,
      status:        'issued' as const,
      fareHalalas:   Math.floor(params.formOfPayment.amountHalalas / params.passengerNames.length),
      taxHalalas:    0,
      totalHalalas:  Math.floor(params.formOfPayment.amountHalalas / params.passengerNames.length),
      issuedAt:      new Date().toISOString(),
    }));
  }

  async voidTicket(_params: VoidParams, _credentials: ProviderCredentials): Promise<void> {}

  async refundTicket(params: RefundParams, _credentials: ProviderCredentials): Promise<RefundResult> {
    return {
      refundHalalas:  params.penaltyHalalas > 0 ? 0 : 60000,
      penaltyHalalas: params.penaltyHalalas,
      processedAt:    new Date().toISOString(),
    };
  }
}
