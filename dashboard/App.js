import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { getSavedCredentials, logout } from "./src/services/api";
import LoginScreen from "./src/screens/LoginScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import ReportScreen from "./src/screens/ReportScreen";
import MapScreen from "./src/screens/MapScreen";
import CalibrationScreen from "./src/screens/CalibrationScreen";
import AdminScreen from "./src/screens/AdminScreen";

export default function App() {
  const [store, setStore]       = useState(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab]           = useState("dashboard");
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      const creds = await getSavedCredentials();
      if (creds) setStore(creds);
      setChecking(false);
    })();
  }, []);

  const handleLogin = (data, password) => {
    setStore({ ...data, password });
  };

  const handleLogout = async () => {
    await logout();
    setStore(null);
    setTab("dashboard");
    setShowAdmin(false);
  };

  if (checking) return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color="#A68B5B" />
    </View>
  );

  if (showAdmin) {
    return <AdminScreen onBack={() => setShowAdmin(false)} />;
  }

  if (!store) {
    return <LoginScreen onLogin={handleLogin} onAdmin={() => setShowAdmin(true)} />;
  }

  const renderScreen = () => {
    switch (tab) {
      case "map": return <MapScreen store={store} />;
      case "calibrate": return <CalibrationScreen store={store} />;
      case "report": return <ReportScreen store={store} />;
      default: return <DashboardScreen store={store} onLogout={handleLogout} onAdmin={() => setShowAdmin(true)} />;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>{renderScreen()}</View>
      <View style={styles.tabBar}>
        <TabBtn id="dashboard" label="Dashboard" icon="□" tab={tab} setTab={setTab} />
        <TabBtn id="map" label="Map" icon="◎" tab={tab} setTab={setTab} />
        <TabBtn id="calibrate" label="Calibrate" icon="⊕" tab={tab} setTab={setTab} />
        <TabBtn id="report" label="Report" icon="≡" tab={tab} setTab={setTab} />
      </View>
    </View>
  );
}

function TabBtn({ id, label, icon, tab, setTab }) {
  const active = tab === id;
  return (
    <TouchableOpacity style={styles.tab} onPress={() => setTab(id)}>
      <Text style={[styles.tabIcon, active && styles.tabActive]}>{icon}</Text>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  loading:        { flex: 1, backgroundColor: "#FDFDFB", justifyContent: "center", alignItems: "center" },
  container:      { flex: 1, backgroundColor: "#FDFDFB" },
  content:        { flex: 1 },
  tabBar:         { flexDirection: "row", backgroundColor: "#FFFFFF", borderTopWidth: 1, borderColor: "rgba(166,139,91,0.08)", paddingBottom: 20 },
  tab:            { flex: 1, alignItems: "center", paddingVertical: 8 },
  tabIcon:        { fontSize: 18, marginBottom: 2, opacity: 0.3 },
  tabActive:      { opacity: 1 },
  tabLabel:       { fontSize: 9, color: "#858582", letterSpacing: 0.5, textTransform: "uppercase" },
  tabLabelActive: { color: "#A68B5B", fontWeight: "700" },
});
