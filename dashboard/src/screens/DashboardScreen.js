import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Dimensions } from "react-native";
import { fetchToday, fetchLive, fetchHourly, fetchZones } from "../services/api";

const { width } = Dimensions.get("window");

export default function DashboardScreen({ store, onLogout, onAdmin }) {
  const [today, setToday]     = useState(null);
  const [live, setLive]       = useState(null);
  const [hourly, setHourly]   = useState(null);
  const [zones, setZones]     = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async () => {
    try {
      const [t, l, h, z] = await Promise.all([
        fetchToday(store.store_id, store.password),
        fetchLive(store.store_id, store.password),
        fetchHourly(store.store_id, store.password),
        fetchZones(store.store_id, store.password),
      ]);
      setToday(t); setLive(l); setHourly(h); setZones(z);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) { console.log("Load error:", e.message); }
  }, [store]);

  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const totalIn      = today?.cameras?.reduce((s, c) => s + (c.total_in || 0), 0) ?? "—";
  const totalOut     = today?.cameras?.reduce((s, c) => s + (c.total_out || 0), 0) ?? "—";
  const totalCurrent = today?.cameras?.reduce((s, c) => s + (c.current || 0), 0) ?? "—";
  const camsOnline   = live?.cameras?.length ?? "—";

  const hourlyByHour = {};
  hourly?.hourly?.forEach(h => { const hr = h._id.hour; hourlyByHour[hr] = (hourlyByHour[hr] || 0) + (h.entries || 0); });
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const maxEntries = Math.max(...hours.map(h => hourlyByHour[h] || 0), 1);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.storeName}>{store.store_name}</Text>
          <Text style={styles.lastUpdated}>{lastUpdated ? `Updated ${lastUpdated}` : "Loading..."}</Text>
        </View>
        <View style={styles.headerActions}>
          {onAdmin && (
            <TouchableOpacity onPress={onAdmin} style={styles.adminBtn}>
              <Text style={styles.adminText}>Admin</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A68B5B" />}>
        <View style={styles.metricsGrid}>
          <MetricCard label="In Store Now" value={totalCurrent} />
          <MetricCard label="Entries Today" value={totalIn} />
          <MetricCard label="Exits Today" value={totalOut} />
          <MetricCard label="Cameras Live" value={camsOnline} />
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>HOURLY FOOTFALL</Text>
          <View style={styles.barChart}>
            {hours.filter((_, i) => i % 2 === 0).map(h => {
              const val = hourlyByHour[h] || 0;
              const pct = val / maxEntries;
              return (
                <View key={h} style={styles.barCol}>
                  <View style={[styles.bar, { height: Math.max(pct * 100, 2) }]} />
                  <Text style={styles.barLabel}>{h}</Text>
                </View>
              );
            })}
          </View>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>LIVE CAMERAS</Text>
          {live?.cameras?.length ? live.cameras.map(cam => (
            <View key={cam._id} style={styles.camRow}>
              <View style={styles.camLeft}>
                <View style={styles.camDot} />
                <Text style={styles.camName}>{cam._id}</Text>
              </View>
              <View style={styles.camStats}>
                <StatPill label="IN" value={cam.total_in || 0} />
                <StatPill label="OUT" value={cam.total_out || 0} />
                <StatPill label="NOW" value={cam.current || 0} />
              </View>
            </View>
          )) : <Text style={styles.empty}>No cameras reporting</Text>}
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>ZONE ACTIVITY</Text>
          {zones?.zones?.length ? (() => {
            const max = Math.max(...zones.zones.map(z => z.visits || z.count || 0), 1);
            return zones.zones.slice(0, 8).map((z, i) => {
              const val = z.visits || z.count || 0;
              return (
                <View key={i} style={styles.zoneRow}>
                  <Text style={styles.zoneName}>{z.zone || z._id?.zone || z._id}</Text>
                  <View style={styles.zoneBarWrap}>
                    <View style={[styles.zoneBar, { width: `${(val / max) * 100}%` }]} />
                  </View>
                  <Text style={styles.zoneCount}>{val}</Text>
                </View>
              );
            });
          })() : <Text style={styles.empty}>No zone data yet</Text>}
        </View>
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function MetricCard({ label, value }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function StatPill({ label, value }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillLabel}>{label}</Text>
      <Text style={styles.pillValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: "#F5F5F7" },
  header:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 24, paddingTop: 60, backgroundColor: "rgba(255,255,255,0.9)", borderBottomWidth: 1, borderColor: "rgba(0,0,0,0.05)" },
  storeName:   { fontSize: 22, fontWeight: "800", color: "#1D1D1F", letterSpacing: -0.5 },
  lastUpdated: { fontSize: 12, color: "#86868B", marginTop: 4, fontWeight: "500" },
  headerActions: { flexDirection: "row", gap: 8 },
  adminBtn:    { backgroundColor: "rgba(166,139,91,0.15)", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  adminText:   { color: "#A68B5B", fontSize: 13, fontWeight: "600" },
  logoutBtn:   { backgroundColor: "#F5F5F7", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  logoutText:  { color: "#1D1D1F", fontSize: 13, fontWeight: "600" },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", padding: 16, gap: 12 },
  metricCard:  { backgroundColor: "#FFFFFF", borderRadius: 20, padding: 20, width: (width - 44) / 2, shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.06, shadowRadius: 20, elevation: 4 },
  metricLabel: { fontSize: 11, color: "#86868B", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12, fontWeight: "600" },
  metricValue: { fontSize: 36, fontWeight: "800", color: "#1D1D1F", letterSpacing: -1 },
  card:        { backgroundColor: "#FFFFFF", borderRadius: 24, margin: 16, marginTop: 4, padding: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.05, shadowRadius: 24, elevation: 5 },
  cardTitle:   { fontSize: 12, color: "#1D1D1F", letterSpacing: 1.5, marginBottom: 20, textTransform: "uppercase", fontWeight: "700" },
  barChart:    { flexDirection: "row", alignItems: "flex-end", height: 130, gap: 6 },
  barCol:      { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  bar:         { width: "100%", backgroundColor: "#A68B5B", borderRadius: 4 },
  barLabel:    { fontSize: 9, color: "#86868B", marginTop: 8, fontWeight: "600" },
  camRow:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderColor: "rgba(0,0,0,0.03)" },
  camLeft:     { flexDirection: "row", alignItems: "center", gap: 10 },
  camDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: "#34C759", shadowColor: "#34C759", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 4 },
  camName:     { color: "#1D1D1F", fontSize: 14, fontWeight: "600" },
  camStats:    { flexDirection: "row", gap: 12 },
  pill:        { alignItems: "center", backgroundColor: "#F5F5F7", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  pillLabel:   { fontSize: 9, color: "#86868B", letterSpacing: 0.5, fontWeight: "600" },
  pillValue:   { fontSize: 15, fontWeight: "800", color: "#1D1D1F" },
  zoneRow:     { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  zoneName:    { fontSize: 13, color: "#1D1D1F", width: 90, fontWeight: "600" },
  zoneBarWrap: { flex: 1, height: 6, backgroundColor: "#F5F5F7", borderRadius: 3, overflow: "hidden" },
  zoneBar:     { height: 6, backgroundColor: "#A68B5B", borderRadius: 3 },
  zoneCount:   { fontSize: 14, color: "#1D1D1F", fontWeight: "800", width: 36, textAlign: "right" },
  empty:       { color: "#86868B", fontSize: 14, textAlign: "center", paddingVertical: 24, fontWeight: "500" },
});
