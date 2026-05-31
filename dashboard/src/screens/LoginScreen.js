import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView 
} from 'react-native';
import { login, requestAccess, requestPasswordReset } from '../services/api';

export default function LoginScreen({ onLogin }) {
  const [storeId, setStoreId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [showForgot, setShowForgot] = useState(false);
  const [resetId, setResetId] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const [showAccess, setShowAccess] = useState(false);
  const [accessName, setAccessName] = useState('');
  const [accessPhone, setAccessPhone] = useState('');
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessSuccess, setAccessSuccess] = useState(false);

  const handleLogin = async () => {
    if (!storeId || !password) return;
    setLoading(true);
    setError(null);
    try {
      const data = await login(storeId, password);
      onLogin(data, password);
    } catch (e) {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.cardWrapper}>
          
          <View style={styles.card}>
            <Text style={styles.brand}>Auris</Text>
            <Text style={styles.tagline}>Factory Intelligence by Skym Labs</Text>
            
            <View style={styles.divider} />
            
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Text style={styles.label}>Store ID</Text>
            <TextInput
              style={styles.input}
              placeholder="your-store-id"
              placeholderTextColor="#BBBBBB"
              value={storeId}
              onChangeText={setStoreId}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={[styles.label, { marginTop: 16 }]}>Password</Text>
            <TextInput
              style={[styles.input, { marginBottom: 8 }]}
              placeholder="••••••••"
              placeholderTextColor="#BBBBBB"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <TouchableOpacity style={styles.forgotLink} onPress={() => setShowForgot(!showForgot)}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            {showForgot && (
              <View style={styles.inlineSection}>
                <Text style={[styles.label, { marginBottom: 4 }]}>Enter your Store ID to reset</Text>
                <TextInput
                  style={styles.input}
                  placeholder="your-store-id"
                  placeholderTextColor="#BBBBBB"
                  value={resetId}
                  onChangeText={setResetId}
                  autoCapitalize="none"
                />
                <TouchableOpacity 
                  style={styles.secondaryBtn} 
                  onPress={async () => {
                    if (!resetId) return;
                    setResetLoading(true);
                    try {
                      await requestPasswordReset(resetId);
                      setResetSuccess(true);
                    } catch (e) {
                      if (Platform.OS === 'web') alert('Failed to send reset link.');
                    } finally {
                      setResetLoading(false);
                    }
                  }}
                  disabled={resetLoading || resetSuccess}
                >
                  {resetLoading ? <ActivityIndicator color="#111111" /> : <Text style={styles.secondaryBtnText}>{resetSuccess ? "Reset Link Sent" : "Send Reset Link"}</Text>}
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity style={styles.primaryBtn} onPress={handleLogin} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryBtnText}>Log In</Text>
              )}
            </TouchableOpacity>

            <View style={[styles.divider, { marginVertical: 20 }]} />

            <TouchableOpacity onPress={() => setShowAccess(!showAccess)}>
              <Text style={styles.accessText}>Need access? Request here</Text>
            </TouchableOpacity>

            {showAccess && (
              <View style={styles.inlineSection}>
                <Text style={[styles.label, { marginBottom: 4 }]}>Name</Text>
                <TextInput style={styles.input} value={accessName} onChangeText={setAccessName} />
                
                <Text style={[styles.label, { marginTop: 12, marginBottom: 4 }]}>Phone</Text>
                <TextInput style={styles.input} value={accessPhone} onChangeText={setAccessPhone} keyboardType="phone-pad" />
                
                <TouchableOpacity 
                  style={[styles.secondaryBtn, { marginTop: 16 }]}
                  onPress={async () => {
                    if (!accessName || !accessPhone) return;
                    setAccessLoading(true);
                    try {
                      await requestAccess(accessName, accessPhone);
                      setAccessSuccess(true);
                      setAccessName('');
                      setAccessPhone('');
                    } catch (e) {
                      if (Platform.OS === 'web') alert('Failed to request access.');
                    } finally {
                      setAccessLoading(false);
                    }
                  }}
                  disabled={accessLoading || accessSuccess}
                >
                  {accessLoading ? <ActivityIndicator color="#111111" /> : <Text style={styles.secondaryBtnText}>{accessSuccess ? "Request Sent" : "Submit Request"}</Text>}
                </TouchableOpacity>
                <Text style={styles.helperText}>We'll set up your account and send credentials.</Text>
              </View>
            )}
          </View>

          <Text style={styles.footerText}>© Auris by Skym Labs · support@skymlabs.com</Text>

        </KeyboardAvoidingView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F9F9' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  cardWrapper: { width: '100%', maxWidth: 400, alignItems: 'center' },
  
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    padding: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 4,
    marginBottom: 20,
  },
  
  brand: { fontSize: 28, fontWeight: '700', color: '#111111', textAlign: 'center' },
  tagline: { fontSize: 13, color: '#888888', textAlign: 'center', marginTop: 4 },
  
  divider: { height: 1, backgroundColor: '#EFEFEF', width: '100%', marginVertical: 24 },
  
  label: { fontSize: 12, fontWeight: '500', color: '#111111', marginBottom: 6 },
  input: {
    width: '100%',
    height: 44,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#111111',
  },
  
  forgotLink: { alignSelf: 'flex-end' },
  forgotText: { fontSize: 13, color: '#888888', textDecorationLine: 'underline' },
  
  primaryBtn: {
    width: '100%',
    height: 44,
    backgroundColor: '#C0392B', // Loss / dead cost accent ONLY on Log In button
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '500' },
  
  accessText: { fontSize: 13, color: '#888888', textAlign: 'center', textDecorationLine: 'underline' },
  
  inlineSection: { marginTop: 16, padding: 16, backgroundColor: '#F9F9F9', borderRadius: 8, borderWidth: 1, borderColor: '#EFEFEF' },
  secondaryBtn: {
    width: '100%',
    height: 36,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#111111',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryBtnText: { color: '#111111', fontSize: 14, fontWeight: '500' },
  helperText: { fontSize: 12, color: '#888888', marginTop: 8, textAlign: 'center' },
  
  errorText: { color: '#C0392B', fontSize: 13, marginBottom: 16, textAlign: 'center', fontWeight: '500' },
  
  footerText: { fontSize: 12, color: '#BBBBBB', textAlign: 'center' }
});
