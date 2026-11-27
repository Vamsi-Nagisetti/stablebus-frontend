import { request } from '@/services/http';

export type DevicePayload = {
  expo_push_token: string;
  platform: 'android' | 'ios';
  device_name: string;
};

/** POST /api/v1/notifications/devices (needs the user's access token; the http client adds it). */
export function registerDevice(payload: DevicePayload) {
  return request<{ success: boolean; device_id: number }>('/api/v1/notifications/devices', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** DELETE /api/v1/notifications/devices (call BEFORE the tokens are cleared on logout). */
export function unregisterDevice(expoPushToken: string) {
  return request<{ success: boolean }>('/api/v1/notifications/devices', {
    method: 'DELETE',
    body: JSON.stringify({ expo_push_token: expoPushToken }),
  });
}
