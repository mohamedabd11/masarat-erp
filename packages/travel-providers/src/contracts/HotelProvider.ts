import type { ProviderCredentials, HotelSearchParams, HotelOffer, HotelBookingParams, HotelReservation } from '../types';
import type { BookingProvider } from './BookingProvider';

/**
 * Hotel booking operations contract.
 */
export interface HotelProvider extends BookingProvider {
  /** Search for available hotel offers. */
  searchHotels(
    params:      HotelSearchParams,
    credentials: ProviderCredentials,
  ): Promise<HotelOffer[]>;

  /** Create a hotel reservation from a selected offer. */
  createReservation(
    params:      HotelBookingParams,
    credentials: ProviderCredentials,
  ): Promise<HotelReservation>;

  /** Cancel an existing hotel reservation. */
  cancelReservation(
    reservationId: string,
    credentials:   ProviderCredentials,
  ): Promise<void>;
}
