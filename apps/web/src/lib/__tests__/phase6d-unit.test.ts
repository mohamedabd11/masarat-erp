/**
 * Phase 6-D — Unit Tests: Provider Factory · Event Log · Rate Limit · MockFlightProvider
 *
 * Tests:
 *  1. resolveFlightProvider — DB lookup + credential decryption + provider wiring
 *  2. logTravelEvent — fire-and-forget DB insert, silences failures
 *  3. checkRateLimit — gds_search 30/min boundary enforcement
 *  4. MockFlightProvider — full Search → CreatePNR data integrity cycle
 *
 * External dependencies mocked: @/lib/db, @/lib/credential-crypto.
 * No real network or DB connections.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
  },
}));

vi.mock('@/lib/credential-crypto', () => ({
  decryptCredential: vi.fn(),
}));

// ── Imports ────────────────────────────────────────────────────────────────────

import { db }                           from '@/lib/db';
import { decryptCredential }             from '@/lib/credential-crypto';
import { resolveFlightProvider }         from '@/lib/provider-factory';
import { logTravelEvent }                from '@/lib/travel-event-log';
import { checkRateLimit, RATE_LIMITS }   from '@/lib/rate-limit';
import { MockFlightProvider }            from '@masarat/travel-providers';
import type { ProviderCredentials }      from '@masarat/travel-providers';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Sets up a chainable Drizzle-style select mock returning the given rows. */
function setupSelectMock(rows: unknown[]) {
  const chain = {
    from:  vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  vi.mocked(db.select).mockReturnValue(
    chain as unknown as ReturnType<typeof db.select>,
  );
}

/** Sets up a chainable Drizzle-style insert mock. */
function setupInsertMock(resolveFn?: () => Promise<unknown>) {
  const valuesFn = vi.fn().mockResolvedValue(resolveFn ? undefined : []);
  if (resolveFn) valuesFn.mockImplementation(resolveFn);
  vi.mocked(db.insert).mockReturnValue(
    { values: valuesFn } as unknown as ReturnType<typeof db.insert>,
  );
  return valuesFn;
}

/** Minimal active credential row for amadeus. */
const FAKE_AMADEUS_ROW = {
  id:               'cred_123',
  agencyId:         'agency_abc',
  providerCode:     'amadeus',
  label:            'Test Amadeus',
  encryptedPayload: 'iv:tag:ciphertext',
  isActive:         true,
  keyVersion:       1,
  createdBy:        'user_1',
  createdAt:        new Date(),
  updatedAt:        new Date(),
  encryptedAt:      new Date(),
};

const FAKE_DECRYPTED_PAYLOAD = JSON.stringify({
  clientId:     'test_client_id',
  clientSecret: 'test_client_secret',
  hostname:     'test.api.amadeus.com',
});

// ── 1. resolveFlightProvider ───────────────────────────────────────────────────

describe('resolveFlightProvider', () => {
  beforeEach(() => {
    vi.mocked(decryptCredential).mockReturnValue(FAKE_DECRYPTED_PAYLOAD);
  });

  it('returns an AmadeusProvider for an active amadeus credential', async () => {
    setupSelectMock([FAKE_AMADEUS_ROW]);

    const result = await resolveFlightProvider('cred_123', 'agency_abc');

    expect(result.providerCode).toBe('amadeus');
    expect(result.label).toBe('Test Amadeus');
    expect(typeof result.provider.searchFlights).toBe('function');
    expect(typeof result.provider.createPNR).toBe('function');
  });

  it('credentials payload is correctly parsed from decrypted JSON', async () => {
    setupSelectMock([FAKE_AMADEUS_ROW]);

    const { credentials } = await resolveFlightProvider('cred_123', 'agency_abc');

    expect(credentials.providerCode).toBe('amadeus');
    expect(credentials.payload['clientId']).toBe('test_client_id');
    expect(credentials.payload['hostname']).toBe('test.api.amadeus.com');
  });

  it('throws when credential is not found (empty DB rows)', async () => {
    setupSelectMock([]);

    await expect(
      resolveFlightProvider('cred_missing', 'agency_abc'),
    ).rejects.toThrow(/غير موجودة أو معطّلة/);
  });

  it('throws when decryptCredential raises (key misconfigured)', async () => {
    setupSelectMock([FAKE_AMADEUS_ROW]);
    vi.mocked(decryptCredential).mockImplementation(() => {
      throw new Error('decryption failed');
    });

    await expect(
      resolveFlightProvider('cred_123', 'agency_abc'),
    ).rejects.toThrow(/فك تشفير/);
  });

  it('throws for an unsupported provider code', async () => {
    setupSelectMock([{ ...FAKE_AMADEUS_ROW, providerCode: 'galileo' }]);
    vi.mocked(decryptCredential).mockReturnValue(JSON.stringify({ key: 'val' }));

    await expect(
      resolveFlightProvider('cred_123', 'agency_abc'),
    ).rejects.toThrow(/galileo/);
  });

  it('throws when provider.isConfigured() returns false (incomplete payload)', async () => {
    setupSelectMock([FAKE_AMADEUS_ROW]);
    // Missing clientSecret → AmadeusProvider.isConfigured returns false
    vi.mocked(decryptCredential).mockReturnValue(
      JSON.stringify({ clientId: 'id_only' }),
    );

    await expect(
      resolveFlightProvider('cred_123', 'agency_abc'),
    ).rejects.toThrow(/غير مكتملة/);
  });
});

// ── 2. logTravelEvent ─────────────────────────────────────────────────────────

describe('logTravelEvent', () => {
  it('calls db.insert with all required fields', async () => {
    const insertValues = setupInsertMock();

    await logTravelEvent({
      agencyId:     'agency_abc',
      eventType:    'search_flights_requested',
      provider:     'amadeus',
      actorId:      'user_1',
      payload:      { origin: 'RUH', destination: 'JED' },
    });

    expect(insertValues).toHaveBeenCalledOnce();
    const arg = insertValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(typeof arg['id']).toBe('string');
    expect((arg['id'] as string).length).toBeGreaterThan(10);   // UUID
    expect(arg['agencyId']).toBe('agency_abc');
    expect(arg['eventType']).toBe('search_flights_requested');
    expect(arg['provider']).toBe('amadeus');
    expect(arg['actorId']).toBe('user_1');
    expect(arg['payload']).toEqual({ origin: 'RUH', destination: 'JED' });
  });

  it('uses null for optional fields when omitted', async () => {
    const insertValues = setupInsertMock();

    await logTravelEvent({
      agencyId:  'agency_abc',
      eventType: 'search_flights_failed',
      provider:  'amadeus',
    });

    const arg = insertValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg['resourceId']).toBeNull();
    expect(arg['resourceType']).toBeNull();
    expect(arg['actorId']).toBeNull();
    expect(arg['payload']).toBeNull();
  });

  it('never throws when db.insert fails (fire-and-forget)', async () => {
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error('DB connection lost')),
    } as unknown as ReturnType<typeof db.insert>);

    // Must resolve (not reject) even when DB is down
    await expect(
      logTravelEvent({ agencyId: 'a', eventType: 'e', provider: 'p' }),
    ).resolves.toBeUndefined();
  });

  it('assigns a unique UUID for each event (non-empty, 36-char format)', async () => {
    const ids: string[] = [];

    for (let i = 0; i < 3; i++) {
      const insertValues = setupInsertMock();
      await logTravelEvent({ agencyId: 'a', eventType: 'e', provider: 'p' });
      const arg = insertValues.mock.calls[0]?.[0] as Record<string, unknown>;
      ids.push(arg['id'] as string);
    }

    // All IDs are valid UUID format
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    for (const id of ids) {
      expect(id).toMatch(UUID_RE);
    }
    // All IDs are unique
    expect(new Set(ids).size).toBe(3);
  });
});

// ── 3. checkRateLimit — gds_search ────────────────────────────────────────────

describe('checkRateLimit — gds_search (30/min)', () => {
  // Use unique identifier per test-run to avoid cross-test contamination
  const identifier = () => `test_agency_${Date.now()}_${Math.random()}`;

  it('gds_search limit is configured as 30 per minute', () => {
    expect(RATE_LIMITS.gds_search.limit).toBe(30);
    expect(RATE_LIMITS.gds_search.windowMs).toBe(60_000);
  });

  it('first request succeeds with remaining = 29', async () => {
    const result = await checkRateLimit(identifier(), 'gds_search');

    expect(result.success).toBe(true);
    expect(result.limit).toBe(30);
    expect(result.remaining).toBe(29);
    expect(result.resetAt).toBeInstanceOf(Date);
  });

  it('all 30 calls within window succeed', async () => {
    const id = identifier();

    for (let i = 1; i <= 30; i++) {
      const result = await checkRateLimit(id, 'gds_search');
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(30 - i);
    }
  });

  it('31st call within same window is rate-limited (success = false)', async () => {
    const id = identifier();

    for (let i = 0; i < 30; i++) {
      await checkRateLimit(id, 'gds_search');
    }

    const over = await checkRateLimit(id, 'gds_search');
    expect(over.success).toBe(false);
    expect(over.remaining).toBe(0);
  });

  it('different agencies have independent counters', async () => {
    const id1 = identifier();
    const id2 = identifier();

    // Exhaust agency 1
    for (let i = 0; i < 30; i++) await checkRateLimit(id1, 'gds_search');
    const blocked = await checkRateLimit(id1, 'gds_search');
    expect(blocked.success).toBe(false);

    // Agency 2 is unaffected
    const allowed = await checkRateLimit(id2, 'gds_search');
    expect(allowed.success).toBe(true);
  });
});

// ── 4. MockFlightProvider — full Search → CreatePNR data-integrity cycle ───────

describe('MockFlightProvider — Search → CreatePNR data integrity', () => {
  const provider  = new MockFlightProvider();
  const mockCreds = { providerCode: 'amadeus', payload: {} } as ProviderCredentials;

  it('searchFlights(RUH → JED) returns SV623 offer with correct fare fields', async () => {
    const offers = await provider.searchFlights(
      { origin: 'RUH', destination: 'JED', departureDate: '2026-06-01', passengers: [{ type: 'ADT', count: 1 }] },
      mockCreds,
    );

    expect(offers).toHaveLength(1);
    const offer = offers[0]!;
    expect(offer.flightNumber).toBe('SV623');
    expect(offer.airline).toBe('SV');
    expect(offer.origin).toBe('RUH');
    expect(offer.destination).toBe('JED');
    expect(offer.fareHalalas).toBe(50000);
    expect(offer.taxHalalas).toBe(10000);
    expect(offer.totalHalalas).toBe(60000);
    expect(offer.currency).toBe('SAR');
    expect(offer.cabin).toBe('economy');
    expect(offer.seatsAvailable).toBe(9);
  });

  it('searchFlights(RUH → DXB) returns FZ351 with limited seat availability (4)', async () => {
    const offers = await provider.searchFlights(
      { origin: 'RUH', destination: 'DXB', departureDate: '2026-06-01', passengers: [{ type: 'ADT', count: 2 }] },
      mockCreds,
    );

    expect(offers).toHaveLength(1);
    const offer = offers[0]!;
    expect(offer.flightNumber).toBe('FZ351');
    expect(offer.seatsAvailable).toBe(4);   // 4 ≤ 5 → should render as "seats left" in UI
  });

  it('searchFlights(DMM → CAI) returns MS663 overnight flight', async () => {
    const offers = await provider.searchFlights(
      { origin: 'DMM', destination: 'CAI', departureDate: '2026-06-02', passengers: [{ type: 'ADT', count: 1 }] },
      mockCreds,
    );

    expect(offers).toHaveLength(1);
    const offer = offers[0]!;
    expect(offer.flightNumber).toBe('MS663');
    expect(offer.durationMinutes).toBe(215);
    expect(offer.fareClass).toBe('M');
  });

  it('createPNR generates pnrCode starting with MOCK', async () => {
    const [offer] = await provider.searchFlights(
      { origin: 'RUH', destination: 'JED', departureDate: '2026-06-01', passengers: [{ type: 'ADT', count: 1 }] },
      mockCreds,
    );

    const pnr = await provider.createPNR(
      {
        offer:        offer!,
        passengers:   [{ type: 'ADT', firstName: 'Ahmed', lastName: 'AlSaudi' }],
        contactEmail: 'test@example.com',
      },
      mockCreds,
    );

    expect(pnr.pnrCode).toMatch(/^MOCK/);
    expect(pnr.status).toBe('HK');
    expect(pnr.gds).toBeTruthy();
    expect(pnr.currency).toBe('SAR');
    expect(pnr.expiresAt).toBeDefined();
    // Expiry is 24h in the future
    expect(new Date(pnr.expiresAt!).getTime()).toBeGreaterThan(Date.now());
  });

  it('createPNR segments mirror the offer route exactly', async () => {
    const [offer] = await provider.searchFlights(
      { origin: 'RUH', destination: 'JED', departureDate: '2026-06-01', passengers: [{ type: 'ADT', count: 1 }] },
      mockCreds,
    );

    const pnr = await provider.createPNR(
      {
        offer:        offer!,
        passengers:   [{ type: 'ADT', firstName: 'Fatima', lastName: 'AlZahrani' }],
        contactEmail: 'fatima@example.com',
      },
      mockCreds,
    );

    expect(pnr.segments).toHaveLength(1);
    const seg = pnr.segments[0]!;
    expect(seg.airline).toBe('SV');
    expect(seg.flightNumber).toBe('SV623');
    expect(seg.origin).toBe('RUH');
    expect(seg.destination).toBe('JED');
    expect(seg.departureDate).toBe('2026-06-01');
    expect(seg.bookingClass).toBe('Y');
    expect(seg.fareBasis).toBe('YOWSV');
  });

  it('createPNR passengers are echoed back from input', async () => {
    const [offer] = await provider.searchFlights(
      { origin: 'RUH', destination: 'JED', departureDate: '2026-06-01', passengers: [{ type: 'ADT', count: 1 }] },
      mockCreds,
    );

    const inputPassengers = [
      { type: 'ADT' as const, firstName: 'Omar',  lastName: 'AlOtaibi' },
      { type: 'ADT' as const, firstName: 'Sarah', lastName: 'AlGhamdi' },
    ];

    const pnr = await provider.createPNR(
      { offer: offer!, passengers: inputPassengers, contactEmail: 'group@agency.sa' },
      mockCreds,
    );

    expect(pnr.passengers).toHaveLength(2);
    expect(pnr.passengers[0]?.firstName).toBe('Omar');
    expect(pnr.passengers[1]?.firstName).toBe('Sarah');
  });

  it('searchFlights returns empty array for non-matching route', async () => {
    const results = await provider.searchFlights(
      { origin: 'JED', destination: 'NYC', departureDate: '2026-06-01', passengers: [{ type: 'ADT', count: 1 }] },
      mockCreds,
    );
    expect(results).toEqual([]);
  });

  it('isConfigured always returns true for MockFlightProvider', () => {
    expect(provider.isConfigured(mockCreds)).toBe(true);
    expect(provider.isConfigured({ providerCode: 'sabre', payload: {} } as ProviderCredentials)).toBe(true);
  });

  it('two consecutive createPNR calls produce different pnrCodes', async () => {
    const [offer] = await provider.searchFlights(
      { origin: 'RUH', destination: 'JED', departureDate: '2026-06-01', passengers: [{ type: 'ADT', count: 1 }] },
      mockCreds,
    );
    const params = {
      offer:        offer!,
      passengers:   [{ type: 'ADT' as const, firstName: 'Test', lastName: 'User' }],
      contactEmail: 'a@b.com',
    };

    const pnr1 = await provider.createPNR(params, mockCreds);
    // Add small delay to ensure different timestamp suffix
    await new Promise(r => setTimeout(r, 2));
    const pnr2 = await provider.createPNR(params, mockCreds);

    expect(pnr1.pnrCode).not.toBe(pnr2.pnrCode);
  });
});
