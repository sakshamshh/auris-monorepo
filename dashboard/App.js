import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, SafeAreaView, Platform } from "react-native";
import { getSavedCredentials, logout, fetchLive, fetchFactoryCameras } from "./src/services/api";

import LoginScreen from "./src/screens/LoginScreen";
import AdminScreen from "./src/screens/AdminScreen";

// New Factory Screens
import FactoryMapScreen from "./src/screens/FactoryMapScreen";
import FactoryDataScreen from "./src/screens/FactoryDataScreen";
import FactoryReportScreen from "./src/screens/FactoryReportScreen";
import FactoryAnalyticsScreen from "./src/screens/FactoryAnalyticsScreen";

export default function App() {
  const [store, setStore]       = useState(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab]           = useState("map");
  const [showAdmin, setShowAdmin] = useState(false);
  const [cameraCount, setCameraCount] = useState(null);

  useEffect(() => {
    (async () => {
      const creds = await getSavedCredentials();
      if (creds) setStore(creds);
      setChecking(false);
    })();
  }, []);

  useEffect(() => {
    if (store) {
      (async () => {
        try {
          const res = await fetchFactoryCameras(store.store_id, store.password);
          setCameraCount(res.total_online);
        } catch (e) {
          console.log("Fetch camera count error:", e.message);
          setCameraCount(0);
        }
      })();
    }
  }, [store]);

  const handleLogin = (data, password) => {
    setStore({ ...data, password });
    setTab("map");
  };

  const handleLogout = async () => {
    await logout();
    setStore(null);
    setTab("map");
    setShowAdmin(false);
    setCameraCount(null);
  };

  if (checking) return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color="#1A3C5E" />
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
      case "data": return <FactoryDataScreen store={store} />;
      case "report": return <FactoryReportScreen store={store} />;
      case "analytics": return <FactoryAnalyticsScreen store={store} />;
      default: return <FactoryMapScreen store={store} setCameraCount={setCameraCount} />;
    }
  };

  const createdDate = store.created_at ? new Date(store.created_at) : new Date();
  const daysSinceCreation = Math.max(0, Math.floor((new Date() - createdDate) / (1000 * 60 * 60 * 24)));
  const trialActive = daysSinceCreation <= 30;
  const trialDay = Math.min(30, daysSinceCreation + 1);

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarInfo}>
          <Text style={styles.storeName}>{store.store_name || store.store_id}</Text>
          <Text style={styles.camCount}>
            {cameraCount !== null ? (cameraCount > 0 ? `● ${cameraCount} cameras live` : "0 cameras live") : "Loading cameras..."}
          </Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Trial Progress Bar */}
      {trialActive && (
        <View style={styles.trialBar}>
          <View style={styles.trialHeader}>
            <Text style={styles.trialText}>Trial Day {trialDay} of 30 · Active</Text>
            <Text style={styles.trialPercentage}>{Math.round((daysSinceCreation / 30) * 100)}%</Text>
          </View>
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${Math.min(100, (daysSinceCreation / 30) * 100)}%` }]} />
          </View>
        </View>
      )}

      {/* Screen Content */}
      <View style={styles.content}>{renderScreen()}</View>

      {/* Dynamic Tab Bar */}
      <View style={styles.tabBar}>
        <TabBtn id="map" label="Map" icon="🗺" tab={tab} setTab={setTab} />
        <TabBtn id="data" label="Data" icon="📊" tab={tab} setTab={setTab} />
        <TabBtn id="report" label="Report" icon="✦" tab={tab} setTab={setTab} />
        <TabBtn id="analytics" label="Analytics" icon="📈" tab={tab} setTab={setTab} />
      </View>
    </SafeAreaView>
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
  loading: { flex: 1, backgroundColor: "#F9FAFB", justifyContent: "center", alignItems: "center" },
  container: { flex: 1, backgroundColor: "#F9FAFB", paddingTop: Platform.OS === "android" ? 25 : 0 },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: "#E5E7EB",
  },
  topBarInfo: {
    flexDirection: "column",
  },
  storeName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A3C5E", // navy
  },
  camCount: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  logoutBtn: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  logoutText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#DC2626",
  },
  content: { flex: 1 },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderColor: "#E5E7EB",
    paddingBottom: Platform.OS === "ios" ? 10 : 8,
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 4 },
  tabIcon: { fontSize: 20, marginBottom: 2, opacity: 0.4 },
  tabActive: { opacity: 1 },
  tabLabel: { fontSize: 10, color: "#9CA3AF", fontWeight: "500" },
  tabLabelActive: { color: "#1A3C5E", fontWeight: "700" },
  trialBar: {
    backgroundColor: "#FFFBEB",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "#FDE68A",
  },
  trialHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  trialText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#D97706",
  },
  trialPercentage: {
    fontSize: 11,
    fontWeight: "700",
    color: "#D97706",
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: "#FEF3C7",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#F59E0B",
    borderRadius: 3,
  },
});
