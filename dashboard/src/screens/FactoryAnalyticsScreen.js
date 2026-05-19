import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, Dimensions, Clipboard, Alert, ActivityIndicator
} from "react-native";
import { BarChart } from "react-native-chart-kit";
import { fetchDeadtime, fetchPatterns } from "../services/api";

const { width } = Dimensions.get("window");

export default function FactoryAnalyticsScreen({ store }) {
  const [selectedZone, setSelectedZone] = useState("all");
  const [selectedShift, setSelectedShift] = useState("all");
  const [loading, setLoading] = useState(true);
  const [deadtimeData, setDeadtimeData] = useState(null);
  
  // Custom mock data for occupancy grid and timeline to enrich the view
  const occupancyGrid = [
    { hr: 0, pct: 15 }, { hr: 1, pct: 10 }, { hr: 2, pct: 8 }, { hr: 3, pct: 12 },
    { hr: 4, pct: 45 }, { hr: 5, pct: 55 }, { hr: 6, pct: 82 }, { hr: 7, pct: 88 },
    { hr: 8, pct: 92 }, { hr: 9, pct: 95 }, { hr: 10, pct: 90 }, { hr: 11, pct: 84 },
    { hr: 12, pct: 72 }, { hr: 13, pct: 78 }, { hr: 14, pct: 85 }, { hr: 15, pct: 88 },
    { hr: 16, pct: 91 }, { hr: 17, pct: 83 }, { hr: 18, pct: 74 }, { hr: 19, pct: 62 },
    { hr: 20, pct: 48 }, { hr: 21, pct: 32 }, { hr: 22, pct: 24 }, { hr: 23, pct: 18 },
  ];

  const timelineDays = [
    { day: "May 19", events: 3 },
    { day: "May 18", events: 5 },
    { day: "May 17", events: 2 },
    { day: "May 16", events: 4 },
    { day: "May 15", events: 1 },
    { day: "May 14", events: 0 },
    { day: "May 13", events: 6 },
  ];

  // Load zones dynamically from store configuration
  const zonesList = store.zone_config && Object.keys(store.zone_config).length > 0
    ? ["all", ...Object.keys(store.zone_config)]
    : ["all", "Assembly Line A", "Packaging Zone", "Inspection Station", "Raw Storage"];

  const shiftsList = ["all", "Shift A (Day)", "Shift B (Evening)", "Shift C (Night)"];

  useEffect(() => {
    (async () => {
      try {
        const to = new Date();
        const from = new Date();
        from.setDate(to.getDate() - 30);
        const res = await fetchDeadtime(store.store_id, store.password, from.toISOString(), to.toISOString());
        setDeadtimeData(res);
      } catch (e) {
        console.log("Failed to load deadtime analytics:", e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [store]);

  // Filter dead time data for display in chart
  const getChartData = () => {
    if (!deadtimeData || !deadtimeData.by_zone) {
      return { labels: ["N/A"], datasets: [{ data: [0] }] };
    }

    let filtered = deadtimeData.by_zone;
    if (selectedZone !== "all") {
      filtered = filtered.filter(z => z.zone_label === selectedZone);
    }

    if (filtered.length === 0) {
      return { labels: ["None"], datasets: [{ data: [0] }] };
    }

    return {
      labels: filtered.map(z => z.zone_label.substring(0, 10)),
      datasets: [
        {
          data: filtered.map(z => z.dead_hours)
        }
      ]
    };
  };

  const handleDownloadCSV = () => {
    if (!deadtimeData || !deadtimeData.by_zone) {
      Alert.alert("No Data", "No analytics data available to copy.");
      return;
    }
    
    let csv = "Zone Label,Dead Hours,Productive Hours,Cost Impact (INR)\n";
    deadtimeData.by_zone.forEach(z => {
      csv += `"${z.zone_label}",${z.dead_hours.toFixed(1)},${z.productive_hours.toFixed(1)},${z.dead_cost_inr.toFixed(0)}\n`;
    });
    
    Clipboard.setString(csv);
    Alert.alert("Copied to Clipboard", "CSV data copied successfully!");
  };

  const getOccupancyColor = (pct) => {
    if (pct > 80) return "#16A34A"; // green
    if (pct >= 60) return "#CA8A04"; // amber
    return "#DC2626"; // red
  };

  const cData = getChartData();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      
      {/* Zone Picker */}
      <Text style={styles.pickerLabel}>SELECT ZONE</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalPicker}>
        {zonesList.map(zone => (
          <TouchableOpacity
            key={zone}
            style={[styles.pickerChip, selectedZone === zone && styles.pickerChipActive]}
            onPress={() => setSelectedZone(zone)}
          >
            <Text style={[styles.pickerChipText, selectedZone === zone && styles.pickerChipTextActive]}>
              {zone === "all" ? "All Zones" : zone}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Shift Picker */}
      <Text style={styles.pickerLabel}>SELECT SHIFT</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalPicker}>
        {shiftsList.map(shift => (
          <TouchableOpacity
            key={shift}
            style={[styles.pickerChip, selectedShift === shift && styles.pickerChipActive]}
            onPress={() => setSelectedShift(shift)}
          >
            <Text style={[styles.pickerChipText, selectedShift === shift && styles.pickerChipTextActive]}>
              {shift === "all" ? "All Shifts" : shift}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator size="large" color="#1A3C5E" style={styles.loader} />
      ) : (
        <View style={styles.dashboard}>
          
          {/* DEAD TIME BY ZONE */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📊 Dead Time by Zone (hrs)</Text>
            <BarChart
              data={cData}
              width={width - 48}
              height={220}
              yAxisLabel=""
              yAxisSuffix=""
              chartConfig={{
                backgroundGradientFrom: "#FFFFFF",
                backgroundGradientTo: "#FFFFFF",
                decimalPlaces: 1,
                color: (opacity = 1) => `rgba(26, 60, 94, ${opacity})`,
                labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
                style: { borderRadius: 16 },
                propsForBackgroundLines: { strokeDasharray: "" },
              }}
              style={styles.chart}
              verticalLabelRotation={20}
            />
          </View>

          {/* HOURLY OCCUPANCY PATTERN */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>⏰ Hourly Occupancy Pattern (0-23h)</Text>
            <Text style={styles.cardSubtitle}>
              Green &gt;80% | Amber 60-80% | Red &lt;60%
            </Text>
            <View style={styles.gridContainer}>
              {occupancyGrid.map(item => (
                <View key={item.hr} style={[styles.gridBox, { backgroundColor: getOccupancyColor(item.pct) }]}>
                  <Text style={styles.gridBoxHr}>{item.hr}h</Text>
                  <Text style={styles.gridBoxPct}>{item.pct}%</Text>
                </View>
              ))}
            </View>
          </View>

          {/* BOTTLENECK TIMELINE */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🔥 Bottleneck Cascade Timeline</Text>
            {timelineDays.map((item, idx) => (
              <View key={idx} style={styles.timelineRow}>
                <Text style={styles.timelineDay}>{item.day}</Text>
                <View style={styles.timelineRight}>
                  {item.events > 0 ? (
                    <View style={styles.dotsRow}>
                      {Array.from({ length: item.events }).map((_, i) => (
                        <View key={i} style={styles.redDot} />
                      ))}
                      <Text style={styles.dotsText}>{item.events} stalls</Text>
                    </View>
                  ) : (
                    <Text style={styles.noStalls}>No cascades flagged</Text>
                  )}
                </View>
              </View>
            ))}
          </View>

          {/* Download CSV button */}
          <TouchableOpacity style={styles.downloadBtn} onPress={handleDownloadCSV}>
            <Text style={styles.downloadBtnText}>Download CSV Data</Text>
          </TouchableOpacity>

        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  contentContainer: { padding: 16, paddingBottom: 32 },
  pickerLabel: { fontSize: 11, fontWeight: "700", color: "#6B7280", letterSpacing: 1, marginBottom: 8, marginTop: 12, paddingLeft: 4 },
  horizontalPicker: { flexDirection: "row", marginBottom: 12, maxHeight: 40 },
  pickerChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  pickerChipActive: { backgroundColor: "#1A3C5E", borderColor: "#1A3C5E" },
  pickerChipText: { fontSize: 13, color: "#6B7280", fontWeight: "600" },
  pickerChipTextActive: { color: "#FFFFFF" },
  loader: { marginTop: 40 },
  dashboard: { flexDirection: "column", gap: 16 },
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
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#1A3C5E", marginBottom: 4 },
  cardSubtitle: { fontSize: 12, color: "#9CA3AF", marginBottom: 16 },
  chart: { marginVertical: 8, borderRadius: 12 },
  gridContainer: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "space-between" },
  gridBox: {
    width: "23%",
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    marginBottom: 4,
  },
  gridBoxHr: { fontSize: 12, fontWeight: "700", color: "#FFFFFF" },
  gridBoxPct: { fontSize: 10, color: "rgba(255,255,255,0.85)", marginTop: 2 },
  timelineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  timelineDay: { fontSize: 14, fontWeight: "600", color: "#1D1D1F" },
  timelineRight: { alignItems: "flex-end" },
  dotsRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  redDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#DC2626" },
  dotsText: { fontSize: 12, color: "#DC2626", fontWeight: "600", marginLeft: 4 },
  noStalls: { fontSize: 12, color: "#6B7280" },
  downloadBtn: {
    backgroundColor: "#1A3C5E",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  downloadBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
});
