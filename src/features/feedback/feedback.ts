// Save as features/feedback/feedback.ts
// Small sounds and vibrations for important moments. Never throws: if sound or vibration is not
// available on a phone (or the installed app build does not contain the sound library yet),
// nothing happens and the app keeps working.
//
// For the sound:  npx expo install expo-audio   (then rebuild the app)
// and the file:   src/assets/sounds/stablebus_pop.mp3
import { Platform, Vibration } from 'react-native';

let player: any = null;
let triedLoading = false;

// True only when the installed app build actually contains the sound library. Loading expo-audio
// without it makes Metro show a red error in development even inside a try/catch, so check first.
function audioAvailable(): boolean {
  try {
    return !!(globalThis as any).expo?.modules?.ExpoAudio;
  } catch {
    return false;
  }
}

function getPlayer() {
  if (player || triedLoading) return player;
  triedLoading = true;
  if (!audioAvailable()) return null;
  try {
    // Loaded only when first needed, so a missing native module cannot break app start-up.
    const { createAudioPlayer } = require('expo-audio');
    player = createAudioPlayer(require('@/assets/sounds/stablebus_pop.mp3'));
  } catch {
    player = null;
  }
  return player;
}

function buzz(pattern: number | number[]) {
  try {
    if (Platform.OS === 'web') return;
    Vibration.vibrate(pattern);
  } catch {
    // vibration is a nicety
  }
}

function pop() {
  try {
    const p = getPlayer();
    if (!p) return;
    p.seekTo(0);
    p.play();
  } catch {
    // sound is a nicety
  }
}

export const feedback = {
  /** Ticket confirmed: a soft pop and two short taps. */
  success() {
    pop();
    buzz([0, 45, 90, 45]);
  },
  /** Payment or booking pending / failed: one longer buzz, no sound. */
  attention() {
    buzz([0, 320]);
  },
  /** Wrong code: two quick buzzes. */
  wrong() {
    buzz([0, 70, 60, 70]);
  },
};