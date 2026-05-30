/**
 * Phase 6-B integration tests — AmadeusProvider
 *
 * Tests verify:
 *  1. isConfigured() contract
 *  2. searchFlights() → correct Amadeus API calls + response mapping
 *  3. createPNR() → pricing + order creation flow
 *  4. retrievePNR() + cancelPNR()
 *  5. issueTicket/voidTicket/refundTicket → NotImplemented
 *  6. Mock ↔ Amadeus interface parity
 *
 * No real network calls — fetch is mocked for every test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AmadeusProvider } from '../../../../packages/travel-providers/src/providers/amadeus/AmadeusProvider';
import { MockFlightProvider } from '../../../../packages/travel-providers/src/providers/mock/MockFlightProvider';
import type {
  ProviderCredentials,
  PassengerInfo,
  FlightOffer,
} from '../../../../packages/travel-providers/src/types';

// ── Test fixtures ──────────────────────────────────────────────────────────────

const CREDS: ProviderCredentials = {
  providerCode: 'amadeus',
  payload: {
    clientId:     'test_client_id',
    clientSecret: 'test_client_secret',
    hostname:     'test.api.amadeus.com',
  },
};

// Minimal Amadeus token response
const TOKEN_RESP = {
  access_token: 'tok_test_123',
  token_type:   'Bearer',
  expires_in:   1799,
  scope:        'am-b2b',
};

// Minimal Amadeus flight offer (mirrors real API shape)
const AMADEUS_OFFER = {
  id:    'offer_SV623_1',
  source: 'GDS',
  itineraries: [{
    duration: 'PT1H10M',
    segments: [{
      id:          'seg_1',
      departure:   { iataCode: 'RUH', at: '2026-06-01T08:00:00' },
      arrival:     { iataCode: 'JED', at: '2026-06-01T09:10:00' },
      carrierCode: 'SV',
      number:      '623',
      aircraft:    { code: '73H' },
      duration:    'PT1H10M',
    }],
  }],
  price: {
    currency:   'SAR',
    total:      '600.00',
    base:       '500.00',
    grandTotal: '600.00',
  },
  validatingAirlineCodes: ['SV'],
  travelerPricings: [{
    travelerId: '1',
    travelerType: 'ADULT',
    price:        { currency: 'SAR', total: '600.00', base: '500.00' },
    fareDetailsBySegment: [{
      segmentId: 'seg_1',
      cabin:     'ECONOMY',
      fareBasis: 'YECON',
      class:     'Y',
    }],
  }],
  numberOfBookableSeats: 7,
};

// Minimal Amadeus flight order response
const AMADEUS_ORDER = {
  type:        'flight-order',
  id:          'eJzTd9f3ABCD',
  flightOffers: [AMADEUS_OFFER],
  travelers:   [{
    id:          '1',
    dateOfBirth: '1990-01-01',
    name:        { firstName: 'AHMED', lastName: 'ALSAUDI' },
    contact:     { emailAddress: 'test@example.com' },
    documents:   [{ documentType: 'PASSPORT', number: 'A12345678', issuanceCountry: 'SA', nationality: 'SA', holder: true }],
  }],
  ticketingAgreement: { option: 'DELAY_TO_CANCEL', dateTime: '2026-06-02T00:00:00' },
};

// ── Helper: mock fetch responses ──────────────────────────────────────────────

function mockFetch(...responses: object[]) {
  const mockFn = vi.fn();
  for (const resp of responses) {
    mockFn.mockResolvedValueOnce({
      ok:     true,
      status: 200,
      json:   async () => resp,
      text:   async () => JSON.stringify(resp),
    } as Response);
  }
  vi.stubGlobal('fetch', mockFn);
  return mockFn;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AmadeusProvider — isConfigured()', () => {
  const provider = new AmadeusProvider();

  it('returns true with all required fields', () => {
    expect(provider.isConfigured(CREDS)).toBe(true);
  });

  it('returns false when clientId is missing', () => {
    expect(provider.isConfigured({
      providerCode: 'amadeus',
      payload: { clientSecret: 'x', hostname: 'test.api.amadeus.com' },
    })).toBe(false);
  });

  it('returns false when clientSecret is empty', () => {
    expect(provider.isConfigured({
      providerCode: 'amadeus',
      payload: { clientId: 'id', clientSecret: '', hostname: 'test.api.amadeus.com' },
    })).toBe(false);
  });

  it('returns false when hostname is missing', () => {
    expect(provider.isConfigured({
      providerCode: 'amadeus',
      payload: { clientId: 'id', clientSecret: 'sec' },
    })).toBe(false);
  });

  it('providerCode = "amadeus" and providerType = "gds"', () => {
    expect(provider.providerCode).toBe('amadeus');
    expect(provider.providerType).toBe('gds');
  });
});

describe('AmadeusProvider — searchFlights()', () => {
  let provider: AmadeusProvider;

  beforeEach(() => { provider = new AmadeusProvider(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('fetches token then calls /v2/shopping/flight-offers', async () => {
    const mock = mockFetch(TOKEN_RESP, { data: [AMADEUS_OFFER] });

    const offers = await provider.searchFlights(
      { origin: 'RUH', destination: 'JED', departureDate: '2026-06-01', passengers: [{ type: 'ADT', count: 1 }] },
      CREDS,
    );

    expect(offers).toHaveLength(1);
    // Verify URLs in order
    const [tokenCall, searchCall] = mock.mock.calls as [string, RequestInit][];
    expect(tokenCall![0]).toContain('/v1/security/oauth2/token');
    expect(searchCall![0]).toContain('/v2/shopping/flight-offers');
  });

  it('maps response to correct FlightOffer shape', async () => {
    mockFetch(TOKEN_RESP, { data: [AMADEUS_OFFER] });

    const offers = await provider.searchFlights(
      { origin: 'RUH', destination: 'JED', departureDate: '2026-06-01', passengers: [{ type: 'ADT', count: 1 }] },
      CREDS,
    );

    const offer = offers[0]!;
    expect(offer.airline).toBe('SV');
    expect(offer.flightNumber).toBe('SV623');
    expect(offer.origin).toBe('RUH');
    expect(offer.destination).toBe('JED');
    expect(offer.cabin).toBe('economy');
    expect(offer.fareHalalas).toBe(50000);    // 500.00 SAR base × 100
    expect(offer.totalHalalas).toBe(60000);   // 600.00 SAR total × 100
    expect(offer.taxHalalas).toBe(10000);     // 600 - 500 = 100 SAR × 100
    expect(offer.currency).toBe('SAR');
    expect(offer.fareClass).toBe('Y');
    expect(offer.fareBasis).toBe('YECON');
    expect(offer.seatsAvailable).toBe(7);
    expect(offer.durationMinutes).toBe(70);   // PT1H10M
  });

  it('attaches _raw to each offer (required for createPNR)', async () => {
    mockFetch(TOKEN_RESP, { data: [AMADEUS_OFFER] });

    const offers = await provider.searchFlights(
      { origin: 'RUH', destination: 'JED', departureDate: '2026-06-01', passengers: [{ type: 'ADT', count: 1 }] },
      CREDS,
    );

    expect(offers[0]!._raw).toBeDefined();
    expect((offers[0]!._raw as { id: string }).id).toBe('offer_SV623_1');
  });

  it('reuses cached token on second search (only 1 token call for 2 searches)', async () => {
    const mock = mockFetch(
      TOKEN_RESP,
      { data: [AMADEUS_OFFER] },
      { data: [AMADEUS_OFFER] },  // second search
    );

    await provider.searchFlights(
      { origin: 'RUH', destination: 'JED', departureDate: '2026-06-01', passengers: [{ type: 'ADT', count: 1 }] },
      CREDS,
    );
    await provider.searchFlights(
      { origin: 'RUH', destination: 'DXB', departureDate: '2026-06-01', passengers: [{ type: 'ADT', count: 1 }] },
      CREDS,
    );

    // Total fetch calls: 1 token + 2 searches = 3
    expect(mock.mock.calls).toHaveLength(3);
    // First call is token, rest are search
    expect((mock.mock.calls[0] as [string])[0]).toContain('/oauth2/token');
    expect((mock.mock.calls[1] as [string])[0]).toContain('/flight-offers');
    expect((mock.mock.calls[2] as [string])[0]).toContain('/flight-offers');
  });

  it('returns empty array when Amadeus returns no offers', async () => {
    mockFetch(TOKEN_RESP, { data: [] });

    const offers = await provider.searchFlights(
      { origin: 'JED', destination: 'NYC', departureDate: '2026-06-01', passengers: [{ type: 'ADT', count: 1 }] },
      CREDS,
    );
    expect(offers).toEqual([]);
  });
});

describe('AmadeusProvider — createPNR()', () => {
  let provider: AmadeusProvider;

  beforeEach(() => { provider = new AmadeusProvider(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('calls pricing then flight-orders, returns PnrResult', async () => {
    const mock = mockFetch(
      TOKEN_RESP,
      { data: { type: 'flight-offers-pricing', flightOffers: [AMADEUS_OFFER] } },  // pricing
      { data: AMADEUS_ORDER },                                                       // order
    );

    const offer: FlightOffer = {
      id:              'offer_SV623_1',
      provider:        'amadeus',
      airline:         'SV',
      flightNumber:    'SV623',
      origin:          'RUH',
      destination:     'JED',
      departureAt:     '2026-06-01T08:00:00',
      arrivalAt:       '2026-06-01T09:10:00',
      durationMinutes: 70,
      cabin:           'economy',
      fareHalalas:     50000,
      taxHalalas:      10000,
      totalHalalas:    60000,
      currency:        'SAR',
      seatsAvailable:  7,
      fareClass:       'Y',
      fareBasis:       'YECON',
      _raw:            AMADEUS_OFFER,
    };

    const passenger: PassengerInfo = {
      type:           'ADT',
      firstName:      'Ahmed',
      lastName:       'AlSaudi',
      dateOfBirth:    '1990-01-01',
      passportNumber: 'A12345678',
      nationality:    'SA',
    };

    const pnr = await provider.createPNR(
      { offer, passengers: [passenger], contactEmail: 'test@example.com' },
      CREDS,
    );

    // Verify 3 calls: token + pricing + order
    expect(mock.mock.calls).toHaveLength(3);
    expect((mock.mock.calls[1] as [string])[0]).toContain('/flight-offers/pricing');
    expect((mock.mock.calls[2] as [string])[0]).toContain('/booking/flight-orders');

    // Verify PnrResult shape
    expect(pnr.pnrCode).toBe('eJzTd9f3ABCD');
    expect(pnr.gds).toBe('amadeus');
    expect(pnr.status).toBe('CONFIRMED');
    expect(pnr.expiresAt).toBe('2026-06-02T00:00:00');
    expect(pnr.segments).toHaveLength(1);
    expect(pnr.segments[0]!.flightNumber).toBe('SV623');
    expect(pnr.totalHalalas).toBe(60000);
    expect(pnr.currency).toBe('SAR');
  });

  it('throws if offer._raw is missing', async () => {
    const offerWithoutRaw: FlightOffer = {
      id: 'x', provider: 'amadeus', airline: 'SV', flightNumber: 'SV1',
      origin: 'RUH', destination: 'JED', departureAt: '', arrivalAt: '',
      durationMinutes: 0, cabin: 'economy', fareHalalas: 0, taxHalalas: 0,
      totalHalalas: 0, currency: 'SAR', seatsAvailable: null,
      fareClass: 'Y', fareBasis: '',
      // _raw intentionally omitted
    };

    // No fetch needed — should throw before any HTTP call
    vi.stubGlobal('fetch', vi.fn());

    await expect(
      provider.createPNR(
        { offer: offerWithoutRaw, passengers: [{ type: 'ADT', firstName: 'A', lastName: 'B' }], contactEmail: 'a@b.com' },
        CREDS,
      ),
    ).rejects.toThrow(/offer\._raw is missing/);
  });
});

describe('AmadeusProvider — retrievePNR() and cancelPNR()', () => {
  let provider: AmadeusProvider;

  beforeEach(() => { provider = new AmadeusProvider(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('retrievePNR calls GET /v1/booking/flight-orders/{id}', async () => {
    const mock = mockFetch(TOKEN_RESP, { data: AMADEUS_ORDER });

    const pnr = await provider.retrievePNR('eJzTd9f3ABCD', CREDS);

    expect((mock.mock.calls[1] as [string])[0]).toContain('/booking/flight-orders/eJzTd9f3ABCD');
    expect(pnr.pnrCode).toBe('eJzTd9f3ABCD');
    expect(pnr.gds).toBe('amadeus');
  });

  it('cancelPNR calls DELETE /v1/booking/flight-orders/{id}', async () => {
    const mock = mockFetch(TOKEN_RESP);
    // cancelPNR gets 204 No Content
    (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true, status: 204,
      json: async () => ({}),
      text: async () => '',
    } as Response);

    await expect(provider.cancelPNR('eJzTd9f3ABCD', CREDS)).resolves.toBeUndefined();

    const deleteCall = mock.mock.calls[1] as [string, RequestInit];
    expect(deleteCall[0]).toContain('/booking/flight-orders/eJzTd9f3ABCD');
    expect(deleteCall[1]?.method).toBe('DELETE');
  });
});

describe('AmadeusProvider — NotImplemented operations', () => {
  const provider = new AmadeusProvider();
  const pnrCode  = 'TEST_PNR';
  const fop      = { type: 'cash' as const, amountHalalas: 60000 };

  afterEach(() => { vi.unstubAllGlobals(); });

  it('issueTicket throws with helpful message', async () => {
    await expect(
      provider.issueTicket(
        { pnrCode, passengerNames: ['Ahmed'], formOfPayment: fop },
        CREDS,
      ),
    ).rejects.toThrow(/issueTicket is not yet available for Amadeus/);
  });

  it('voidTicket throws with helpful message', async () => {
    await expect(
      provider.voidTicket({ ticketNumber: '0572123456789' }, CREDS),
    ).rejects.toThrow(/voidTicket is not yet available/);
  });

  it('refundTicket throws with helpful message', async () => {
    await expect(
      provider.refundTicket(
        { ticketNumber: '0572123456789', reason: 'cancel', penaltyHalalas: 0 },
        CREDS,
      ),
    ).rejects.toThrow(/refundTicket is not yet available/);
  });
});

describe('Mock ↔ Amadeus interface parity', () => {
  it('both providers expose identical FlightProvider method signatures', () => {
    const amadeus = new AmadeusProvider();
    const mock    = new MockFlightProvider();

    const methods = [
      'searchFlights', 'createPNR', 'retrievePNR', 'cancelPNR',
      'issueTicket', 'voidTicket', 'refundTicket', 'isConfigured',
    ] as const;

    for (const method of methods) {
      expect(typeof amadeus[method]).toBe('function');
      expect(typeof mock[method]).toBe('function');
    }
  });

  it('MockFlightProvider.issueTicket() succeeds (mock is fully implemented)', async () => {
    const mock = new MockFlightProvider();
    const mockCreds: ProviderCredentials = { providerCode: 'amadeus', payload: {} };

    const tickets = await mock.issueTicket(
      { pnrCode: 'MOCK001', passengerNames: ['Test Passenger'], formOfPayment: { type: 'cash', amountHalalas: 60000 } },
      mockCreds as ProviderCredentials,
    );
    expect(tickets).toHaveLength(1);
    expect(tickets[0]!.status).toBe('issued');
  });
});
