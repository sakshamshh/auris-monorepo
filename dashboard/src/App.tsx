import React, { useState, useEffect, useCallback } from "react";
import { 
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, 
  SafeAreaView, Platform, ScrollView, RefreshControl, Dimensions 
} from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { BarChart } from "react-native-chart-kit";

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
      {/* Top Header */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.storeName}>{store.store_name || store.store_id}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: cameraCount > 0 ? '#00FF9D' : '#FF3366' }]} />
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
          <View style={[styles.trialFill, { width: `${trialProgress}%` }]} />
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00FF9D" />}
      >
        {/* HERO METRICS: Split Costs */}
        <View style={styles.heroCard}>
          <View style={styles.heroMainRow}>
            <View style={styles.heroMainCol}>
              <Text style={styles.heroLabel}>TODAY'S LOSS</Text>
              <Text style={styles.heroValue}>{fmtRs(todayCost)}</Text>
            </View>
            <View style={styles.heroMainCol}>
              <Text style={styles.heroLabel}>THIS WEEK</Text>
              <Text style={[styles.heroValue, { color: '#FFB800' }]}>{fmtRs(weekCost)}</Text>
            </View>
          </View>
          
          <View style={styles.heroSubRow}>
            <View style={styles.heroSubItem}>
              <Text style={styles.heroSubLabel}>30-DAY TOTAL</Text>
              <Text style={styles.heroSubValue}>{fmtRs(monthCost)}</Text>
            </View>
            <View style={styles.heroSubItem}>
              <Text style={styles.heroSubLabel}>DEAD HOURS</Text>
              <Text style={[styles.heroSubValue, { color: '#8B949E' }]}>{fmtHrs(deadHours)}</Text>
            </View>
            <View style={styles.heroSubItem}>
              <Text style={styles.heroSubLabel}>PROD HOURS</Text>
              <Text style={[styles.heroSubValue, { color: '#00FF9D' }]}>{fmtHrs(prodHours)}</Text>
            </View>
          </View>
        </View>

        {/* AI NARRATIVE */}
        {narrative ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>AI INSIGHTS</Text>
            <View style={[styles.card, { borderColor: '#00FF9D' }]}>
              <Text style={styles.narrativeText}>{narrative}</Text>
            </View>
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

        {/* ZONES LIST */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ZONE BREAKDOWN</Text>
          {byZone.map((zone, idx) => (
            <View key={idx} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{zone.zone_label}</Text>
                <Text style={styles.cardCost}>{fmtRs(zone.dead_cost_inr)}</Text>
              </View>
              <View style={styles.cardRow}>
                <Text style={styles.cardSub}>Dead: {fmtHrs(zone.dead_hours)}</Text>
                <Text style={styles.cardSub}>Productive: {fmtHrs(zone.productive_hours)}</Text>
              </View>
            </View>
          ))}
          {byZone.length === 0 && (
            <Text style={styles.emptyText}>No zone data available yet.</Text>
          )}
        </View>

        {/* BOTTLENECKS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CRITICAL BOTTLENECKS</Text>
          {bottlenecks.length > 0 ? (
            bottlenecks.map((item, idx) => (
              <View key={idx} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>#{idx + 1} {item.zone_label}</Text>
                  <Text style={[styles.cardCost, { color: '#FFB800' }]}>{fmtRs(item.total_cost_inr)}</Text>
                </View>
                <View style={styles.cardRow}>
                  <Text style={styles.cardSub}>Events: {item.event_count}</Text>
                  <Text style={styles.cardSub}>Cascade: {fmtHrs(item.total_cascade_idle_hours)}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No bottlenecks detected.</Text>
          )}
        </View>

        {/* PATTERNS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RECURRING PATTERNS</Text>
          {patterns.length > 0 ? (
            patterns.map((item, idx) => (
              <View key={idx} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{item.zone_label}</Text>
                  <Text style={[styles.cardCost, { color: '#FF3366' }]}>{fmtRs(item.monthly_cost_inr)}/mo</Text>
                </View>
                <View style={styles.cardRow}>
                  <Text style={styles.cardSub}>Time: {item.hour_label}</Text>
                  <Text style={styles.cardSub}>Frequency: {item.recurrence_count}x</Text>
                </View>
              </View>
            ))
          ) : (
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
  safeArea: { flex: 1, backgroundColor: "#0D1117", paddingTop: Platform.OS === "android" ? 25 : 0 },
  tabContainer: { flex: 1, backgroundColor: "#0D1117" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#161B22",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: "#30363D",
  },
  storeName: { fontSize: 18, fontWeight: "800", color: "#FFFFFF", textTransform: "uppercase", letterSpacing: 1 },
  statusRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  camCount: { fontSize: 11, color: "#8B949E", fontWeight: "700", letterSpacing: 0.5 },
  
  trialBarContainer: { paddingHorizontal: 20, paddingVertical: 12, backgroundColor: "#161B22", borderBottomWidth: 1, borderColor: "#30363D" },
  trialBarHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  trialLabel: { fontSize: 10, color: "#8B949E", fontWeight: "700", letterSpacing: 1 },
  trialValue: { fontSize: 10, color: "#00FF9D", fontWeight: "800", letterSpacing: 0.5 },
  trialTrack: { height: 6, backgroundColor: "#30363D", borderRadius: 3, overflow: "hidden" },
  trialFill: { height: "100%", backgroundColor: "#00FF9D", borderRadius: 3 },

  scrollContent: { padding: 16, paddingBottom: 40 },
  errorText: { color: "#FF3366", fontSize: 14, textAlign: "center", marginTop: 20, marginBottom: 10 },
  retryBtn: { alignSelf: 'center', backgroundColor: '#21262D', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#30363D' },
  retryText: { color: '#00FF9D', fontSize: 12, fontWeight: '700' },
  emptyText: { color: "#8B949E", fontSize: 13, fontStyle: "italic", textAlign: "center", marginTop: 10 },

  heroCard: {
    backgroundColor: "#161B22",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#30363D",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  heroMainRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  heroMainCol: { flex: 1 },
  heroLabel: { fontSize: 11, color: "#8B949E", fontWeight: "800", letterSpacing: 1.5, marginBottom: 8 },
  heroValue: { fontSize: 32, fontWeight: "900", color: "#FF3366", letterSpacing: -1 },
  
  heroSubRow: { flexDirection: "row", width: "100%", justifyContent: "space-between", borderTopWidth: 1, borderColor: "#30363D", paddingTop: 16 },
  heroSubItem: { alignItems: "center" },
  heroSubLabel: { fontSize: 10, color: "#8B949E", fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
  heroSubValue: { fontSize: 15, fontWeight: "800", color: "#FFFFFF" },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 12, color: "#8B949E", fontWeight: "800", letterSpacing: 1.5, marginBottom: 12, paddingLeft: 4 },
  
  card: {
    backgroundColor: "#161B22",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#30363D",
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#E6EDF3", flex: 1 },
  cardCost: { fontSize: 16, fontWeight: "800", color: "#FF3366" },
  cardRow: { flexDirection: "row", justifyContent: "space-between" },
  cardSub: { fontSize: 12, color: "#8B949E", fontWeight: "600" },
  
  narrativeText: { fontSize: 14, color: "#C9D1D9", lineHeight: 22, fontWeight: "500" }
});
