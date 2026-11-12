import { request } from '@/services/http';
import type { City, BusSearchRequest, SeatMapResponse } from '@/types/api';

type CitiesApiPayload = {
  cityDetails?: City[];
  data?: { cityDetails?: City[] };
  // Compatibility only: some backend wrappers may expose this alias.
  cities?: City[];
};

export const searchApi = {
  async cities(): Promise<{ cityDetails: City[] }> {
    const payload = await request<CitiesApiPayload | null>(
      '/api/v1/buses/cities'
    );

    // The StableBus provider response shared earlier uses `cityDetails`.
    // Unwrap common API envelopes without assuming the payload is non-null.
    const cityDetails =
      payload?.cityDetails ??
      payload?.data?.cityDetails ??
      payload?.cities ??
      [];

    if (!Array.isArray(cityDetails)) {
      console.error('[StableBus] Unexpected cities response:', payload);
      throw new Error('Cities API returned an unexpected response format.');
    }

    return {
      cityDetails: cityDetails.filter(
        (city): city is City =>
          !!city && city.cityID !== undefined && typeof city.cityName === 'string'
      ),
    };
  },

  buses(payload: BusSearchRequest) {
    return request<any>('/api/v1/buses/search', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  seatMap(payload: Record<string, unknown>) {
    return request<SeatMapResponse>('/api/v1/buses/seat-map', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
