import React, { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Platform } from "react-native";
import { API_BASE } from "../services/api";

const WEEKS_LIST = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function SignupWizard({ inviteCode, onGoToLogin }) {
  const [loadingCode, setLoadingCode] = useState(true);
  const [valid, setValid] = useState(false);
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [workerCount, setWorkerCount] = useState("<10");
  const [shiftStart, setShiftStart] = useState("09:00");
  const [shiftEnd, setShiftEnd] = useState("18:00");
  const [workingDays, setWorkingDays] = useState({
    Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: false, Sun: false
  });

  const [cameraBrand, setCameraBrand] = useState("CPPlus");
  const [cameraCount, setCameraCount] = useState("4");
  const [dvrPassword, setDvrPassword] = useState("");
  const [showDvrPassword, setShowDvrPassword] = useState(false);

  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [showWifiPassword, setShowWifiPassword] = useState(false);

  const [clientPassword, setClientPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showClientPassword, setShowClientPassword] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/signup/${inviteCode}`)
      .then(res => res.json())
      .then(data => {
        if (data.valid) {
          setValid(true);
          setStoreId(data.store_id);
          setStoreName(data.store_name || data.store_id);
        } else {
          setValid(false);
        }
        setLoadingCode(false);
      })
      .catch(err => {
        console.error("Invite code check failed:", err);
        setValid(false);
        setLoadingCode(false);
      });
  }, [inviteCode]);

  const handleDayToggle = (day) => {
    setWorkingDays(prev => ({ ...prev, [day]: !prev[day] }));
  };

  const handleNext = () => {
    if (step === 1) {
      if (!contactName.trim() || !phone.trim()) {
        alert("Please enter your name and phone number.");
        return;
      }
    }
    if (step === 3) {
      if (!dvrPassword.trim()) {
        alert("Please enter your Camera Recorder/DVR password.");
        return;
      }
    }
    if (step === 4) {
      if (!wifiSsid.trim() || !wifiPassword.trim()) {
        alert("Please enter WiFi name and password.");
        return;
      }
    }
    if (step === 5) {
      if (clientPassword.length < 6) {
        alert("Password must be at least 6 characters.");
        return;
      }
      if (clientPassword !== confirmPassword) {
        alert("Passwords do not match.");
        return;
      }
      handleSubmit();
      return;
    }
    setStep(prev => prev + 1);
  };

  const handlePrev = () => {
    setStep(prev => prev - 1);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const selectedDays = Object.keys(workingDays).filter(day => workingDays[day]);

    const payload = {
      contact_name: contactName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      worker_count: workerCount,
      shift_start: shiftStart,
      shift_end: shiftEnd,
      working_days: selectedDays,
      camera_brand: cameraBrand,
      camera_count: parseInt(cameraCount, 10),
      dvr_password: dvrPassword.trim(),
      wifi_ssid: wifiSsid.trim(),
      wifi_password: wifiPassword.trim(),
      client_password: clientPassword.trim()
    };

    try {
      const res = await fetch(`${API_BASE}/api/signup/${inviteCode}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStep(6);
      } else {
        alert(data.detail || "Failed to complete signup.");
      }
    } catch (e) {
      alert("Network error: Could not complete signup.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingCode) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Validating invitation link...</Text>
      </View>
    );
  }

  if (!valid) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={[styles.title, { color: "#dc2626" }]}>Link Expired or Invalid</Text>
        <Text style={styles.subtext}>This self-signup link has expired or is no longer valid. Please contact your Auris administrator for a new invite link.</Text>
        <TouchableOpacity style={styles.loginBtn} onPress={onGoToLogin}>
          <Text style={styles.loginBtnText}>Go to Login Page</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderProgress = () => {
    if (step > 5) return null;
    return (
      <View style={styles.progressContainer}>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${(step / 5) * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>Step {step} of 5</Text>
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.wizardCard}>
        {/* Auris Logo */}
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>AURIS</Text>
          <Text style={styles.logoSubText}>Self-Signup Wizard</Text>
        </View>

        {renderProgress()}

        {step === 1 && (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>Welcome to Auris, {storeName}!</Text>
            <Text style={styles.subtext}>Let's set up your account in 3 minutes. Please fill in your primary contact information.</Text>

            <Text style={styles.label}>YOUR NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. John Doe"
              value={contactName}
              onChangeText={setContactName}
              placeholderTextColor="#9ca3af"
            />

            <Text style={styles.label}>PHONE NUMBER</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. +91 9876543210"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholderTextColor="#9ca3af"
            />

            <Text style={styles.label}>EMAIL ADDRESS (OPTIONAL)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. john@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor="#9ca3af"
            />
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>Your Facility</Text>
            <Text style={styles.subtext}>Provide some operational details about your factory floor to configure the analytics dashboards.</Text>

            <Text style={styles.label}>NUMBER OF WORKERS</Text>
            <View style={styles.selectorRow}>
              {["<10", "10-25", "25-50", "50-100", "100+"].map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.selectorItem, workerCount === opt && styles.selectorItemSelected]}
                  onPress={() => setWorkerCount(opt)}
                >
                  <Text style={[styles.selectorText, workerCount === opt && styles.selectorTextSelected]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>DAILY SHIFT RUNTIME</Text>
            <View style={styles.timeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.miniLabel}>START TIME</Text>
                <TextInput
                  style={styles.input}
                  value={shiftStart}
                  onChangeText={setShiftStart}
                  placeholder="09:00"
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <View style={{ width: 16 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.miniLabel}>END TIME</Text>
                <TextInput
                  style={styles.input}
                  value={shiftEnd}
                  onChangeText={setShiftEnd}
                  placeholder="18:00"
                  placeholderTextColor="#9ca3af"
                />
              </View>
            </View>

            <Text style={styles.label}>WORKING DAYS</Text>
            <View style={styles.selectorRow}>
              {WEEKS_LIST.map(day => (
                <TouchableOpacity
                  key={day}
                  style={[styles.dayItem, workingDays[day] && styles.dayItemSelected]}
                  onPress={() => handleDayToggle(day)}
                >
                  <Text style={[styles.dayText, workingDays[day] && styles.dayTextSelected]}>{day}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>Your Cameras</Text>
            <Text style={styles.subtext}>Tell us about your existing recording equipment.</Text>

            <Text style={styles.label}>CAMERA BRAND</Text>
            <View style={styles.selectorRow}>
              {["CPPlus", "Hikvision", "Dahua", "Other"].map(brand => (
                <TouchableOpacity
                  key={brand}
                  style={[styles.selectorItem, cameraBrand === brand && styles.selectorItemSelected]}
                  onPress={() => setCameraBrand(brand)}
                >
                  <Text style={[styles.selectorText, cameraBrand === brand && styles.selectorTextSelected]}>{brand}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>NUMBER OF CAMERAS</Text>
            <View style={styles.selectorRow}>
              {["2", "4", "8", "16", "32+"].map(count => (
                <TouchableOpacity
                  key={count}
                  style={[styles.selectorItem, cameraCount === count && styles.selectorItemSelected]}
                  onPress={() => setCameraCount(count)}
                >
                  <Text style={[styles.selectorText, cameraCount === count && styles.selectorTextSelected]}>{count}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>CAMERA RECORDER PASSWORD (DVR/NVR)</Text>
            <View style={styles.passInputWrapper}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="Enter DVR/NVR Password"
                value={dvrPassword}
                onChangeText={setDvrPassword}
                secureTextEntry={!showDvrPassword}
                autoCapitalize="none"
                placeholderTextColor="#9ca3af"
              />
              <TouchableOpacity style={styles.toggleShowBtn} onPress={() => setShowDvrPassword(!showDvrPassword)}>
                <Text style={styles.toggleShowText}>{showDvrPassword ? "HIDE" : "SHOW"}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.helperText}>
              The password your security company set when installing cameras. Usually on a sticker on your DVR/NVR box.
            </Text>
          </View>
        )}

        {step === 4 && (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>WiFi Details</Text>
            <Text style={styles.subtext}>We need these details so the Auris edge device can connect automatically on installation day.</Text>

            <Text style={styles.label}>WIFI NAME (SSID)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. MyFactory_WiFi"
              value={wifiSsid}
              onChangeText={setWifiSsid}
              placeholderTextColor="#9ca3af"
            />

            <Text style={styles.label}>WIFI PASSWORD</Text>
            <View style={styles.passInputWrapper}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="Enter WiFi Password"
                value={wifiPassword}
                onChangeText={setWifiPassword}
                secureTextEntry={!showWifiPassword}
                autoCapitalize="none"
                placeholderTextColor="#9ca3af"
              />
              <TouchableOpacity style={styles.toggleShowBtn} onPress={() => setShowWifiPassword(!showWifiPassword)}>
                <Text style={styles.toggleShowText}>{showWifiPassword ? "HIDE" : "SHOW"}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.helperText}>
              We need this to connect your Auris device to your network.
            </Text>
          </View>
        )}

        {step === 5 && (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>Create Your Login</Text>
            <Text style={styles.subtext}>Set up your personal access password for the auris.skymlabs.com portal dashboard.</Text>

            <Text style={styles.label}>CHOOSE PASSWORD</Text>
            <View style={styles.passInputWrapper}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="Choose dashboard password"
                value={clientPassword}
                onChangeText={setClientPassword}
                secureTextEntry={!showClientPassword}
                autoCapitalize="none"
                placeholderTextColor="#9ca3af"
              />
              <TouchableOpacity style={styles.toggleShowBtn} onPress={() => setShowClientPassword(!showClientPassword)}>
                <Text style={styles.toggleShowText}>{showClientPassword ? "HIDE" : "SHOW"}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>CONFIRM PASSWORD</Text>
            <TextInput
              style={styles.input}
              placeholder="Confirm dashboard password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showClientPassword}
              autoCapitalize="none"
              placeholderTextColor="#9ca3af"
            />
          </View>
        )}

        {step === 6 && (
          <View style={[styles.stepContainer, { alignItems: "center" }]}>
            <View style={styles.successIcon}>
              <Text style={{ fontSize: 32 }}>✓</Text>
            </View>
            <Text style={[styles.title, { textAlign: "center" }]}>Account Created Successfully!</Text>
            <Text style={[styles.subtext, { textAlign: "center", marginBottom: 24 }]}>
              Your onboarding is complete. Your Auris device is ready for dispatch and installation.
            </Text>
            
            <View style={styles.summaryBox}>
              <Text style={styles.summaryItem}>● Installation scheduled automatically.</Text>
              <Text style={styles.summaryItem}>● You will receive a WhatsApp update when your system goes live.</Text>
              <Text style={styles.summaryItem}>● Login anytime at: auris.skymlabs.com</Text>
            </View>

            <TouchableOpacity style={styles.finishBtn} onPress={onGoToLogin}>
              <Text style={styles.finishBtnText}>Go to Login Dashboard</Text>
            </TouchableOpacity>
          </View>
        )}

        {step <= 5 && (
          <View style={styles.btnRow}>
            {step > 1 && (
              <TouchableOpacity style={styles.backBtn} onPress={handlePrev} disabled={submitting}>
                <Text style={styles.backBtnText}>← Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.nextBtn} onPress={handleNext} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.nextBtnText}>{step === 5 ? "Create Account →" : "Next →"}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, backgroundColor: "#ffffff", justifyContent: "center", alignItems: "center", padding: 32 },
  loadingText: { fontSize: 16, color: "#1a1a2e", marginTop: 16, fontWeight: "600" },
  container: { flexGrow: 1, backgroundColor: "#ffffff", justifyContent: "center", alignItems: "center", paddingVertical: Platform.OS === "web" ? 50 : 20 },
  wizardCard: { width: "100%", maxWidth: 450, backgroundColor: "#ffffff", padding: 24, borderRadius: 16, borderWidth: Platform.OS === "web" ? 1 : 0, borderColor: "#e5e7eb" },
  logoContainer: { alignItems: "center", marginBottom: 32 },
  logoText: { fontSize: 28, fontWeight: "900", color: "#1a1a2e", letterSpacing: 2 },
  logoSubText: { fontSize: 12, color: "#2563eb", fontWeight: "700", marginTop: 4, textTransform: "uppercase" },
  progressContainer: { marginBottom: 32 },
  progressBarBg: { height: 6, backgroundColor: "#f3f4f6", borderRadius: 3, overflow: "hidden", marginBottom: 8 },
  progressBarFill: { height: "100%", backgroundColor: "#2563eb", borderRadius: 3 },
  progressText: { fontSize: 12, color: "#9ca3af", fontWeight: "600", textAlign: "right" },
  stepContainer: { width: "100%" },
  title: { fontSize: 20, fontWeight: "800", color: "#1a1a2e", marginBottom: 12 },
  subtext: { fontSize: 14, color: "#6b7280", lineHeight: 22, marginBottom: 24 },
  label: { fontSize: 11, fontWeight: "700", color: "#1a1a2e", letterSpacing: 1, marginTop: 18, marginBottom: 8 },
  miniLabel: { fontSize: 10, fontWeight: "700", color: "#6b7280", marginBottom: 4 },
  helperText: { fontSize: 12, color: "#9ca3af", lineHeight: 18, marginTop: 8 },
  input: { backgroundColor: "#f9fafb", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 14, fontSize: 15, color: "#1a1a2e", marginBottom: 12, width: "100%" },
  passInputWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: "#f9fafb", borderRadius: 10, borderWidth: 1, borderColor: "#e5e7eb", width: "100%", overflow: "hidden", marginBottom: 12 },
  toggleShowBtn: { paddingHorizontal: 16, height: "100%", justifyContent: "center" },
  toggleShowText: { fontSize: 11, fontWeight: "700", color: "#2563eb" },
  selectorRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  selectorItem: { flex: 1, minWidth: 70, backgroundColor: "#f9fafb", borderWidth: 1, borderColor: "#e5e7eb", paddingVertical: 12, paddingHorizontal: 8, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  selectorItemSelected: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  selectorText: { fontSize: 13, fontWeight: "700", color: "#6b7280" },
  selectorTextSelected: { color: "#ffffff" },
  timeRow: { flexDirection: "row", width: "100%" },
  dayItem: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#f9fafb", borderWidth: 1, borderColor: "#e5e7eb", alignItems: "center", justifyContent: "center" },
  dayItemSelected: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  dayText: { fontSize: 11, fontWeight: "700", color: "#6b7280" },
  dayTextSelected: { color: "#ffffff" },
  btnRow: { flexDirection: "row", marginTop: 32, gap: 12 },
  backBtn: { flex: 1, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, paddingVertical: 16, alignItems: "center" },
  backBtnText: { fontSize: 15, fontWeight: "700", color: "#6b7280" },
  nextBtn: { flex: 2, backgroundColor: "#2563eb", borderRadius: 10, paddingVertical: 16, alignItems: "center" },
  nextBtnText: { fontSize: 15, fontWeight: "700", color: "#ffffff" },
  loginBtn: { marginTop: 24, backgroundColor: "#2563eb", borderRadius: 10, paddingVertical: 14, paddingHorizontal: 24, alignItems: "center" },
  loginBtnText: { fontSize: 14, fontWeight: "700", color: "#ffffff" },
  successIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#e0f2fe", alignItems: "center", justifyContent: "center", marginBottom: 20 },
  summaryBox: { width: "100%", backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "#bbf7d0", padding: 18, borderRadius: 12, gap: 12, marginBottom: 32 },
  summaryItem: { fontSize: 13, color: "#166534", fontWeight: "600", lineHeight: 18 },
  finishBtn: { backgroundColor: "#1a1a2e", borderRadius: 10, paddingVertical: 16, paddingHorizontal: 32, alignItems: "center", width: "100%" },
  finishBtnText: { fontSize: 15, fontWeight: "700", color: "#ffffff" }
});
