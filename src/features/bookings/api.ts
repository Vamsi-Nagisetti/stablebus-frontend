import { getTokens } from '@/features/auth/tokenStorage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/+$/, '');

type TokenShape = {
  access_token?: string;
  accessToken?: string;
  token?: string;
} | string | null | undefined;

async function getAccessToken(): Promise<string> {
  const stored = (await getTokens()) as TokenShape;
  if (typeof stored === 'string' && stored) return stored;
  const token =
    stored && (stored.access_token || stored.accessToken || stored.token);
  if (!token) throw new Error('Your session has expired. Please log in again.');
  return token;
}

async function request<T = any>(
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown
): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error('API URL is not configured. Check EXPO_PUBLIC_API_BASE_URL.');
  }

  const token = await getAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const detail =
      typeof data?.detail === 'string'
        ? data.detail
        : typeof data?.message === 'string'
          ? data.message
          : `Request failed (${response.status}).`;
    throw new Error(detail);
  }

  return data as T;
}

export type BookingPassenger = {
  name: string;
  age: number;
  gender: string;
  title?: string | null;
  dob?: string | null;
  seat_number: string;
  ticket_number: string | null;
};

export type Booking = {
  booking_id: string;
  booking_status: string;
  journey_date: string | null;
  source_city_id: string;
  destination_city_id: string;
  bus_id: string;
  operator_name?: string | null;
  boarding_point?: Record<string, unknown> | string | null;
  dropping_point?: Record<string, unknown> | string | null;
  seat_numbers: string[];
  cancelled_seat_numbers: string[];
  total_amount: string;
  currency: string;
  supplier_refno: string | null;
  transport_pnr: string | null;
  customer_mobile?: string | null;
  passenger_email?: string | null;
  created_at?: string | null;
  passengers: BookingPassenger[];
};

export type BookingHistoryResponse = {
  items: Booking[];
  pagination: {
    limit: number;
    offset: number;
    has_more: boolean;
  };
};

export type CancellationQuote = {
  cancellable?: boolean | string;
  cancellationCharge_Key?: string;
  [key: string]: unknown;
};

export const bookingsApi = {
  history(limit = 20, offset = 0) {
    return request<BookingHistoryResponse>(
      `/api/v1/bookings/history?limit=${limit}&offset=${offset}`
    );
  },

  cancellationCharges(bookingId: string, seatNumbers: string[]) {
    return request<CancellationQuote>(
      `/api/v1/bookings/${encodeURIComponent(bookingId)}/cancellation/charges`,
      'POST',
      { seat_numbers: seatNumbers }
    );
  },

  cancel(
    bookingId: string,
    seatNumbers: string[],
    cancellationChargeKey: string
  ) {
    return request<{
      booking_id: string;
      booking_status: string;
      cancelled_seat_numbers: string[];
      provider_response?: unknown;
    }>(
      `/api/v1/bookings/${encodeURIComponent(bookingId)}/cancellation`,
      'POST',
      {
        seat_numbers: seatNumbers,
        cancellation_charge_key: cancellationChargeKey,
      }
    );
  },
};
