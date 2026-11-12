import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import Home from '@/features/search/screens/Home';
import Results from '@/features/search/screens/Results';
import Seats from '@/features/search/screens/Seats';
import Points from '@/features/checkout/screens/Points';
import Passengers from '@/features/checkout/screens/Passengers';
import Ticket from '@/features/bookings/screens/Ticket';

import Login from '@/features/auth/screens/Login';
import VerifyOTP from '@/features/auth/screens/VerifyOTP';

const Stack = createNativeStackNavigator();

export default function Index() {
  return (
    <Stack.Navigator
      initialRouteName="home"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="home" component={Home} />
      <Stack.Screen name="results" component={Results} />
      <Stack.Screen name="seats" component={Seats} />
      <Stack.Screen name="points" component={Points} />
      <Stack.Screen name="passengers" component={Passengers} />
      <Stack.Screen name="ticket" component={Ticket} />

      <Stack.Screen name="login" component={Login} />
      <Stack.Screen name="verify-otp" component={VerifyOTP} />
    </Stack.Navigator>
  );
}