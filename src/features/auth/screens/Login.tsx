import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { sendOTP } from '@/features/auth/api';

export default function Login() {
  const navigation = useNavigation<any>();

  const [mobileNumber, setMobileNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isValidMobile = /^[6-9]\d{9}$/.test(mobileNumber);

  const handleContinue = async () => {
    if (!isValidMobile || loading) {
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await sendOTP(mobileNumber);

      navigation.navigate('verify-otp', {
        mobileNumber,
        expiresIn: response.expires_in,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to send OTP. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.topBar}>
            <Pressable
              onPress={() => navigation.goBack()}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Feather name="arrow-left" size={21} color="#382B28" />
            </Pressable>

            <Text style={styles.brand}>stablebus</Text>

            <View style={styles.topBarSpacer} />
          </View>

          <View style={styles.hero}>
            <View style={styles.iconContainer}>
              <Feather name="smartphone" size={27} color="#783D4A" />
            </View>

            <Text style={styles.title}>Welcome aboard</Text>

            <Text style={styles.subtitle}>
              Sign in to keep your journeys together. Access your bookings,
              manage cancellations and travel with ease.
            </Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Mobile number</Text>

            <View
              style={[
                styles.phoneInputContainer,
                error ? styles.inputError : null,
              ]}
            >
              <View style={styles.countryCode}>
                <Text style={styles.flag}>🇮🇳</Text>
                <Text style={styles.countryCodeText}>+91</Text>
                <Feather
                  name="chevron-down"
                  size={15}
                  color="#887A73"
                />
              </View>

              <View style={styles.inputDivider} />

              <TextInput
                style={styles.input}
                value={mobileNumber}
                onChangeText={(value) => {
                  setMobileNumber(value.replace(/\D/g, '').slice(0, 10));
                  setError('');
                }}
                placeholder="Enter mobile number"
                placeholderTextColor="#A99D96"
                keyboardType="number-pad"
                maxLength={10}
                autoComplete="tel-national"
                textContentType="telephoneNumber"
                editable={!loading}
                returnKeyType="done"
                onSubmitEditing={handleContinue}
                accessibilityLabel="Mobile number"
              />
            </View>

            {error ? (
              <View style={styles.errorContainer}>
                <Feather name="alert-circle" size={15} color="#B54747" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : (
              <Text style={styles.helperText}>
                We'll send you a one-time password to verify your number.
              </Text>
            )}

            <Pressable
              style={[
                styles.continueButton,
                (!isValidMobile || loading) && styles.buttonDisabled,
              ]}
              onPress={handleContinue}
              disabled={!isValidMobile || loading}
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator color="#FFFEFC" />
              ) : (
                <>
                  <Text style={styles.continueButtonText}>
                    Continue
                  </Text>
                  <Feather
                    name="arrow-right"
                    size={18}
                    color="#FFFEFC"
                  />
                </>
              )}
            </Pressable>

            <View style={styles.privacyNote}>
              <Feather name="shield" size={15} color="#887A73" />
              <Text style={styles.privacyText}>
                Your number is used only for account verification.
              </Text>
            </View>
          </View>

          <View style={styles.bottomNote}>
            <Text style={styles.bottomText}>
              By continuing, you agree to StableBus Terms of Service and
              Privacy Policy.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#F8F4ED',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  topBar: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFEFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    fontSize: 19,
    fontWeight: '700',
    color: '#783D4A',
    letterSpacing: -0.5,
  },
  topBarSpacer: {
    width: 40,
  },
  hero: {
    marginTop: 66,
    marginBottom: 38,
  },
  iconContainer: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#F4EAEB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 25,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#382B28',
    letterSpacing: -0.8,
  },
  subtitle: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 23,
    color: '#887A73',
    maxWidth: 320,
  },
  form: {
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#382B28',
    marginBottom: 11,
  },
  phoneInputContainer: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFEFC',
    borderWidth: 1,
    borderColor: '#EAE0D7',
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  inputError: {
    borderColor: '#B54747',
  },
  countryCode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  flag: {
    fontSize: 17,
  },
  countryCodeText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#382B28',
  },
  inputDivider: {
    height: 25,
    width: 1,
    backgroundColor: '#EAE0D7',
    marginHorizontal: 13,
  },
  input: {
    flex: 1,
    height: 54,
    fontSize: 16,
    color: '#382B28',
    padding: 0,
  },
  helperText: {
    marginTop: 11,
    fontSize: 12,
    lineHeight: 18,
    color: '#887A73',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: 11,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: '#B54747',
  },
  continueButton: {
    height: 56,
    backgroundColor: '#783D4A',
    borderRadius: 15,
    marginTop: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  continueButtonText: {
    color: '#FFFEFC',
    fontSize: 16,
    fontWeight: '600',
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 20,
  },
  privacyText: {
    fontSize: 12,
    color: '#887A73',
  },
  bottomNote: {
    marginTop: 'auto',
    paddingTop: 55,
  },
  bottomText: {
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    color: '#A0948D',
  },
});