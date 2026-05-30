import type { FlightProvider } from '../../contracts/FlightProvider';
import type {
  ProviderCredentials, CabinClass,
  FlightSearchParams, FlightOffer,
  PnrCreateParams, PnrResult, SegmentInfo, PassengerInfo,
  TicketIssueParams, IssuedTicket,
  VoidParams, RefundParams, RefundResult,
} from '../../types';

// ── Amadeus REST API v2 internal types ────────────────────────────────────────
// These types are private to this provider and must not leak into business logic.

interface AmadeusTokenResp {
  access_token: string;
  token_type:   string;
  expires_in:   number;
}

interface AmadeusSegment {
  id:          string;
  departure:   { iataCode: string; terminal?: string; at: string };
  arrival:     { iataCode: string; terminal?: string; at: string };
  carrierCode: string;
  number:      string;
  aircraft:    { code: string };
  duration:    string;
}

interface AmadeusItinerary {
  duration: string;
  segments: AmadeusSegment[];
}

interface AmadeusFareDetail {
  segmentId: string;
  cabin:     string;
  fareBasis: string;
  class:     string;
}

interface AmadeusTravelerPricing {
  travelerId:           string;
  travelerType:         string;
  price:                { currency: string; total: string; base: string };
  fareDetailsBySegment: AmadeusFareDetail[];
}

interface AmadeusOffer {
  id:                     string;
  source:                 string;
  itineraries:            AmadeusItinerary[];
  price: {
    currency:   string;
    total:      string;
    base:       string;
    grandTotal: string;
  };
  validatingAirlineCodes: string[];
  travelerPricings:       AmadeusTravelerPricing[];
  numberOfBookableSeats?: number;
}

interface AmadeusTravelerDoc {
  documentType:     string;
  number:           string;
  expiryDate?:      string;
  issuanceCountry?: string;
  nationality?:     string;
  holder:           boolean;
}

interface AmadeusTraveler {
  id:           string;
  dateOfBirth?: string;
  name:         { firstName: string; lastName: string };
  contact?: {
    emailAddress?: string;
    phones?: Array<{ deviceType: string; countryCallingCode?: string; number: string }>;
  };
  documents?: AmadeusTravelerDoc[];
}

interface AmadeusOrder {
  type:                'flight-order';
  id:                  string;
  flightOffers:        AmadeusOffer[];
  travelers:           AmadeusTraveler[];
  ticketingAgreement?: { option: string; dateTime: string };
}

interface AmadeusErrorItem {
  status:  number;
  code:    number;
  title:   string;
  detail?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const REQUIRED_FIELDS = ['clientId', 'clientSecret', 'hostname'] as const;
const TIMEOUT_MS      = 15_000;

const CABIN_TO_AMADEUS: Record<CabinClass, string> = {
  economy:         'ECONOMY',
  premium_economy: 'PREMIUM_ECONOMY',
  business:        'BUSINESS',
  first:           'FIRST',
};

const AMADEUS_TO_CABIN: Record<string, CabinClass> = {
  ECONOMY:         'economy',
  PREMIUM_ECONOMY: 'premium_economy',
  BUSINESS:        'business',
  FIRST:           'first',
};

const PTYPE_TO_AMADEUS: Record<string, string> = {
  ADT: 'ADULT',
  CHD: 'CHILD',
  INF: 'HELD_INFANT',
};

// ── Pure helpers ──────────────────────────────────────────────────────────────

function parseDurationMinutes(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  return (+(m?.[1] ?? 0)) * 60 + (+(m?.[2] ?? 0));
}

function toHalalas(amount: string): number {
  return Math.round(parseFloat(amount || '0') * 100);
}

function splitAt(isoAt: string): [string, string] {
  const [d = '', t = ''] = isoAt.split('T');
  return [d, t.substring(0, 5)];
}

// ── AmadeusProvider ────────────────────────────────────────────────────────────

export class AmadeusProvider implements FlightProvider {
  readonly providerCode = 'amadeus' as const;
  readonly providerType = 'gds'     as const;

  // Per-instance token cache — avoids sharing state across test instances
  private readonly _tokenCache = new Map<string, { token: string; expiresAt: number }>();

  // ── FlightProvider interface ──────────────────────────────────────────────────

  isConfigured(credentials: ProviderCredentials): boolean {
    return REQUIRED_FIELDS.every(
      f => typeof credentials.payload[f] === 'string' &&
           (credentials.payload[f] as string).length > 0,
    );
  }

  async searchFlights(
    params:      FlightSearchParams,
    credentials: ProviderCredentials,
  ): Promise<FlightOffer[]> {
    // Build traveler list from passenger counts
    let idx = 1;
    const travelers = params.passengers.flatMap(p =>
      Array.from({ length: p.count }, () => ({
        id:          String(idx++),
        travelerType: PTYPE_TO_AMADEUS[p.type] ?? 'ADULT',
      })),
    );

    const cabin = CABIN_TO_AMADEUS[params.cabin ?? 'economy'];
    const originDestinations: unknown[] = [{
      id:                      '1',
      originLocationCode:      params.origin,
      destinationLocationCode: params.destination,
      departureDateTimeRange:  { date: params.departureDate },
    }];

    if (params.returnDate) {
      originDestinations.push({
        id:                      '2',
        originLocationCode:      params.destination,
        destinationLocationCode: params.origin,
        departureDateTimeRange:  { date: params.returnDate },
      });
    }

    const res = await this._request<{ data: AmadeusOffer[] }>(
      credentials, 'POST', '/v2/shopping/flight-offers', {
        currencyCode: 'SAR',
        originDestinations,
        travelers,
        sources: ['GDS'],
        searchCriteria: {
          maxFlightOffers: 20,
          flightFilters: {
            ...(params.directOnly ? { directFlights: true } : {}),
            cabinRestrictions: [{
              cabin,
              coverage:             'MOST_SEGMENTS',
              originDestinationIds: ['1'],
            }],
          },
        },
      },
    );

    return (res.data ?? []).map(o => this._mapOffer(o));
  }

  async createPNR(
    params:      PnrCreateParams,
    credentials: ProviderCredentials,
  ): Promise<PnrResult> {
    const rawOffer = params.offer._raw as AmadeusOffer | undefined;
    if (!rawOffer?.id) {
      throw new Error(
        'AmadeusProvider.createPNR: offer._raw is missing. ' +
        'The offer must originate from AmadeusProvider.searchFlights().',
      );
    }

    // Step 1 — Re-price: confirm current pricing (required Amadeus flow)
    const priceRes = await this._request<{ data: { flightOffers: AmadeusOffer[] } }>(
      credentials, 'POST', '/v1/shopping/flight-offers/pricing', {
        data: { type: 'flight-offers-pricing', flightOffers: [rawOffer] },
      },
    );
    const pricedOffer = priceRes.data?.flightOffers?.[0];
    if (!pricedOffer) {
      throw new Error('AmadeusProvider: pricing response missing flight offer');
    }

    // Step 2 — Build travelers from PassengerInfo
    const travelers: AmadeusTraveler[] = params.passengers.map((p, i) => {
      const traveler: AmadeusTraveler = {
        id:          String(i + 1),
        dateOfBirth: p.dateOfBirth ?? '1990-01-01',
        name: {
          firstName: p.firstName.toUpperCase(),
          lastName:  p.lastName.toUpperCase(),
        },
        contact: {
          emailAddress: params.contactEmail,
          ...(params.contactPhone ? {
            phones: [{
              deviceType:         'MOBILE',
              countryCallingCode: '966',
              number:             params.contactPhone
                .replace(/^\+?966/, '')
                .replace(/^0/, ''),
            }],
          } : {}),
        },
      };

      if (p.passportNumber) {
        traveler.documents = [{
          documentType:    'PASSPORT',
          number:          p.passportNumber,
          expiryDate:      p.passportExpiry,
          issuanceCountry: p.nationality ?? 'SA',
          nationality:     p.nationality ?? 'SA',
          holder:          true,
        }];
      }

      return traveler;
    });

    // Step 3 — Create flight order
    const orderRes = await this._request<{ data: AmadeusOrder }>(
      credentials, 'POST', '/v1/booking/flight-orders', {
        data: { type: 'flight-order', flightOffers: [pricedOffer], travelers },
      },
    );

    return this._mapOrderToResult(orderRes.data);
  }

  async retrievePNR(
    pnrCode:     string,
    credentials: ProviderCredentials,
  ): Promise<PnrResult> {
    const res = await this._request<{ data: AmadeusOrder }>(
      credentials, 'GET',
      `/v1/booking/flight-orders/${encodeURIComponent(pnrCode)}`,
    );
    return this._mapOrderToResult(res.data);
  }

  async cancelPNR(
    pnrCode:     string,
    credentials: ProviderCredentials,
  ): Promise<void> {
    await this._request<unknown>(
      credentials, 'DELETE',
      `/v1/booking/flight-orders/${encodeURIComponent(pnrCode)}`,
    );
  }

  // issueTicket/voidTicket/refundTicket require a BSP agreement — not yet available
  async issueTicket(_p: TicketIssueParams, _c: ProviderCredentials): Promise<IssuedTicket[]> {
    throw new Error(
      'issueTicket is not yet available for Amadeus — ' +
      'requires a BSP/ARC ticketing authority agreement. Contact Masarat support.',
    );
  }

  async voidTicket(_p: VoidParams, _c: ProviderCredentials): Promise<void> {
    throw new Error(
      'voidTicket is not yet available via Amadeus REST API. ' +
      'Process voids through Amadeus Back Office or contact support.',
    );
  }

  async refundTicket(_p: RefundParams, _c: ProviderCredentials): Promise<RefundResult> {
    throw new Error(
      'refundTicket is not yet available via Amadeus REST API. ' +
      'Submit refunds through Amadeus Back Office or contact support.',
    );
  }

  // ── Private: HTTP token management ───────────────────────────────────────────

  private _cacheKey(c: ProviderCredentials): string {
    return `${c.payload['hostname'] ?? ''}::${c.payload['clientId'] ?? ''}`;
  }

  private async _getToken(credentials: ProviderCredentials): Promise<string> {
    const key    = this._cacheKey(credentials);
    const cached = this._tokenCache.get(key);
    // Refresh 30s before expiry to avoid 401 mid-request
    if (cached && Date.now() < cached.expiresAt - 30_000) return cached.token;

    const { clientId = '', clientSecret = '', hostname = '' } =
      credentials.payload as Record<string, string>;

    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`https://${hostname}/v1/security/oauth2/token`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    new URLSearchParams({
          grant_type:    'client_credentials',
          client_id:     clientId,
          client_secret: clientSecret,
        }).toString(),
        signal: ctrl.signal,
      });
    } catch (err) {
      throw new Error(`Amadeus token request failed: ${String(err)}`);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Amadeus auth error ${res.status}: ${txt.slice(0, 200)}`);
    }

    const data = await res.json() as AmadeusTokenResp;
    this._tokenCache.set(key, {
      token:     data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    });
    return data.access_token;
  }

  // ── Private: generic request wrapper ─────────────────────────────────────────

  private async _request<T>(
    credentials: ProviderCredentials,
    method:      'GET' | 'POST' | 'DELETE',
    path:        string,
    body?:       unknown,
    _retried?:   boolean,
  ): Promise<T> {
    const { hostname = '' } = credentials.payload as Record<string, string>;
    const token  = await this._getToken(credentials);
    const ctrl   = new AbortController();
    const timer  = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`https://${hostname}${path}`, {
        method,
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept:         'application/json',
        },
        body:   body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
    } catch (err) {
      throw new Error(`Amadeus ${method} ${path} failed: ${String(err)}`);
    } finally {
      clearTimeout(timer);
    }

    // Token expired — clear cache and retry once
    if (res.status === 401 && !_retried) {
      this._tokenCache.delete(this._cacheKey(credentials));
      return this._request(credentials, method, path, body, true);
    }

    // DELETE success — no body expected
    if (res.status === 204) return {} as T;

    const data = await res.json() as T | { errors?: AmadeusErrorItem[] };

    if (!res.ok) {
      const first = (data as { errors?: AmadeusErrorItem[] }).errors?.[0];
      throw new Error(
        first
          ? `Amadeus ${first.title} (${first.code}): ${first.detail ?? ''}`
          : `Amadeus API error ${res.status}`,
      );
    }

    return data as T;
  }

  // ── Private: mapping helpers ──────────────────────────────────────────────────

  private _mapOffer(offer: AmadeusOffer): FlightOffer {
    const itin  = offer.itineraries[0]!;
    const segs  = itin.segments;
    const first = segs[0]!;
    const last  = segs[segs.length - 1]!;
    const tp    = offer.travelerPricings[0]!;
    const fd    = tp.fareDetailsBySegment[0];

    return {
      id:              offer.id,
      provider:        'amadeus',
      airline:         offer.validatingAirlineCodes[0] ?? first.carrierCode,
      flightNumber:    `${first.carrierCode}${first.number}`,
      origin:          first.departure.iataCode,
      destination:     last.arrival.iataCode,
      departureAt:     first.departure.at,
      arrivalAt:       last.arrival.at,
      durationMinutes: parseDurationMinutes(itin.duration),
      cabin:           AMADEUS_TO_CABIN[fd?.cabin ?? 'ECONOMY'] ?? 'economy',
      fareHalalas:     toHalalas(tp.price.base),
      taxHalalas:      Math.max(0, toHalalas(offer.price.grandTotal) - toHalalas(tp.price.base)),
      totalHalalas:    toHalalas(offer.price.grandTotal),
      currency:        offer.price.currency,
      seatsAvailable:  offer.numberOfBookableSeats ?? null,
      fareClass:       fd?.class    ?? 'Y',
      fareBasis:       fd?.fareBasis ?? '',
      _raw:            offer,
    };
  }

  private _mapOrderToResult(order: AmadeusOrder): PnrResult {
    const fo   = order.flightOffers?.[0];
    const itin = fo?.itineraries?.[0];
    const tp   = fo?.travelerPricings?.[0];

    const segments: SegmentInfo[] = (itin?.segments ?? []).map(seg => {
      const [depDate, depTime] = splitAt(seg.departure.at);
      const [arrDate, arrTime] = splitAt(seg.arrival.at);
      const fd = tp?.fareDetailsBySegment.find(d => d.segmentId === seg.id);
      return {
        airline:       seg.carrierCode,
        flightNumber:  `${seg.carrierCode}${seg.number}`,
        origin:        seg.departure.iataCode,
        destination:   seg.arrival.iataCode,
        departureDate: depDate,
        departureTime: depTime,
        arrivalDate:   arrDate,
        arrivalTime:   arrTime,
        bookingClass:  fd?.class    ?? 'Y',
        fareBasis:     fd?.fareBasis ?? '',
        status:        'HK',
      };
    });

    const passengers: PassengerInfo[] = (order.travelers ?? []).map(t => ({
      type:           'ADT' as const,
      firstName:      t.name.firstName,
      lastName:       t.name.lastName,
      dateOfBirth:    t.dateOfBirth,
      passportNumber: t.documents?.[0]?.number,
      nationality:    t.documents?.[0]?.nationality,
      passportExpiry: t.documents?.[0]?.expiryDate,
    }));

    return {
      pnrCode:      order.id,
      gds:          'amadeus',
      status:       'CONFIRMED',
      expiresAt:    order.ticketingAgreement?.dateTime,
      passengers,
      segments,
      totalHalalas: toHalalas(fo?.price.grandTotal ?? '0'),
      currency:     fo?.price.currency ?? 'SAR',
    };
  }
}
