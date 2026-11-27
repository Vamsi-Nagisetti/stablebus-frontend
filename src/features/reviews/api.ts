import { request } from '@/services/http';

export type ReviewStatus = {
  enabled: boolean;
  reward_coins: number;
  reviews: Record<string, { rating: number; comment?: string | null }>;
};

export type ReviewResult = {
  booking_id: string;
  rating: number;
  comment?: string | null;
  coins_awarded: number;
};

export const reviewsApi = {
  /** Which of these trips are already rated, and what a rating is worth. */
  status(bookingIds: string[]) {
    return request<ReviewStatus>('/api/v1/reviews/status', {
      method: 'POST',
      body: JSON.stringify({ booking_ids: bookingIds.slice(0, 100) }),
      timeoutMs: 15000,
    });
  },

  submit(bookingId: string, rating: number, comment: string) {
    return request<ReviewResult>(`/api/v1/reviews/bookings/${encodeURIComponent(bookingId)}`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment: comment.trim() || null }),
      timeoutMs: 20000,
    });
  },
};