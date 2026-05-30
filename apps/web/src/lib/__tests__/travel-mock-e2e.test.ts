/**
 * E2E integration test for the MockFlightProvider.
 *
 * Tests the complete Search → PNR → Ticket → Void → Refund cycle using
 * purely static in-memory logic. No database or network required.
 */
import { describe, it, expect } from 'vitest';
import { MockFlightProvider } from '@masarat/travel-providers';
import type { ProviderCredentials, PassengerInfo } from '@masarat/travel-providers';

// Dummy credentials — mock provider never inspects them
const MOCK_CREDS: ProviderCredentials = {
  providerCode: 'amadeus', // cast required; mock ignores providerCode
  payload: {},
};

// Cast as unknown to satisfy the strict ProviderCode union while using mock
const creds = MOCK_CREDS as unknown as ProviderCredentials;

const provider = new MockFlightProvider();

describe('MockFlightProvider — complete travel flow', () => {

  // ─── 1. Search Flights ──────────────────────────────────────────────────────
  it('searchFlights returns the RUH→JED offer', async () => {
    const results = await provider.searchFlights(
      { origin: 'RUH', destination: 'JED', departureDate: '2026-06-01', passengers: [{ type: 'ADT', count: 1 }] },
      creds,
    );
    expect(results.length).toBe(1);
    const offer = results[0]!;
    expect(offer.flightNumber).toBe('SV623');
    expect(offer.origin).toBe('RUH');
    expect(offer.destination).toBe('JED');
    expect(offer.totalHalalas).toBe(60000);
    expect(offer.currency).toBe('SAR');
  });

  // ─── 2. Select Offer (pick the SV623) ─────────────────────────────────────
  it('searchFlights returns the RUH→DXB offer with correct fare details', async () => {
    const results = await provider.searchFlights(
      { origin: 'RUH', destination: 'DXB', departureDate: '2026-06-01', passengers: [{ type: 'ADT', count: 2 }] },
      creds,
    );
    expect(results.length).toBe(1);
    const offer = results[0]!;
    expect(offer.flightNumber).toBe('FZ351');
    expect(offer.fareHalalas).toBe(40000);
    expect(offer.taxHalalas).toBe(5000);
    expect(offer.totalHalalas).toBe(45000);
  });

  // ─── 3. Create PNR ─────────────────────────────────────────────────────────
  it('createPNR returns a PNR with correct structure and passengers', async () => {
    const results = await provider.searchFlights(
      { origin: 'RUH', destination: 'JED', departureDate: '2026-06-01', passengers: [{ type: 'ADT', count: 1 }] },
      creds,
    );
    const offer = results[0]!;

    const passenger: PassengerInfo = {
      type:      'ADT',
      firstName: 'Ahmad',
      lastName:  'Al-Rashidi',
    };

    const pnr = await provider.createPNR(
      { offer, passengers: [passenger], contactEmail: 'ahmad@example.com' },
      creds,
    );

    expect(pnr.pnrCode).toMatch(/^MOCK/);
    expect(pnr.pnrCode.length).toBeGreaterThanOrEqual(7);
    expect(pnr.status).toBe('HK');
    expect(pnr.segments.length).toBe(1);
    expect(pnr.segments[0]?.airline).toBe('SV');
    expect(pnr.segments[0]?.flightNumber).toBe('SV623');
    expect(pnr.currency).toBe('SAR');
    expect(pnr.expiresAt).toBeDefined();
  });

  // ─── 4. Issue Ticket ───────────────────────────────────────────────────────
  it('issueTicket returns tickets with valid 14-char numbers starting with 0572', async () => {
    const tickets = await provider.issueTicket(
      {
        pnrCode:        'MOCK623XYZ',
        passengerNames: ['Ahmad Al-Rashidi', 'Fatima Al-Rashidi'],
        formOfPayment:  { type: 'cash', amountHalalas: 120000 },
      },
      creds,
    );

    expect(tickets.length).toBe(2);
    for (const ticket of tickets) {
      expect(ticket.ticketNumber).toMatch(/^0572/);
      expect(ticket.ticketNumber.length).toBe(14);
      expect(ticket.status).toBe('issued');
      expect(ticket.passengerType).toBe('ADT');
      expect(ticket.fareHalalas).toBe(60000);
      expect(ticket.issuedAt).toBeTruthy();
    }
    expect(tickets[0]?.passengerName).toBe('Ahmad Al-Rashidi');
    expect(tickets[1]?.passengerName).toBe('Fatima Al-Rashidi');
  });

  // ─── 5. Void Ticket ────────────────────────────────────────────────────────
  it('voidTicket resolves without error', async () => {
    await expect(
      provider.voidTicket({ ticketNumber: '05721234567891', reason: 'passenger cancelled' }, creds),
    ).resolves.toBeUndefined();
  });

  // ─── 6. Refund Ticket ──────────────────────────────────────────────────────
  it('refundTicket with no penalty returns full refund amount', async () => {
    const result = await provider.refundTicket(
      { ticketNumber: '05721234567891', reason: 'voluntary refund', penaltyHalalas: 0 },
      creds,
    );
    expect(result.refundHalalas).toBe(60000);
    expect(result.penaltyHalalas).toBe(0);
    expect(result.processedAt).toBeTruthy();
    expect(new Date(result.processedAt).getFullYear()).toBeGreaterThanOrEqual(2026);
  });

  it('refundTicket with penalty returns zero refund', async () => {
    const result = await provider.refundTicket(
      { ticketNumber: '05721234567891', reason: 'no-show', penaltyHalalas: 10000 },
      creds,
    );
    expect(result.refundHalalas).toBe(0);
    expect(result.penaltyHalalas).toBe(10000);
  });

  // ─── 7. Hotel Search (GDS-only, not supported) ─────────────────────────────
  it('MockFlightProvider is a GDS-only provider (providerType = gds)', () => {
    expect(provider.providerType).toBe('gds');
  });

  // ─── 8. isConfigured ───────────────────────────────────────────────────────
  it('isConfigured always returns true for mock (no real credentials needed)', () => {
    expect(provider.isConfigured(creds)).toBe(true);
    expect(provider.isConfigured({ providerCode: 'sabre', payload: {} } as unknown as ProviderCredentials)).toBe(true);
  });

  // ─── 9. Empty search (non-matching route) ──────────────────────────────────
  it('searchFlights returns empty array for non-existent route', async () => {
    const results = await provider.searchFlights(
      { origin: 'JED', destination: 'NYC', departureDate: '2026-06-01', passengers: [{ type: 'ADT', count: 1 }] },
      creds,
    );
    expect(results).toEqual([]);
  });

});
