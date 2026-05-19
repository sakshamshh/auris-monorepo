import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Dimensions, Clipboard, Alert, ActivityIndicator, RefreshControl
} from "react-native";
import { fetchRetailFootfallHistory } from "../services/api";

const { width } = Dimensions.get("window");

export default function HistoryScreen({ store }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [historyData, setHistoryData] = useState(null);

  const loadHistory = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchRetailFootfallHistory(store.store_id, store.password);
      setHistoryData(res);
    } catch (e) {
      console.log("Failed to load footfall history:", e.message);
      setError("Could not load — pull to refresh");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [store]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const onRefresh = () => {
    setRefreshing(true);
    loadHistory();
  };

  const isToday = (dateStr) => {
    const todayStr = new Date().toISOString().split("T")[0];
    return dateStr === todayStr;
  };

  const isWeekend = (dateStr) => {
    const d = new Date(dateStr);
    const day = d.getDay();
    return day === 0 || day === 6; // Sunday = 0, Saturday = 6
  };

  const getBarColor = (dateStr) => {
    if (isToday(dateStr)) return "#1A3C5E";  // navy for today
    if (isWeekend(dateStr)) return "#2563EB"; // blue for weekends
    return "#9CA3AF";                         // gray for weekdays
  };

  const getCSVData = () => {
    if (!historyData || !historyData.daily) return "";
    let csv = "Date,Visitors\n";
    historyData.daily.forEach(item => {
      csv += `${item.date},${item.visitors}\n`;
    });
    return csv;
  };

  const handleDownloadCSV = () => {
    const csv = getCSVData();
    if (!csv) {
      Alert.alert("No Data", "No history data available to copy.");
      return;
    }
    Clipboard.setString(csv);
    Alert.alert("Copied to Clipboard", "Footfall history CSV copied successfully!");
  };

  if (loading) return (
    <ActivityIndicator size="large" color="#1A3C5E" style={styles.loader} />
  );

  const dailyRecords = historyData?.daily ? [...historyData.daily].reverse() : [];
  const maxVal = Math.max(...dailyRecords.map(r => r.visitors), 1);
  const total = historyData?.total_30_days ?? 0;
  
  const bestDayDate = historyData?.best_day?.date && historyData.best_day.date !== "N/A"
    ? new Date(historyData.best_day.date).toLocaleDateString("en-IN", { month: "short", day: "numeric" })
    : "N/A";
  const bestDayCount = historyData?.best_day?.count ?? 0;

  const worstDayDate = historyData?.worst_day?.date && historyData.worst_day.date !== "N/A"
    ? new Date(historyData.worst_day.date).toLocaleDateString("en-IN", { month: "short", day: "numeric" })
    : "N/A";
  const worstDayCount = historyData?.worst_day?.count ?? 0;

  const isEmpty = dailyRecords.length === 0;

  return (
    <View style={styles.container}>
      {isEmpty ? (
        <ScrollView
          contentContainerStyle={styles.center}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A3C5E" />}
        >
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>⏳</Text>
            <Text style={styles.emptyTitle}>Building Footprint Log</Text>
            <Text style={styles.emptySub}>No history available yet. Check back tomorrow.</Text>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={dailyRecords}
          keyExtractor={(item) => item.date}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A3C5E" />
          }
          ListHeaderComponent={
            <>
              {/* Summary Stats Row */}
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>📅 30-Day Footfall Summary</Text>
                <View style={styles.summaryGrid}>
                  <View style={styles.summaryCol}>
                    <Text style={styles.summaryLabel}>TOTAL VISITS</Text>
                    <Text style={styles.summaryVal}>{total}</Text>
                  </View>
                  <View style={styles.summaryCol}>
                    <Text style={styles.summaryLabel}>BEST DAY</Text>
                    <Text style={styles.summaryVal}>{bestDayCount}</Text>
                    <Text style={styles.summarySub}>{bestDayDate}</Text>
                  </View>
                  <View style={styles.summaryCol}>
                    <Text style={styles.summaryLabel}>WORST DAY</Text>
                    <Text style={styles.summaryVal}>{worstDayCount}</Text>
                    <Text style={styles.summarySub}>{worstDayDate}</Text>
                  </View>
                </View>
              </View>

              {/* Legend explanation */}
              <View style={styles.legendContainer}>
                <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: "#1A3C5E" }]} /><Text style={styles.legendLabel}>Today</Text></View>
                <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: "#2563EB" }]} /><Text style={styles.legendLabel}>Weekend</Text></View>
                <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: "#9CA3AF" }]} /><Text style={styles.legendLabel}>Weekday</Text></View>
              </View>
            </>
          }
          renderItem={({ item }) => {
            const percentage = (item.visitors / maxVal) * 100;
            const barColor = getBarColor(item.date);
            const formattedDate = new Date(item.date).toLocaleDateString("en-IN", {
              weekday: "short",
              month: "short",
              day: "numeric"
            });

            return (
              <View style={styles.row}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowDate}>{formattedDate}</Text>
                  {isToday(item.date) && <Text style={styles.todayTag}>TODAY</Text>}
                </View>
                <View style={styles.barContainer}>
                  <View style={[styles.barFill, { width: `${percentage}%`, backgroundColor: barColor }]} />
                </View>
                <Text style={styles.rowCount}>{item.visitors}</Text>
              </View>
            );
          }}
          ListFooterComponent={
            <TouchableOpacity style={styles.downloadBtn} onPress={handleDownloadCSV}>
              <Text style={styles.downloadBtnText}>Download CSV Data</Text>
            </TouchableOpacity>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  loader: { marginTop: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    width: "100%",
  },
  emptyIcon: { fontSize: 40, marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#1D1D1F", marginBottom: 6 },
  emptySub: { fontSize: 13, color: "#6B7280", textAlign: "center" },
  listContent: { padding: 16, paddingBottom: 32 },
  summaryCard: {
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
    marginBottom: 16,
  },
  summaryTitle: { fontSize: 15, fontWeight: "600", color: "#1A3C5E", marginBottom: 16 },
  summaryGrid: { flexDirection: "row", justifyContent: "space-between" },
  summaryCol: { flex: 1, alignItems: "center" },
  summaryLabel: { fontSize: 9, fontWeight: "700", color: "#9CA3AF", letterSpacing: 1, marginBottom: 6 },
  summaryVal: { fontSize: 20, fontWeight: "800", color: "#1D1D1F" },
  summarySub: { fontSize: 11, color: "#6B7280", marginTop: 2 },
  legendContainer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginBottom: 16,
    paddingRight: 4,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11, color: "#6B7280", fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  rowInfo: { width: 100, flexDirection: "column" },
  rowDate: { fontSize: 13, color: "#4B5563", fontWeight: "600" },
  todayTag: {
    fontSize: 9,
    fontWeight: "800",
    color: "#1A3C5E",
    marginTop: 2,
    alignSelf: "flex-start",
  },
  barContainer: {
    flex: 1,
    height: 10,
    backgroundColor: "#F3F4F6",
    borderRadius: 5,
    marginHorizontal: 12,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 5 },
  rowCount: { fontSize: 14, fontWeight: "700", color: "#1D1D1F", width: 40, textAlign: "right" },
  downloadBtn: {
    backgroundColor: "#1A3C5E",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  downloadBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
});
