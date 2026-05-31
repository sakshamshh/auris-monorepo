import React, { useState, useEffect, useCallback } from "react";
import { 
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, 
  SafeAreaView, Platform, ScrollView, RefreshControl, Dimensions 
} from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { BarChart } from "react-native-chart-kit";
import { LinearGradient } from "expo-linear-gradient";

import { getSavedCredentials, logout, fetchFactoryCameras, fetchDeadtime, fetchBottleneck, fetchPatterns } from "./services/api";
import LoginScreen from "./screens/LoginScreen";

// Helper formatting functions
const fmtNum = (n) => n?.toLocaleString('en-IN') ?? '0';
const fmtRs = (n) => n != null ? `₹${fmtNum(Math.round(n))}` : '₹0';
const fmtHrs = (n) => n != null ? `${parseFloat(n).toFixed(2)} hrs` : '0.00 hrs';

const screenWidth = Dimensions.get("window").width;

// -----------------------------------------------------
// 1. Dashboard Tab Component
// -----------------------------------------------------
const DashboardTab = ({ store, cameraCount, data, loading, refreshing, onRefresh }) => {
  const { deadtimeData, bottleneckData, patternsData, error } = data;

  // Trial calculation
  const createdDate = store?.created_at ? new Date(store.created_at) : new Date();
  const trialDaysElapsed = Math.floor((new Date() - createdDate) / (1000 * 60 * 60 * 24));
  const trialProgress = Math.min(100, Math.max(0, (trialDaysElapsed / 30) * 100));

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00FF9D" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.retryBtn}>
          <Text style={styles.retryText}>RETRY</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const summary = deadtimeData?.summary || {};
  const todayCost = summary.today_cost_inr || 0;
  const weekCost = summary.week_cost_inr || 0;
  const monthCost = summary.month_cost_inr || 0;
  const deadHours = summary.dead_hours_total || 0;
  const prodHours = summary.productive_hours_total || 0;
  
  const dailyTrend = deadtimeData?.daily_trend || [];
  const chartLabels = dailyTrend.map(d => {
    const parts = d.date.split('-'); 
    return `${parts[1]}/${parts[2]}`;
  });
  const chartValues = dailyTrend.map(d => d.cost);

  const rawNarrative = deadtimeData?.narrative || "";
  const narrative = rawNarrative.replace(/\*\*[^*]+\*\*/g, '').replace(/#/g, '').trim();
  const byZone = deadtimeData?.by_zone || [];
  const bottlenecks = bottleneckData?.ranked_stations || [];
  const patterns = patternsData?.patterns || [];

  return (
    <View style={styles.tabContainer}>
      <LinearGradient colors={["#0A0F16", "#040608"]} style={StyleSheet.absoluteFillObject} />
      
      {/* Top Header */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.storeName}>{store.store_name || store.store_id}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: cameraCount > 0 ? '#00FF9D' : '#FF3366', shadowColor: cameraCount > 0 ? '#00FF9D' : '#FF3366', shadowOpacity: 0.8, shadowRadius: 6 }]} />
            <Text style={styles.camCount}>
              {cameraCount !== null ? `${cameraCount} CAMERAS ONLINE` : "LOADING..."}
            </Text>
          </View>
        </View>
      </View>

      {/* Trial Progress Bar */}
      <View style={styles.trialBarContainer}>
        <View style={styles.trialBarHeader}>
          <Text style={styles.trialLabel}>AURIS TRIAL</Text>
          <Text style={styles.trialValue}>Day {Math.max(1, trialDaysElapsed)} of 30</Text>
        </View>
        <View style={styles.trialTrack}>
          <LinearGradient
            colors={["#00FF9D", "#00B8FF"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.trialFill, { width: `${trialProgress}%` }]} 
          />
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00FF9D" />}
      >
        {/* HERO METRICS: Split Costs */}
        <LinearGradient 
          colors={["rgba(22, 27, 34, 0.8)", "rgba(10, 15, 22, 0.95)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroMainRow}>
            <View style={styles.heroMainCol}>
              <Text style={styles.heroLabel}>TODAY'S LOSS</Text>
              <Text style={styles.heroValue}>{fmtRs(todayCost)}</Text>
            </View>
            <View style={styles.heroMainCol}>
              <Text style={styles.heroLabel}>THIS WEEK</Text>
              <Text style={[styles.heroValue, { color: '#FFD700' }]}>{fmtRs(weekCost)}</Text>
            </View>
          </View>
          
          <View style={styles.heroSubRow}>
            <View style={styles.heroSubItem}>
              <Text style={styles.heroSubLabel}>30-DAY TOTAL</Text>
              <Text style={styles.heroSubValue}>{fmtRs(monthCost)}</Text>
            </View>
            <View style={styles.heroSubItem}>
              <Text style={styles.heroSubLabel}>DEAD HOURS</Text>
              <Text style={[styles.heroSubValue, { color: '#A0AEC0' }]}>{fmtHrs(deadHours)}</Text>
            </View>
            <View style={styles.heroSubItem}>
              <Text style={styles.heroSubLabel}>PROD HOURS</Text>
              <Text style={[styles.heroSubValue, { color: '#00FF9D' }]}>{fmtHrs(prodHours)}</Text>
            </View>
          </View>
        </LinearGradient>

        {narrative ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>AI INSIGHTS</Text>
            <LinearGradient colors={["rgba(0, 255, 157, 0.1)", "rgba(22, 27, 34, 0.9)"]} style={[styles.card, { borderColor: '#00FF9D', borderWidth: 1 }]}>
              <Text style={styles.narrativeText}>{narrative}</Text>
            </LinearGradient>
          </View>
        ) : null}

        {/* 7-DAY TREND CHART */}
        {dailyTrend.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>7-DAY INEFFICIENCY TREND</Text>
            <View style={[styles.card, { padding: 0, paddingVertical: 16, overflow: 'hidden' }]}>
              <BarChart
                data={{
                  labels: chartLabels,
                  datasets: [{ data: chartValues }]
                }}
                width={screenWidth - 32} // account for padding
                height={220}
                yAxisLabel="₹"
                fromZero={false}
                showValuesOnTopOfBars={true}
                chartConfig={{
                  backgroundColor: "#161B22",
                  backgroundGradientFrom: "#161B22",
                  backgroundGradientTo: "#161B22",
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(255, 51, 102, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(139, 148, 158, ${opacity})`,
                  barPercentage: 0.6,
                }}
                style={{ marginLeft: -10 }}
                withInnerLines={false}
              />
            </View>
          </View>
        )}

        {byZone.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ZONE BREAKDOWN</Text>
            {byZone.map((z, idx) => (
              <LinearGradient key={`zone-${idx}`} colors={["rgba(22, 27, 34, 0.7)", "rgba(10, 15, 22, 0.8)"]} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{z.zone_label || z.zone_id}</Text>
                  <Text style={styles.cardCost}>{fmtRs(z.dead_cost_inr)}</Text>
                </View>
                <View style={styles.cardRow}>
                  <Text style={styles.cardSub}>Dead: {fmtHrs(z.dead_hours)}</Text>
                  <Text style={styles.cardSub}>Prod: {fmtHrs(z.productive_hours)}</Text>
                </View>
              </LinearGradient>
            ))}
          </View>
        )}

        {/* BOTTLENECKS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>WORKSTATION BOTTLENECKS (30D)</Text>
          {bottlenecks.length > 0 ? bottlenecks.map((b, idx) => (
            <LinearGradient key={`btnk-${idx}`} colors={["rgba(255, 51, 102, 0.1)", "rgba(22, 27, 34, 0.9)"]} style={[styles.card, { borderColor: 'rgba(255, 51, 102, 0.3)' }]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{b.zone_label || b.zone_id}</Text>
                <Text style={styles.cardCost}>{fmtRs(b.total_cost_inr)}</Text>
              </View>
              <Text style={styles.cardSub}>{b.event_count} Events  •  {fmtHrs(b.total_cascade_idle_hours)} Cascade Idle</Text>
            </LinearGradient>
          )) : (
            <Text style={styles.emptyText}>No bottlenecks detected.</Text>
          )}
        </View>

        {/* PATTERNS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RECURRING PATTERNS (30D)</Text>
          {patterns.length > 0 ? patterns.map((p, idx) => (
            <LinearGradient key={`patt-${idx}`} colors={["rgba(0, 184, 255, 0.1)", "rgba(22, 27, 34, 0.9)"]} style={[styles.card, { borderColor: 'rgba(0, 184, 255, 0.3)' }]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{p.zone_label || p.zone_id} at {p.hour_label}</Text>
                <Text style={[styles.cardCost, { color: '#00B8FF' }]}>{fmtRs(p.monthly_cost_inr)}</Text>
              </View>
              <Text style={styles.cardSub}>Repeated {p.recurrence_count}x  •  {p.confidence.toFixed(0)}% Confidence</Text>
            </LinearGradient>
          )) : (
            <Text style={styles.emptyText}>No recurring patterns detected.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

// -----------------------------------------------------
// 2. Settings Tab Component
// -----------------------------------------------------
const SettingsTab = ({ store, onLogout }) => {
  return (
    <View style={styles.tabContainer}>
      <LinearGradient colors={["#0A0F16", "#040608"]} style={StyleSheet.absoluteFillObject} />
      <View style={styles.topBar}>
        <Text style={styles.storeName}>Settings</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account: {store.store_id}</Text>
          <Text style={styles.cardSub}>Logged in successfully.</Text>
        </View>
        <TouchableOpacity style={[styles.card, { borderColor: '#FF3366', alignItems: 'center' }]} onPress={onLogout}>
          <Text style={{ color: '#FF3366', fontWeight: '800' }}>LOG OUT</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

// -----------------------------------------------------
// Main App Shell
// -----------------------------------------------------
const Tab = createBottomTabNavigator();

export default function App() {
  const [store, setStore] = useState(null);
  const [checking, setChecking] = useState(true);
  const [cameraCount, setCameraCount] = useState(null);
  
  // Dashboard data states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState({ error: null, deadtimeData: null, bottleneckData: null, patternsData: null });

  useEffect(() => {
    (async () => {
      const creds = await getSavedCredentials();
      if (creds) setStore(creds);
      setChecking(false);
    })();
  }, []);

  useEffect(() => {
    if (store) {
      const fetchCameras = async () => {
        try {
          const res = await fetchFactoryCameras(store.store_id, store.password);
          setCameraCount(res.total_online);
        } catch (e) {
          console.log("Fetch camera error:", e);
          setCameraCount(0);
        }
      };
      fetchCameras();
      const interval = setInterval(fetchCameras, 15000);
      return () => clearInterval(interval);
    }
  }, [store]);

  const loadData = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - 30); // Default 30 days

    try {
      const [dead, bottle, patt] = await Promise.all([
        fetchDeadtime(store.store_id, store.password, from.toISOString(), to.toISOString()),
        fetchBottleneck(store.store_id, store.password),
        fetchPatterns(store.store_id, store.password)
      ]);
      setData({ error: null, deadtimeData: dead, bottleneckData: bottle, patternsData: patt });
    } catch (e) {
      console.log("Fetch data error:", e);
      setData(prev => ({ ...prev, error: "Failed to load factory data." }));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [store]);

  useEffect(() => {
    if (store) {
      loadData();
    }
  }, [store, loadData]);

  const handleLogin = (data, password) => {
    setStore({ ...data, password });
  };

  const handleLogout = async () => {
    await logout();
    setStore(null);
    setCameraCount(null);
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (checking) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: '#0D1117' }]}>
        <ActivityIndicator size="large" color="#00FF9D" />
      </View>
    );
  }

  if (!store) {
    return <LoginScreen onLogin={handleLogin} onAdmin={() => {}} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <NavigationContainer>
        <Tab.Navigator 
          screenOptions={{ 
            headerShown: false,
            tabBarStyle: { backgroundColor: '#161B22', borderTopColor: '#30363D' },
            tabBarActiveTintColor: '#00FF9D',
            tabBarInactiveTintColor: '#8B949E'
          }}
        >
          <Tab.Screen 
            name="Dashboard" 
            children={() => (
              <DashboardTab 
                store={store} 
                cameraCount={cameraCount} 
                data={data} 
                loading={loading} 
                refreshing={refreshing} 
                onRefresh={onRefresh} 
              />
            )} 
          />
          <Tab.Screen 
            name="Settings" 
            children={() => <SettingsTab store={store} onLogout={handleLogout} />} 
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#0A0F16", paddingTop: Platform.OS === "android" ? 25 : 0 },
  tabContainer: { flex: 1, backgroundColor: "transparent" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0A0F16" },
  
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "transparent",
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  storeName: { fontSize: 22, fontWeight: "900", color: "#FFFFFF", textTransform: "uppercase", letterSpacing: 1.2 },
  statusRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  camCount: { fontSize: 12, color: "#8B949E", fontWeight: "700", letterSpacing: 0.8 },
  
  trialBarContainer: { paddingHorizontal: 24, paddingVertical: 14, backgroundColor: "rgba(255,255,255,0.02)", borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
  trialBarHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  trialLabel: { fontSize: 11, color: "#A0AEC0", fontWeight: "800", letterSpacing: 1.2 },
  trialValue: { fontSize: 11, color: "#00FF9D", fontWeight: "900", letterSpacing: 0.8 },
  trialTrack: { height: 6, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 3, overflow: "hidden" },
  trialFill: { height: "100%", borderRadius: 3 },

  scrollContent: { padding: 20, paddingBottom: 60 },
  errorText: { color: "#FF3366", fontSize: 16, textAlign: "center", marginTop: 20, marginBottom: 10, fontWeight: "600" },
  retryBtn: { alignSelf: 'center', backgroundColor: 'rgba(255, 51, 102, 0.1)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255, 51, 102, 0.3)' },
  retryText: { color: '#FF3366', fontSize: 13, fontWeight: '800' },
  emptyText: { color: "#4A5568", fontSize: 14, fontStyle: "italic", textAlign: "center", marginTop: 16 },

  heroCard: {
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 8,
  },
  heroMainRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  heroMainCol: { flex: 1 },
  heroLabel: { fontSize: 12, color: "#A0AEC0", fontWeight: "800", letterSpacing: 1.5, marginBottom: 8 },
  heroValue: { fontSize: 36, fontWeight: "900", color: "#FF3366", letterSpacing: -1.5, textShadowColor: "rgba(255, 51, 102, 0.3)", textShadowOffset: {width: 0, height: 2}, textShadowRadius: 10 },
  
  heroSubRow: { flexDirection: "row", width: "100%", justifyContent: "space-between", borderTopWidth: 1, borderColor: "rgba(255,255,255,0.08)", paddingTop: 18 },
  heroSubItem: { alignItems: "flex-start" },
  heroSubLabel: { fontSize: 11, color: "#718096", fontWeight: "800", letterSpacing: 1.2, marginBottom: 6 },
  heroSubValue: { fontSize: 16, fontWeight: "800", color: "#E2E8F0" },

  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 13, color: "#A0AEC0", fontWeight: "900", letterSpacing: 2, marginBottom: 16, paddingLeft: 4, textTransform: "uppercase" },
  
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: "800", color: "#F7FAFC", flex: 1, letterSpacing: 0.5 },
  cardCost: { fontSize: 18, fontWeight: "900", color: "#FF3366" },
  cardRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  cardSub: { fontSize: 13, color: "#A0AEC0", fontWeight: "600", letterSpacing: 0.3 },
  
  narrativeText: { fontSize: 15, color: "#E2E8F0", lineHeight: 24, fontWeight: "500", letterSpacing: 0.2 }
});
