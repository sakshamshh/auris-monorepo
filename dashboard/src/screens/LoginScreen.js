import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { login, requestPasswordReset } from "../services/api";

export default function LoginScreen({ onLogin, onAdmin }) {
  const [storeId, setStoreId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Forgot password state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotStoreId, setForgotStoreId] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState("");

  const handleLogin = async () => {
    if (!storeId.trim() || !password.trim()) {
      Alert.alert("Error", "Please enter Store ID and password");
      return;
    }
    setLoading(true);
    try {
      const data = await login(storeId.trim(), password.trim());
      onLogin(data, password.trim());
    } catch (e) {
      Alert.alert("Login Failed", "Invalid Store ID or password");
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequest = async () => {
    if (!forgotStoreId.trim()) {
      Alert.alert("Error", "Please enter your Store ID");
      return;
    }
    setResetLoading(true);
    try {
      const data = await requestPasswordReset(forgotStoreId.trim());
      if (data.success) {
        setResetMessage("Password reset requested. Contact your Auris administrator.");
      } else {
        Alert.alert("Error", data.message || "Store not found");
      }
    } catch (e) {
      Alert.alert("Error", "Failed to submit reset request. Please try again.");
    } finally {
      setResetLoading(false);
    }
  };

  if (showForgotPassword) {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.inner}>
          <TouchableOpacity
            style={styles.logoWrap}
            onLongPress={onAdmin}
            delayLongPress={800}
            activeOpacity={0.9}
          >
            <Text style={styles.logoText}>Auris</Text>
            <Text style={styles.logoSub}>Reset Password</Text>
          </TouchableOpacity>
          <View style={styles.form}>
            {resetMessage ? (
              <View>
                <Text style={styles.successText}>{resetMessage}</Text>
                <TouchableOpacity style={styles.btn} onPress={() => { setShowForgotPassword(false); setResetMessage(""); }}>
                  <Text style={styles.btnText}>Back to Sign In</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <Text style={styles.label}>STORE ID</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="Enter your Store ID" 
                  placeholderTextColor="#86868B" 
                  value={forgotStoreId} 
                  onChangeText={setForgotStoreId} 
                  autoCapitalize="none" 
                  autoCorrect={false} 
                />
                <TouchableOpacity style={[styles.btn, resetLoading && styles.btnDisabled]} onPress={handleResetRequest} disabled={resetLoading}>
                  {resetLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Request Reset</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.backLink} onPress={() => setShowForgotPassword(false)}>
                  <Text style={styles.backLinkText}>Back to Sign In</Text>
                </TouchableOpacity>
              </View>
            )}
            <Text style={styles.footer}>Powered by Skym Labs</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={styles.inner}>
        <TouchableOpacity
          style={styles.logoWrap}
          onLongPress={onAdmin}
          delayLongPress={800}
          activeOpacity={0.9}
        >
          <Text style={styles.logoText}>Auris</Text>
          <Text style={styles.logoSub}>Client Portal</Text>
        </TouchableOpacity>
        <View style={styles.form}>
          <Text style={styles.label}>STORE ID</Text>
          <TextInput 
            style={styles.input} 
            placeholder="Enter your Store ID" 
            placeholderTextColor="#86868B" 
            value={storeId} 
            onChangeText={setStoreId} 
            autoCapitalize="none" 
            autoCorrect={false} 
          />
          <Text style={styles.label}>PASSWORD</Text>
          <TextInput 
            style={styles.input} 
            placeholder="Your secure password" 
            placeholderTextColor="#86868B" 
            value={password} 
            onChangeText={setPassword} 
            secureTextEntry 
          />
          <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Sign In</Text>}
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.forgotLink} onPress={() => { setShowForgotPassword(true); setResetMessage(""); setForgotStoreId(""); }}>
            <Text style={styles.forgotLinkText}>Forgot Password?</Text>
          </TouchableOpacity>
          
          <Text style={styles.footer}>Powered by Skym Labs</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: "#F5F5F7" },
  inner:          { flex: 1, justifyContent: "center", paddingHorizontal: 32 },
  logoWrap:       { marginBottom: 56, alignItems: "center" },
  logoText:       { fontSize: 48, fontWeight: "800", color: "#1D1D1F", letterSpacing: -1.5 },
  logoSub:        { fontSize: 13, color: "#A68B5B", letterSpacing: 4, textTransform: "uppercase", marginTop: 6, fontWeight: "700" },
  form:           { backgroundColor: "#FFFFFF", borderRadius: 24, padding: 32, shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.05, shadowRadius: 24, elevation: 5 },
  label:          { fontSize: 11, color: "#86868B", letterSpacing: 1.5, marginBottom: 12, marginTop: 24, fontWeight: "700" },
  input:          { backgroundColor: "#F5F5F7", borderRadius: 12, padding: 18, color: "#1D1D1F", fontSize: 16, fontWeight: "500", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 4 },
  btn:            { backgroundColor: "#1D1D1F", borderRadius: 12, padding: 18, alignItems: "center", marginTop: 32, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8 },
  btnDisabled:    { opacity: 0.6 },
  btnText:        { color: "#FFFFFF", fontWeight: "700", fontSize: 16, letterSpacing: 0.5 },
  forgotLink:     { alignSelf: "center", marginTop: 20 },
  forgotLinkText: { color: "#86868B", fontSize: 14, fontWeight: "600", textDecorationLine: "underline" },
  backLink:       { alignSelf: "center", marginTop: 20 },
  backLinkText:   { color: "#86868B", fontSize: 14, fontWeight: "600" },
  successText:    { fontSize: 15, color: "#1D1D1F", textAlign: "center", lineHeight: 22, fontWeight: "500", marginBottom: 8 },
  footer:         { textAlign: "center", color: "#86868B", fontSize: 12, marginTop: 32, letterSpacing: 0.5, fontWeight: "500" },
});
