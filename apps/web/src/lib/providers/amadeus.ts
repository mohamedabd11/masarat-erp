import type {
  FlightProvider,
  PnrData,
  SegmentInfo,
  PassengerInfo,
  IssuanceResult,
  VoidResult,
  RefundParams,
  RefundResult,
  ExchangeParams,
  ExchangeResult,
} from './types';

// ─── Credential shape ─────────────────────────────────────────────────────────
interface AmadeusCredentials {
  clientId:     string;
  clientSecret: string;
  hostname:     string;   // test.api.amadeus.com | api.amadeus.com
}

// Explicit allowlist — prevents SSRF: a malicious admin could set hostname to
// an internal service (169.254.169.254, VPC DNS) and have the server relay requests.
const ALLOWED_HOSTNAMES = new Set([
  'test.api.amadeus.com',
  'api.amadeus.com',
]);

function assertCredentials(raw: unknown): AmadeusCredentials {
  const c = raw as Record<string, string>;
  if (!c?.clientId || !c?.clientSecret || !c?.hostname) {
    throw new Error('Amadeus credentials missing: clientId, clientSecret, hostname required');
  }
  if (!ALLOWED_HOSTNAMES.has(c.hostname)) {
    throw new Error(
      `Amadeus hostname not allowed: "${c.hostname}". Accepted: ${[...ALLOWED_HOSTNAMES].join(', ')}`,
    );
  }
  return { clientId: c.clientId, clientSecret: c.clientSecret, hostname: c.hostname };
}

// ─── Bounded fetch ────────────────────────────────────────────────────────────
// Every outbound GDS call is wrapped with a timeout. Without it, a hung Amadeus
// connection blocks the serverless function until the platform's hard limit,
// leaving tickets stranded in pending_void / pending_refund. On timeout we abort
// and throw a clear error the route maps to a 502 (and the reconcile cron heals).
const PROVIDER_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(input: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new Error(`انتهت مهلة الاتصال بمزود الطيران (${PROVIDER_TIMEOUT_MS / 1000} ثانية)`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Token cache (in-memory, resets on cold start — fine for serverless) ──────
// Cache the in-flight PROMISE, not just the resolved token, so concurrent callers
// on a cold start share a single OAuth request instead of each firing their own
// (which hit the Amadeus token rate limit → 429 thundering herd).
interface CachedToken { token: string; expiresAt: number }
const tokenCache = new Map<string, Promise<CachedToken>>();

async function getAccessToken(creds: AmadeusCredentials): Promise<string> {
  const key    = `${creds.hostname}:${creds.clientId}`;
  const cached = tokenCache.get(key);
  if (cached) {
    try {
      const t = await cached;
      if (t.expiresAt > Date.now() + 60_000) return t.token;  // 60s buffer
    } catch {
      // a previously-cached fetch rejected — fall through and refetch below
    }
  }

  const pending = (async (): Promise<CachedToken> => {
    const res = await fetchWithTimeout(`https://${creds.hostname}/v1/security/oauth2/token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     creds.clientId,
        client_secret: creds.clientSecret,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Amadeus auth failed (${res.status}): ${body}`);
    }
    const data = await res.json() as { access_token: string; expires_in: number };
    return { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  })();

  tokenCache.set(key, pending);
  try {
    return (await pending).token;
  } catch (err) {
    // Never leave a rejected promise cached — evict so the next call retries.
    if (tokenCache.get(key) === pending) tokenCache.delete(key);
    throw err;
  }
}

// ─── Response type helpers ────────────────────────────────────────────────────
// Partial Amadeus REST v2 response shapes — only fields we use
interface AmadeusSegment {
  departure:   { iataCode: string; at: string };
  arrival:     { iataCode: string; at: string };
  carrierCode: string;
  number:      string;
}

interface AmadeusTraveler {
  id:        string;
  name:      { firstName: string; lastName: string };
  type?:     string;
  documents?: { documentType: string; number: string; birthDate?: string; nationality?: string }[];
  tickets?:  { ticketNumber: string }[];
}

interface AmadeusOrderResponse {
  data: {
    id:                 string;
    associatedRecords?: { reference: string; originSystemCode?: string }[];
    flightOffers?:      { itineraries: { segments: AmadeusSegment[] }[] }[];
    travelers?:         AmadeusTraveler[];
  };
}

// ─── Provider implementation ──────────────────────────────────────────────────
export class AmadeusProvider implements FlightProvider {

  // ── retrievePNR ─────────────────────────────────────────────────────────────
  // pnrCode = Amadeus flight-order ID (e.g. "eJzTd9...")
  // For self-service: use the orderId returned when the order was created.
  // For GDS/enterprise: use the record locator (ABC123) via the GDS command layer.
  async retrievePNR(pnrCode: string, rawCredentials: unknown): Promise<PnrData> {
    const creds = assertCredentials(rawCredentials);
    const token = await getAccessToken(creds);

    const res = await fetchWithTimeout(
      `https://${creds.hostname}/v2/booking/flight-orders/${encodeURIComponent(pnrCode)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Amadeus retrievePNR failed (${res.status}): ${body}`);
    }

    const { data } = await res.json() as AmadeusOrderResponse;

    const segments: SegmentInfo[] = (data.flightOffers ?? [])
      .flatMap((offer) => offer.itineraries)
      .flatMap((it) => it.segments)
      .map((seg) => ({
        from:         seg.departure.iataCode,
        to:           seg.arrival.iataCode,
        carrier:      seg.carrierCode,
        flightNumber: `${seg.carrierCode}${seg.number}`,
        departureAt:  seg.departure.at,
        arrivalAt:    seg.arrival.at,
      }));

    const passengers: PassengerInfo[] = (data.travelers ?? []).map((t) => {
      const typeMap: Record<string, 'ADT' | 'CHD' | 'INF'> = {
        ADULT: 'ADT', CHILD: 'CHD', HELD_INFANT: 'INF', SEATED_INFANT: 'INF',
      };
      const doc = t.documents?.[0];
      return {
        name:            `${t.name.lastName}/${t.name.firstName}`,
        type:            typeMap[t.type ?? 'ADULT'] ?? 'ADT',
        passportNumber:  doc?.number,
        dateOfBirth:     doc?.birthDate,
        nationality:     doc?.nationality,
        ticketNumber:    t.tickets?.[0]?.ticketNumber,
      };
    });

    return { pnrCode, segments, passengers };
  }

  // ── issueTicket ─────────────────────────────────────────────────────────────
  // Requires Amadeus Enterprise / NDC access.
  // Self-service endpoint: POST /v2/ordering/flight-orders/{orderId}/issuance
  async issueTicket(pnrCode: string, rawCredentials: unknown): Promise<IssuanceResult> {
    const creds = assertCredentials(rawCredentials);
    const token = await getAccessToken(creds);

    const res = await fetchWithTimeout(
      `https://${creds.hostname}/v2/ordering/flight-orders/${encodeURIComponent(pnrCode)}/issuance`,
      {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/vnd.amadeus+json',
        },
        body: JSON.stringify({ data: { type: 'flight-order-issuance' } }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Amadeus issueTicket failed (${res.status}): ${body}`);
    }

    const { data } = await res.json() as AmadeusOrderResponse;

    const tickets = (data.travelers ?? [])
      .filter((t) => t.tickets?.[0]?.ticketNumber)
      .map((t) => ({
        passengerName:  `${t.name.lastName}/${t.name.firstName}`,
        ticketNumber:   t.tickets![0]!.ticketNumber,
        couponStatuses: [] as ('open' | 'used' | 'void' | 'refunded')[],
      }));

    if (tickets.length === 0) {
      throw new Error('Amadeus issueTicket returned no ticket numbers');
    }

    return { tickets };
  }

  // ── voidTicket ──────────────────────────────────────────────────────────────
  // Ticket voiding via Amadeus REST requires Enterprise/GDS terminal access.
  // The self-service order cancellation (DELETE /v2/booking/flight-orders/{id})
  // cancels the order but may not void already-issued tickets at BSP.
  async voidTicket(ticketNumber: string, rawCredentials: unknown): Promise<VoidResult> {
    const creds = assertCredentials(rawCredentials);
    const _token = await getAccessToken(creds);   // validates credentials
    throw new Error(
      `Amadeus ticket void requires Enterprise GDS terminal access (ticket: ${ticketNumber}). ` +
      `Contact your Amadeus account manager to enable DocIssuance voidTicket.`,
    );
  }

  // ── refundTicket ────────────────────────────────────────────────────────────
  async refundTicket(
    ticketNumber: string,
    rawCredentials: unknown,
    _params?: RefundParams,
  ): Promise<RefundResult> {
    const creds = assertCredentials(rawCredentials);
    const _token = await getAccessToken(creds);
    throw new Error(
      `Amadeus ticket refund requires Enterprise GDS terminal access (ticket: ${ticketNumber}). ` +
      `Contact your Amadeus account manager to enable automated refund processing.`,
    );
  }

  // ── exchangeTicket ──────────────────────────────────────────────────────────
  async exchangeTicket(
    ticketNumber: string,
    rawCredentials: unknown,
    _params?: ExchangeParams,
  ): Promise<ExchangeResult> {
    const creds = assertCredentials(rawCredentials);
    const _token = await getAccessToken(creds);
    throw new Error(
      `Amadeus ticket exchange requires Enterprise GDS terminal access (ticket: ${ticketNumber}). ` +
      `Contact your Amadeus account manager to enable automated exchange processing.`,
    );
  }
}

/**
 * Test Amadeus connectivity — fetches an OAuth2 token and calls a lightweight
 * read-only endpoint to validate end-to-end access.
 * Returns latencyMs on success, throws on failure.
 */
export async function testAmadeusConnection(rawCredentials: unknown): Promise<number> {
  const creds = assertCredentials(rawCredentials);
  const t0    = Date.now();

  const token = await getAccessToken(creds);

  // Lightweight endpoint: airline destinations (no PNR needed)
  const res = await fetchWithTimeout(
    `https://${creds.hostname}/v1/airline/destinations?airlineCode=SV&max=1`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Amadeus API test failed (${res.status}): ${body}`);
  }

  return Date.now() - t0;
}
