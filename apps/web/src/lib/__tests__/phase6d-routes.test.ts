/**
 * Phase 6-D — Route Handler Integration Tests
 *
 * Tests the full Next.js App Router route layer for the GDS travel cycle:
 *
 *   POST /api/travel/flights/search
 *   POST /api/travel/pnr
 *   GET  /api/travel/pnr/[code]
 *
 * Strategy:
 *  - All external dependencies (auth, rate-limit, provider, DB, logging) are mocked.
 *  - The mock provider returns deterministic results; we verify the route correctly
 *    transforms provider output into HTTP responses and DB inserts.
 *  - Error paths: 400 / 401 / 409 / 429 / 500 are all exercised.
 *
 * No real network or DB connections.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PnrResult, FlightOffer }           from '@masarat/travel-providers';

// ── Module mocks ───────────────────────────────────────────────────────────────

vi.mock('@/lib/api-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-auth')>();
  return {
    ...actual,
    verifyAuth: vi.fn().mockResolvedValue({
      uid:      'user_test_uid',
      agencyId: 'agency_test_id',
      role:     'admin',
    }),
  };
});

vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return {
    ...actual,
    checkRateLimit: vi.fn().mockResolvedValue({
      success: true, limit: 30, remaining: 28, resetAt: new Date(),
    }),
    rateLimitHeaders: vi.fn().mockReturnValue({
      'X-RateLimit-Limit': '30',
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': new Date().toISOString(),
    }),
  };
});

vi.mock('@/lib/provider-factory', () => ({
  resolveFlightProvider: vi.fn(),
}));

vi.mock('@/lib/travel-event-log', () => ({
  logTravelEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/provider-sync-log', () => ({
  logProviderSync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
  },
}));

// ── Imports ────────────────────────────────────────────────────────────────────

import { db }                              from '@/lib/db';
import { verifyAuth }                       from '@/lib/api-auth';
import { checkRateLimit }                   from '@/lib/rate-limit';
import { resolveFlightProvider }            from '@/lib/provider-factory';
import type { ResolvedProvider }            from '@/lib/provider-factory';
import { logTravelEvent }                   from '@/lib/travel-event-log';
import { POST as searchPost }     from '@/app/api/travel/flights/search/route';
import { POST as pnrPost }        from '@/app/api/travel/pnr/route';
import { GET  as pnrGet }         from '@/app/api/travel/pnr/[code]/route';

// ── Test fixtures ──────────────────────────────────────────────────────────────

const MOCK_OFFER: FlightOffer = {
  id:              'offer_sv623_test',
  provider:        'amadeus',
  airline:         'SV',
  flightNumber:    'SV623',
  origin:          'RUH',
  destination:     'JED',
  departureAt:     '2026-06-01T08:00:00+03:00',
  arrivalAt:       '2026-06-01T09:10:00+03:00',
  durationMinutes: 70,
  cabin:           'economy',
  fareHalalas:     50000,
  taxHalalas:      10000,
  totalHalalas:    60000,
  currency:        'SAR',
  seatsAvailable:  9,
  fareClass:       'Y',
  fareBasis:       'YOWSV',
  _raw:            { id: 'offer_sv623_test', source: 'GDS' },
};

const MOCK_PNR: PnrResult = {
  pnrCode:      'MOCK623XYZ',
  gds:          'amadeus',
  status:       'CONFIRMED',
  expiresAt:    '2026-06-02T08:00:00.000Z',
  passengers:   [{ type: 'ADT', firstName: 'Ahmed', lastName: 'AlSaudi' }],
  segments:     [{
    airline:       'SV',
    flightNumber:  'SV623',
    origin:        'RUH',
    destination:   'JED',
    departureDate: '2026-06-01',
    departureTime: '08:00',
    arrivalDate:   '2026-06-01',
    arrivalTime:   '09:10',
    bookingClass:  'Y',
    fareBasis:     'YOWSV',
    status:        'HK',
  }],
  totalHalalas: 60000,
  currency:     'SAR',
};

/** A mock FlightProvider that returns MOCK_OFFER and MOCK_PNR. */
const MOCK_PROVIDER = {
  providerCode:  'amadeus',
  providerType:  'gds',
  isConfigured:  vi.fn().mockReturnValue(true),
  searchFlights: vi.fn().mockResolvedValue([MOCK_OFFER]),
  createPNR:     vi.fn().mockResolvedValue(MOCK_PNR),
  retrievePNR:   vi.fn().mockResolvedValue(MOCK_PNR),
  cancelPNR:     vi.fn().mockResolvedValue(undefined),
  issueTicket:   vi.fn(),
  voidTicket:    vi.fn(),
  refundTicket:  vi.fn(),
};

const RESOLVED_PROVIDER = {
  provider:     MOCK_PROVIDER,
  credentials:  { providerCode: 'amadeus' as const, payload: {} },
  providerCode: 'amadeus',
  label:        'Test Amadeus',
} as unknown as ResolvedProvider;

// ── DB mock helpers ────────────────────────────────────────────────────────────

function setupInsert(rejectWith?: Error) {
  const valuesFn = rejectWith
    ? vi.fn().mockRejectedValue(rejectWith)
    : vi.fn().mockResolvedValue([]);

  vi.mocked(db.insert).mockReturnValue(
    { values: valuesFn } as unknown as ReturnType<typeof db.insert>,
  );
  return valuesFn;
}

function setupSelect(rows: unknown[]) {
  const chain = {
    from:  vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  vi.mocked(db.select).mockReturnValue(chain as unknown as ReturnType<typeof db.select>);
}

// ── Request factories ──────────────────────────────────────────────────────────

function postRequest(url: string, body: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method:  'POST',
    headers: { 'Authorization': 'Bearer test_token', 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
}

function getRequest(url: string): Request {
  return new Request(`http://localhost${url}`, {
    method:  'GET',
    headers: { 'Authorization': 'Bearer test_token' },
  });
}

// ── Shared beforeEach ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveFlightProvider).mockResolvedValue(RESOLVED_PROVIDER);
  vi.mocked(checkRateLimit).mockResolvedValue({ success: true, limit: 30, remaining: 28, resetAt: new Date() });
  vi.mocked(verifyAuth).mockResolvedValue({ uid: 'user_test_uid', agencyId: 'agency_test_id', role: 'admin' });
  setupInsert();
  setupSelect([]);
  MOCK_PROVIDER.searchFlights.mockResolvedValue([MOCK_OFFER]);
  MOCK_PROVIDER.createPNR.mockResolvedValue(MOCK_PNR);
  MOCK_PROVIDER.retrievePNR.mockResolvedValue(MOCK_PNR);
});

// ── POST /api/travel/flights/search ───────────────────────────────────────────

describe('POST /api/travel/flights/search', () => {

  it('returns 200 with offers array for a valid request', async () => {
    const req = postRequest('/api/travel/flights/search', {
      credentialId: 'cred_123',
      params: {
        origin: 'RUH', destination: 'JED', departureDate: '2026-06-01',
        passengers: [{ type: 'ADT', count: 1 }],
      },
    });

    const res  = await searchPost(req);
    const body = await res.json() as { offers: FlightOffer[]; provider: string; searchedAt: string };

    expect(res.status).toBe(200);
    expect(body.offers).toHaveLength(1);
    expect(body.offers[0]?.flightNumber).toBe('SV623');
    expect(body.provider).toBe('amadeus');
    expect(typeof body.searchedAt).toBe('string');
  });

  it('passes search params to provider.searchFlights correctly', async () => {
    const req = postRequest('/api/travel/flights/search', {
      credentialId: 'cred_123',
      params: {
        origin: 'RUH', destination: 'DXB', departureDate: '2026-07-15',
        passengers: [{ type: 'ADT', count: 2 }],
        cabin: 'business',
      },
    });

    await searchPost(req);

    expect(MOCK_PROVIDER.searchFlights).toHaveBeenCalledWith(
      expect.objectContaining({
        origin:        'RUH',
        destination:   'DXB',
        departureDate: '2026-07-15',
        cabin:         'business',
      }),
      expect.any(Object),
    );
  });

  it('returns 400 when credentialId is missing', async () => {
    const req = postRequest('/api/travel/flights/search', {
      params: { origin: 'RUH', destination: 'JED', departureDate: '2026-06-01', passengers: [{ type: 'ADT', count: 1 }] },
    });

    const res = await searchPost(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when params object is missing', async () => {
    const req = postRequest('/api/travel/flights/search', { credentialId: 'cred_123' });

    const res = await searchPost(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when origin is missing from params', async () => {
    const req = postRequest('/api/travel/flights/search', {
      credentialId: 'cred_123',
      params: { destination: 'JED', departureDate: '2026-06-01', passengers: [{ type: 'ADT', count: 1 }] },
    });

    const res = await searchPost(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when passengers array is empty', async () => {
    const req = postRequest('/api/travel/flights/search', {
      credentialId: 'cred_123',
      params: { origin: 'RUH', destination: 'JED', departureDate: '2026-06-01', passengers: [] },
    });

    const res = await searchPost(req);
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate limit is exceeded', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      success: false, limit: 30, remaining: 0, resetAt: new Date(),
    });

    const req = postRequest('/api/travel/flights/search', {
      credentialId: 'cred_123',
      params: { origin: 'RUH', destination: 'JED', departureDate: '2026-06-01', passengers: [{ type: 'ADT', count: 1 }] },
    });

    const res = await searchPost(req);
    expect(res.status).toBe(429);
  });

  it('returns 500 when provider.searchFlights throws', async () => {
    MOCK_PROVIDER.searchFlights.mockRejectedValueOnce(new Error('Amadeus API timeout'));

    const req = postRequest('/api/travel/flights/search', {
      credentialId: 'cred_123',
      params: { origin: 'RUH', destination: 'JED', departureDate: '2026-06-01', passengers: [{ type: 'ADT', count: 1 }] },
    });

    const res = await searchPost(req);
    expect(res.status).toBe(500);
  });

  it('logs search_flights_requested and search_flights_succeeded events', async () => {
    vi.mocked(logTravelEvent).mockReset();

    const req = postRequest('/api/travel/flights/search', {
      credentialId: 'cred_123',
      params: { origin: 'RUH', destination: 'JED', departureDate: '2026-06-01', passengers: [{ type: 'ADT', count: 1 }] },
    });

    await searchPost(req);

    const calls = vi.mocked(logTravelEvent).mock.calls;
    const eventTypes = calls.map(c => (c[0] as { eventType: string }).eventType);
    expect(eventTypes).toContain('search_flights_requested');
    expect(eventTypes).toContain('search_flights_succeeded');
  });

  it('logs search_flights_failed when provider throws', async () => {
    vi.mocked(logTravelEvent).mockReset();
    MOCK_PROVIDER.searchFlights.mockRejectedValueOnce(new Error('provider error'));

    const req = postRequest('/api/travel/flights/search', {
      credentialId: 'cred_123',
      params: { origin: 'RUH', destination: 'JED', departureDate: '2026-06-01', passengers: [{ type: 'ADT', count: 1 }] },
    });

    await searchPost(req);

    const calls = vi.mocked(logTravelEvent).mock.calls;
    const eventTypes = calls.map(c => (c[0] as { eventType: string }).eventType);
    expect(eventTypes).toContain('search_flights_failed');
    expect(eventTypes).not.toContain('search_flights_succeeded');
  });

  it('returns 401 when auth token is missing', async () => {
    const { ApiAuthError } = await import('@/lib/api-auth');
    vi.mocked(verifyAuth).mockRejectedValueOnce(new ApiAuthError('يجب تسجيل الدخول أولاً', 401));

    const req = new Request('http://localhost/api/travel/flights/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentialId: 'x', params: { origin: 'RUH', destination: 'JED', departureDate: '2026-06-01', passengers: [{ type: 'ADT', count: 1 }] } }),
    });

    const res = await searchPost(req);
    expect(res.status).toBe(401);
  });
});

// ── POST /api/travel/pnr ──────────────────────────────────────────────────────

describe('POST /api/travel/pnr', () => {
  const VALID_PNR_BODY = {
    credentialId: 'cred_123',
    offer:        MOCK_OFFER,
    passengers:   [{ type: 'ADT', firstName: 'Ahmed', lastName: 'AlSaudi' }],
    contactEmail: 'ahmed@example.com',
  };

  it('returns 201 with {pnr, pnrDbId} for a valid request', async () => {
    const req = postRequest('/api/travel/pnr', VALID_PNR_BODY);
    const res  = await pnrPost(req);
    const body = await res.json() as { pnr: PnrResult; pnrDbId: string };

    expect(res.status).toBe(201);
    expect(body.pnr.pnrCode).toBe('MOCK623XYZ');
    expect(body.pnr.status).toBe('CONFIRMED');
    expect(typeof body.pnrDbId).toBe('string');
    expect(body.pnrDbId.length).toBeGreaterThan(10);
  });

  it('calls provider.createPNR with offer, passengers, and contactEmail', async () => {
    const req = postRequest('/api/travel/pnr', VALID_PNR_BODY);
    await pnrPost(req);

    expect(MOCK_PROVIDER.createPNR).toHaveBeenCalledWith(
      expect.objectContaining({
        offer:        expect.objectContaining({ flightNumber: 'SV623' }),
        passengers:   expect.arrayContaining([expect.objectContaining({ firstName: 'Ahmed' })]),
        contactEmail: 'ahmed@example.com',
      }),
      expect.any(Object),
    );
  });

  it('persists PNR to database via db.insert', async () => {
    const insertValues = setupInsert();

    const req = postRequest('/api/travel/pnr', VALID_PNR_BODY);
    await pnrPost(req);

    expect(insertValues).toHaveBeenCalledOnce();
    const inserted = insertValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted['pnrCode']).toBe('MOCK623XYZ');
    expect(inserted['gds']).toBe('amadeus');
    expect(inserted['airline']).toBe('SV');
    expect(inserted['origin']).toBe('RUH');
    expect(inserted['destination']).toBe('JED');
    expect(inserted['departureDate']).toBe('2026-06-01');
    expect(inserted['passengerCount']).toBe(1);
    expect(inserted['totalHalalas']).toBe(60000);
    expect(inserted['status']).toBe('active');
    expect(inserted['expiresAt']).toEqual(new Date('2026-06-02T08:00:00.000Z'));
  });

  it('passengerNames in DB insert is a JSON array of full names', async () => {
    const insertValues = setupInsert();
    MOCK_PROVIDER.createPNR.mockResolvedValueOnce({
      ...MOCK_PNR,
      passengers: [
        { type: 'ADT', firstName: 'Ahmed', lastName: 'AlSaudi' },
        { type: 'ADT', firstName: 'Fatima', lastName: 'AlZahrani' },
      ],
    });

    const req = postRequest('/api/travel/pnr', {
      ...VALID_PNR_BODY,
      passengers: [
        { type: 'ADT', firstName: 'Ahmed', lastName: 'AlSaudi' },
        { type: 'ADT', firstName: 'Fatima', lastName: 'AlZahrani' },
      ],
    });
    await pnrPost(req);

    const inserted = insertValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted['passengerNames']).toEqual(['Ahmed AlSaudi', 'Fatima AlZahrani']);
  });

  it('returns 400 when credentialId is missing', async () => {
    const { credentialId: _, ...body } = VALID_PNR_BODY;
    const res = await pnrPost(postRequest('/api/travel/pnr', body));
    expect(res.status).toBe(400);
  });

  it('returns 400 when offer is missing', async () => {
    const { offer: _, ...body } = VALID_PNR_BODY;
    const res = await pnrPost(postRequest('/api/travel/pnr', body));
    expect(res.status).toBe(400);
  });

  it('returns 400 when passengers array is empty', async () => {
    const res = await pnrPost(postRequest('/api/travel/pnr', { ...VALID_PNR_BODY, passengers: [] }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when contactEmail is missing', async () => {
    const { contactEmail: _, ...body } = VALID_PNR_BODY;
    const res = await pnrPost(postRequest('/api/travel/pnr', body));
    expect(res.status).toBe(400);
  });

  it('returns 409 when PNR already exists (unique constraint violation)', async () => {
    setupInsert(new Error('duplicate key value violates unique constraint "pnr_agency_code_uq"'));

    const res = await pnrPost(postRequest('/api/travel/pnr', VALID_PNR_BODY));
    expect(res.status).toBe(409);
  });

  it('returns 429 when rate limit is exceeded', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ success: false, limit: 30, remaining: 0, resetAt: new Date() });

    const res = await pnrPost(postRequest('/api/travel/pnr', VALID_PNR_BODY));
    expect(res.status).toBe(429);
  });

  it('logs create_pnr_requested and create_pnr_succeeded events', async () => {
    vi.mocked(logTravelEvent).mockReset();

    await pnrPost(postRequest('/api/travel/pnr', VALID_PNR_BODY));

    const eventTypes = vi.mocked(logTravelEvent).mock.calls.map(
      c => (c[0] as { eventType: string }).eventType,
    );
    expect(eventTypes).toContain('create_pnr_requested');
    expect(eventTypes).toContain('create_pnr_succeeded');
  });

  it('logs create_pnr_failed and does not insert to DB when provider throws', async () => {
    vi.mocked(logTravelEvent).mockReset();
    const insertValues = setupInsert();
    MOCK_PROVIDER.createPNR.mockRejectedValueOnce(new Error('Amadeus PNR creation failed'));

    await pnrPost(postRequest('/api/travel/pnr', VALID_PNR_BODY));

    const eventTypes = vi.mocked(logTravelEvent).mock.calls.map(
      c => (c[0] as { eventType: string }).eventType,
    );
    expect(eventTypes).toContain('create_pnr_failed');
    // DB insert should NOT be called when provider fails
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('returns 500 when provider.createPNR throws', async () => {
    MOCK_PROVIDER.createPNR.mockRejectedValueOnce(new Error('GDS error'));

    const res = await pnrPost(postRequest('/api/travel/pnr', VALID_PNR_BODY));
    expect(res.status).toBe(500);
  });

  it('stores bookingId and customerId when provided', async () => {
    const insertValues = setupInsert();

    await pnrPost(postRequest('/api/travel/pnr', {
      ...VALID_PNR_BODY,
      bookingId:  'booking_xyz',
      customerId: 'customer_abc',
    }));

    const inserted = insertValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted['bookingId']).toBe('booking_xyz');
    expect(inserted['customerId']).toBe('customer_abc');
  });
});

// ── GET /api/travel/pnr/[code] ────────────────────────────────────────────────

describe('GET /api/travel/pnr/[code]', () => {

  const DB_PNR_ROW = {
    id:             'pnr_db_123',
    agencyId:       'agency_test_id',
    pnrCode:        'MOCK623XYZ',
    gds:            'amadeus',
    airline:        'SV',
    flightNumbers:  JSON.stringify(['SV623']),
    origin:         'RUH',
    destination:    'JED',
    departureDate:  '2026-06-01',
    passengerCount: 1,
    passengerNames: JSON.stringify(['Ahmed AlSaudi']),
    fareHalalas:    50000,
    taxHalalas:     10000,
    totalHalalas:   60000,
    status:         'active',
    createdAt:      new Date(),
    updatedAt:      new Date(),
  };

  it('returns 200 with DB record and source="database" when no credentialId', async () => {
    setupSelect([DB_PNR_ROW]);

    const req = getRequest('http://localhost/api/travel/pnr/MOCK623XYZ');
    const res  = await pnrGet(req, { params: { code: 'MOCK623XYZ' } });
    const body = await res.json() as { pnr: typeof DB_PNR_ROW; source: string };

    expect(res.status).toBe(200);
    expect(body.source).toBe('database');
    expect(body.pnr.pnrCode).toBe('MOCK623XYZ');
    expect(body.pnr.airline).toBe('SV');
  });

  it('returns 404 when PNR not in DB and no credentialId', async () => {
    setupSelect([]);

    const req = getRequest('http://localhost/api/travel/pnr/NOTFOUND');
    const res  = await pnrGet(req, { params: { code: 'NOTFOUND' } });

    expect(res.status).toBe(404);
  });

  it('returns 200 with GDS result and source="gds" when credentialId provided', async () => {
    setupSelect([DB_PNR_ROW]);

    const req = getRequest('http://localhost/api/travel/pnr/MOCK623XYZ?credentialId=cred_123');
    const res  = await pnrGet(req, { params: { code: 'MOCK623XYZ' } });
    const body = await res.json() as { pnr: PnrResult; source: string };

    expect(res.status).toBe(200);
    expect(body.source).toBe('gds');
    expect(body.pnr.pnrCode).toBe('MOCK623XYZ');
    expect(body.pnr.status).toBe('CONFIRMED');
  });

  it('calls provider.retrievePNR with the decoded PNR code', async () => {
    setupSelect([DB_PNR_ROW]);

    const req = getRequest('http://localhost/api/travel/pnr/MOCK623XYZ?credentialId=cred_123');
    await pnrGet(req, { params: { code: 'MOCK623XYZ' } });

    expect(MOCK_PROVIDER.retrievePNR).toHaveBeenCalledWith(
      'MOCK623XYZ',
      expect.any(Object),
    );
  });

  it('returns 500 when GDS retrievePNR throws', async () => {
    setupSelect([DB_PNR_ROW]);
    MOCK_PROVIDER.retrievePNR.mockRejectedValueOnce(new Error('GDS timeout'));

    const req = getRequest('http://localhost/api/travel/pnr/MOCK623XYZ?credentialId=cred_123');
    const res  = await pnrGet(req, { params: { code: 'MOCK623XYZ' } });

    expect(res.status).toBe(500);
  });

  it('logs retrieve_pnr_requested + retrieve_pnr_succeeded for GDS fetch', async () => {
    vi.mocked(logTravelEvent).mockReset();
    setupSelect([DB_PNR_ROW]);

    const req = getRequest('http://localhost/api/travel/pnr/MOCK623XYZ?credentialId=cred_123');
    await pnrGet(req, { params: { code: 'MOCK623XYZ' } });

    const eventTypes = vi.mocked(logTravelEvent).mock.calls.map(
      c => (c[0] as { eventType: string }).eventType,
    );
    expect(eventTypes).toContain('retrieve_pnr_requested');
    expect(eventTypes).toContain('retrieve_pnr_succeeded');
  });

  it('does NOT call provider.retrievePNR for DB-only request (no credentialId)', async () => {
    setupSelect([DB_PNR_ROW]);

    const req = getRequest('http://localhost/api/travel/pnr/MOCK623XYZ');
    await pnrGet(req, { params: { code: 'MOCK623XYZ' } });

    expect(MOCK_PROVIDER.retrievePNR).not.toHaveBeenCalled();
  });
});
