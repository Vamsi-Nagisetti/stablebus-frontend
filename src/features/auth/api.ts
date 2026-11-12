import { request } from '@/services/http';

export interface SendOTPRequest {
  mobile_number: string;
}

export interface SendOTPResponse {
  success: boolean;
  message: string;
  expires_in: number;
  request_id: string;
}

export interface VerifyOTPRequest {
  mobile_number: string;
  otp: string;
}

export interface VerifyOTPResponse {
  success: boolean;
  message: string;
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export async function sendOTP(
  mobileNumber: string
): Promise<SendOTPResponse> {
  return request<SendOTPResponse>('/api/v1/auth/send-otp', {
    method: 'POST',
    body: JSON.stringify({
      mobile_number: mobileNumber,
    }),
  });
}

export async function verifyOTP(
  mobileNumber: string,
  otp: string
): Promise<VerifyOTPResponse> {
  return request<VerifyOTPResponse>('/api/v1/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({
      mobile_number: mobileNumber,
      otp,
    }),
  });
}