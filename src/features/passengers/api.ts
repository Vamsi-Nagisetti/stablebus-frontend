import { apiRequest } from '@/features/shared/api';

export type SavedPassenger = {
  user_id: string;
  passenger_id: string;
  title?: 'Mr' | 'Ms' | 'Mrs' | 'Master' | null;
  name: string;
  date_of_birth?: string | null; // DD/MM/YYYY
  age: number;
  gender: string;
};

export type PassengerPayload = {
  title?: 'Mr' | 'Ms' | 'Mrs' | 'Master' | null;
  name: string;
  date_of_birth?: string | null;
  age: number;
  gender: string;
};

export const passengersApi = {
  list: () => apiRequest<SavedPassenger[]>('/api/v1/users/passengers'),
  create: (payload: PassengerPayload) =>
    apiRequest<SavedPassenger>('/api/v1/users/passengers', 'POST', payload),
  update: (id: string, payload: PassengerPayload) =>
    apiRequest<SavedPassenger>(`/api/v1/users/passengers/${encodeURIComponent(id)}`, 'PUT', payload),
  remove: (id: string) =>
    apiRequest<{ message: string }>(`/api/v1/users/passengers/${encodeURIComponent(id)}`, 'DELETE'),
};
