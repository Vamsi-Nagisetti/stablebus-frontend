# StableBus Mobile starter

Expo + React Native + TypeScript, feature-oriented structure.

## Run
```bash
npm install
cp .env.example .env
# Edit .env: EXPO_PUBLIC_API_BASE_URL=http://YOUR_LAN_IP:8000
npx expo start
```
Install Expo Go on your phone and scan the QR. For Android emulator use `http://10.0.2.2:8000`; iOS simulator `http://127.0.0.1:8000`; physical phone needs your computer LAN IP and both devices on same Wi-Fi. Backend should bind `0.0.0.0`.

## Integrated
- GET `/api/v1/buses/cities`
- POST `/api/v1/buses/search`
- POST `/api/v1/buses/seat-map`
- POST `/api/v1/bookings/{id}/requery` helper

Seat renderer preserves provider coordinates, separates `zIndex` decks and horizontally scrolls. `length` and `width` are mapped to cell spans; no coordinate compaction.

## Not enabled yet
Live booking creation, payment initiation/verification, OTP authentication and ticketing are intentionally not faked. Need current request/response contracts for those operations. Bus-search/seat-map field aliases may need a small mapping adjustment to your exact raw JSON. No secrets belong in `.env` committed to git.
