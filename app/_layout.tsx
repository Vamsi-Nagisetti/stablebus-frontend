
import React from 'react';
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack
      initialRouteName="index"
      screenOptions={{ headerShown: false }}
    >
      {/* Main screens */}
      <Stack.Screen name="index" />
      <Stack.Screen name="home" />
      <Stack.Screen name="results" />
      <Stack.Screen name="seats" />
      <Stack.Screen name="points" />
      <Stack.Screen name="passengers" />
      <Stack.Screen name="payment" />
      <Stack.Screen name="ticket" />
      <Stack.Screen name="tickets" />

      {/* Authentication */}
      <Stack.Screen name="login" />
      <Stack.Screen name="verify-otp" />

      {/* Profile screens */}
      <Stack.Screen name="bookings" />
      <Stack.Screen name="rewards" />
      <Stack.Screen name="saved-passengers" />
      <Stack.Screen name="help" />
      <Stack.Screen name="account-settings" />
      <Stack.Screen name="notifications" />

      {/* Legal screens */}
      <Stack.Screen name="terms" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="user-agreement" />
    </Stack>
  );
}
