import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Dimensions, ActivityIndicator, RefreshControl
} from "react-native";
import { BarChart } from "react-native-chart-kit";
import { fetchRetailFootfall, fetchRetailFootfallHistory } from "../services/api";

const { width } = Dimensions.get("window");

export default function FootfallScreen({ store }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [footfallData, setFootfallData] = useState(null);
  const [historyData, setHistoryData] = useState(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [foot, hist] = await Promise.all([
        fetchRetailFootfall(store.store_id, store.password),
        fetchRetailFootfallHistory(store.store_id, store.password)
      ]);

      setFootfallData(foot);
      setHistoryData(hist);
    } catch (e) {
      console.log("Footfall telemetry error:", e.message);
      setError("Could not load — pull to refresh");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [store]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) return (
    <ActivityIndicator size="large" color="#1A3C5E" style={styles.loader} />
  );

  const totalToday = footfallData?.today_total ?? 0;
  const peakHour = footfallData?.peak_hour ?? "N/A";
  const avgDwell = footfallData?.avg_dwell_minutes ?? 14.5;

  const isTodayEmpty = totalToday === 0 && (!footfallData?.by_hour || footfallData.by_hour.every(h => h.in === 0));

  // Hourly chart configuration
  const getChartData = () => {
    if (!footfallData || !footfallData.by_hour) {
      return { labels: ["N/A"], datasets: [{ data: [0] }] };
    }
    
    // We can group 24 hours into 6 buckets of 4 hours to fit beautifully on phone screens
    const buckets = ["12-4A", "4-8A", "8-12P", "12-4P", "4-8P", "8-12A"];
    const bucketData = [0, 0, 0, 0, 0, 0];

    footfallData.by_hour.forEach(item => {
      const h = item.hour;
      const idx = Math.floor(h / 4);
      if (idx >= 0 && idx < 6) {
        bucketData[idx] += item.in;
      }
    });

    return {
      labels: buckets,
      datasets: [{ data: bucketData }]
    };
  };

  // Slice history for the last 7 days trend
  const trendList = historyData?.daily ? historyData.daily.slice(-7).reverse() : [];
  const maxTrendVal = Math.max(...trendList.map(t => t.visitors), 1);

  const cData = getChartData();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A3C5E" />
      }
    >
      {isTodayEmpty ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyTitle}>Quiet Day So Far</Text>
          <Text style={styles.emptySub}>No visitor data yet for today. Keep an eye out as customers drop in!</Text>
        </View>
      ) : (
        <View style={styles.dashboard}>
          
          {/* 3 Stat Boxes Row */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>VISITS TODAY</Text>
              <Text style={styles.statVal}>{totalToday}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>PEAK HOUR</Text>
              <Text style={[styles.statVal, styles.statHourText]} numberOfLines={1}>
                {peakHour.split(" – ")[0]}
              </Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>AVG DWELL</Text>
              <Text style={styles.statVal}>{avgDwell}m</Text>
            </View>
          </View>

          {/* Hourly Breakdown Chart */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>👥 Today's Hourly Breakdown</Text>
            <BarChart
              data={cData}
              width={width - 48}
              height={180}
              yAxisLabel=""
              yAxisSuffix=""
              chartConfig={{
                backgroundGradientFrom: "#FFFFFF",
                backgroundGradientTo: "#FFFFFF",
                decimalPlaces: 0,
                color: (opacity = 1) => `rgba(26, 60, 94, ${opacity})`,
                labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
                style: { borderRadius: 12 },
                propsForBackgroundLines: { strokeDasharray: "" },
              }}
              style={styles.chart}
            />
          </View>

          {/* 7-Day Trend List */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📅 Recent 7-Day Trend</Text>
            {trendList.length > 0 ? (
              trendList.map((item, idx) => {
                const percentage = (item.visitors / maxTrendVal) * 100;
                const formattedDate = new Date(item.date).toLocaleDateString("en-IN", {
                  weekday: "short",
                  month: "short",
                  day: "numeric"
                });
                return (
                  <View key={idx} style={styles.trendRow}>
                    <Text style={styles.trendDate}>{formattedDate}</Text>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${percentage}%` }]} />
                    </View>
                    <Text style={styles.trendCount}>{item.visitors}</Text>
                  </View>
                );
              })
            ) : (
              <Text style={styles.emptyText}>No historical logs recorded yet.</Text>
            )}
          </View>

        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  contentContainer: { padding: 16, paddingBottom: 32 },
  loader: { marginTop: 40 },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 32,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    marginTop: 40,
  },
  emptyIcon: { fontSize: 40, marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#1D1D1F", marginBottom: 6 },
  emptySub: { fontSize: 13, color: "#6B7280", textAlign: "center" },
  dashboard: { flexDirection: "column", gap: 16 },
  statsRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  statBox: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  statLabel: { fontSize: 9, fontWeight: "700", color: "#9CA3AF", letterSpacing: 1, marginBottom: 6 },
  statVal: { fontSize: 20, fontWeight: "800", color: "#1A3C5E" },
  statHourText: { fontSize: 14, fontWeight: "700" },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: { fontSize: 15, fontWeight: "600", color: "#1A3C5E", marginBottom: 16 },
  chart: { marginVertical: 8, borderRadius: 12 },
  trendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 8,
  },
  trendDate: { fontSize: 13, color: "#4B5563", width: 90 },
  barTrack: {
    flex: 1,
    height: 10,
    backgroundColor: "#F3F4F6",
    borderRadius: 5,
    marginHorizontal: 12,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    backgroundColor: "#1A3C5E", // Navy primary color
    borderRadius: 5,
  },
  trendCount: { fontSize: 13, fontWeight: "700", color: "#1D1D1F", width: 35, textAlign: "right" },
  emptyText: { fontSize: 13, color: "#9CA3AF", textAlign: "center", paddingVertical: 12 },
});
