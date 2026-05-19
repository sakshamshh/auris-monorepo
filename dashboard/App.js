import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, SafeAreaView, Platform } from "react-native";
import { getSavedCredentials, logout, fetchLive } from "./src/services/api";

import LoginScreen from "./src/screens/LoginScreen";
import CalibrationScreen from "./src/screens/CalibrationScreen";
import AdminScreen from "./src/screens/AdminScreen";

// New Factory Screens
import FactoryMapScreen from "./src/screens/FactoryMapScreen";
import FactoryDataScreen from "./src/screens/FactoryDataScreen";
import FactoryReportScreen from "./src/screens/FactoryReportScreen";
import FactoryAnalyticsScreen from "./src/screens/FactoryAnalyticsScreen";

// New Retail Screens
import RetailMapScreen from "./src/screens/RetailMapScreen";
import FootfallScreen from "./src/screens/FootfallScreen";
import RetailReportScreen from "./src/screens/RetailReportScreen";
import HistoryScreen from "./src/screens/HistoryScreen";

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
          const res = await fetchLive(store.store_id, store.password);
          if (res && res.cameras) {
            setCameraCount(res.cameras.length);
          } else {
            setCameraCount(0);
          }
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

  const plan = store.plan || "retail";

  const renderScreen = () => {
    if (plan === "factory") {
      switch (tab) {
        case "data": return <FactoryDataScreen store={store} />;
        case "report": return <FactoryReportScreen store={store} />;
        case "analytics": return <FactoryAnalyticsScreen store={store} />;
        default: return <FactoryMapScreen store={store} />;
      }
    } else {
      switch (tab) {
        case "footfall": return <FootfallScreen store={store} />;
        case "report": return <RetailReportScreen store={store} />;
        case "history": return <HistoryScreen store={store} />;
        case "calibrate": return <CalibrationScreen store={store} />;
        default: return <RetailMapScreen store={store} />;
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarInfo}>
          <Text style={styles.storeName}>{store.store_name || store.store_id}</Text>
          <Text style={styles.camCount}>
            {cameraCount !== null ? `${cameraCount} Active Cameras` : "Loading cameras..."}
          </Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Screen Content */}
      <View style={styles.content}>{renderScreen()}</View>

      {/* Dynamic Tab Bar */}
      <View style={styles.tabBar}>
        {plan === "factory" ? (
          <>
            <TabBtn id="map" label="Map" icon="🗺" tab={tab} setTab={setTab} />
            <TabBtn id="data" label="Data" icon="📊" tab={tab} setTab={setTab} />
            <TabBtn id="report" label="Report" icon="✦" tab={tab} setTab={setTab} />
            <TabBtn id="analytics" label="Analytics" icon="📈" tab={tab} setTab={setTab} />
          </>
        ) : (
          <>
            <TabBtn id="map" label="Map" icon="🗺" tab={tab} setTab={setTab} />
            <TabBtn id="footfall" label="Footfall" icon="👥" tab={tab} setTab={setTab} />
            <TabBtn id="report" label="Report" icon="✦" tab={tab} setTab={setTab} />
            <TabBtn id="history" label="History" icon="📅" tab={tab} setTab={setTab} />
            <TabBtn id="calibrate" label="Calibrate" icon="⊕" tab={tab} setTab={setTab} />
          </>
        )}
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
});
