import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl
} from "react-native";
import { fetchDeadtime, fetchBottleneck, fetchPatterns } from "../services/api";

const fmtNum = (n) => n?.toLocaleString('en-IN') ?? '—';
const fmtRs = (n) => n != null ? `₹${fmtNum(Math.round(n))}` : '—';
const fmtHrs = (n) => n != null ? `${parseFloat(n).toFixed(1)} hrs` : '—';

export default function FactoryDataScreen({ store }) {
  const [rangeDays, setRangeDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Telemetry data states
  const [deadtimeData, setDeadtimeData] = useState(null);
  const [bottleneckData, setBottleneckData] = useState(null);
  const [patternsData, setPatternsData] = useState(null);

  // Detection health warning
  const [showDetectionWarning, setShowDetectionWarning] = useState(false);

  // Accordion open states
  const [expanded, setExpanded] = useState({ deadtime: false, bottleneck: false, patterns: false });

  const toggleExpand = (card) => {
    setExpanded(prev => ({ ...prev, [card]: !prev[card] }));
  };

  const loadData = useCallback(async (currentRange) => {
    setLoading(true);
    setError(null);

    // Calculate start date
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - currentRange);

    try {
      const [dead, bottle, patt] = await Promise.all([
        fetchDeadtime(store.store_id, store.password, from.toISOString(), to.toISOString()),
        fetchBottleneck(store.store_id, store.password),
        fetchPatterns(store.store_id, store.password)
      ]);

      setDeadtimeData(dead);
      setBottleneckData(bottle);
      setPatternsData(patt);

      // Detection health check: if productive hours is 0 during business hours, warn
      const now = new Date();
      const hourNow = now.getHours();
      const isShiftHours = hourNow >= 6 && hourNow <= 22; // 6AM–10PM
      const productiveHours = dead?.summary?.productive_hours_total;
      if (isShiftHours && (productiveHours === 0 || productiveHours === undefined || productiveHours === null)) {
        setShowDetectionWarning(true);
      } else {
        setShowDetectionWarning(false);
      }
    } catch (e) {
      console.log("Telemetry fetch error:", e.message);
      setError("Could not load — pull to refresh");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [store]);

  useEffect(() => { loadData(rangeDays); }, [rangeDays, loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData(rangeDays);
  };

  // Learning phase calculations
  const daysSinceCreation = store.created_at
    ? (new Date() - new Date(store.created_at)) / (1000 * 60 * 60 * 24)
    : 0;
  const isLearningPatterns = daysSinceCreation < 7;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A3C5E" />
      }
    >
      {/* Date Range Picker */}
      <View style={styles.pickerRow}>
        {[7, 14, 30].map(days => (
          <TouchableOpacity
            key={days}
            style={[styles.pickerBtn, rangeDays === days && styles.pickerBtnActive]}
            onPress={() => setRangeDays(days)}
          >
            <Text style={[styles.pickerBtnText, rangeDays === days && styles.pickerBtnTextActive]}>
              {days} Days
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1A3C5E" style={styles.loader} />
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <View style={styles.cardsStack}>

          {/* Detection Warning Banner */}
          {showDetectionWarning && (
            <View style={styles.detectionWarningBanner}>
              <Text style={styles.detectionWarningText}>
                ⚠️ Camera detection may not be working correctly.{"\n"}Contact support: support@skymlabs.com
              </Text>
            </View>
          )}
          
          {/* DEAD TIME CARD */}
          <TouchableOpacity style={styles.card} onPress={() => toggleExpand("deadtime")} activeOpacity={0.95}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>📊 Dead Time Analytics</Text>
              <Text style={styles.expandArrow}>{expanded.deadtime ? "▲" : "▼"}</Text>
            </View>
            <View style={styles.metricsSummaryGrid}>
              <View style={styles.metricSummaryCol}>
                <Text style={styles.metricLabel}>PAID HRS</Text>
                <Text style={styles.metricVal}>{fmtHrs(deadtimeData?.summary?.expected_hours_total)}</Text>
              </View>
              <View style={styles.metricSummaryCol}>
                <Text style={styles.metricLabel}>PROD HRS</Text>
                <Text style={styles.metricVal}>{fmtHrs(deadtimeData?.summary?.productive_hours_total)}</Text>
              </View>
              <View style={styles.metricSummaryCol}>
                <Text style={styles.metricLabel}>DEAD HRS</Text>
                <Text style={styles.metricVal}>{fmtHrs(deadtimeData?.summary?.dead_hours_total)}</Text>
              </View>
              <View style={styles.metricSummaryCol}>
                <Text style={styles.metricLabel}>COST IMPACT</Text>
                <Text style={[styles.metricVal, styles.redText]}>{fmtRs(deadtimeData?.summary?.dead_cost_inr)}</Text>
              </View>
            </View>

            {expanded.deadtime && (
              <View style={styles.expandContent}>
                <Text style={styles.expandedSecHeader}>ZONE BREAKDOWN</Text>
                {deadtimeData?.by_zone && deadtimeData.by_zone.length > 0 ? (
                  deadtimeData.by_zone.map((item, idx) => {
                    const isWorst = item.zone_label === deadtimeData.worst_zone;
                    return (
                      <View key={idx} style={[styles.breakdownRow, isWorst && styles.worstZoneRow]}>
                        <View>
                          <Text style={[styles.breakdownName, isWorst && styles.worstZoneName]}>
                            {item.zone_label} {isWorst && "⚠️ (Worst)"}
                          </Text>
                          <Text style={styles.breakdownSub}>Dead hours: {fmtHrs(item.dead_hours)}</Text>
                        </View>
                        <Text style={[styles.breakdownCost, styles.redText, isWorst && styles.worstZoneCost]}>
                          {fmtRs(item.dead_cost_inr)}
                        </Text>
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.emptyText}>Dead time data appears after your first full shift is recorded</Text>
                )}
              </View>
            )}
          </TouchableOpacity>

          {/* BOTTLENECK CARD */}
          <TouchableOpacity style={styles.card} onPress={() => toggleExpand("bottleneck")} activeOpacity={0.95}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>🔥 Bottleneck Cascades</Text>
              <Text style={styles.expandArrow}>{expanded.bottleneck ? "▲" : "▼"}</Text>
            </View>

            {bottleneckData?.cached === false ? (
              <View style={styles.emptyCacheContainer}>
                <Text style={styles.learningSub}>Bottleneck data available after Day 2</Text>
              </View>
            ) : (
              <>
                <View style={styles.metricsSummaryGrid}>
                  <View style={[styles.metricSummaryCol, { flex: 2 }]}>
                    <Text style={styles.metricLabel}>TOP CRITICAL STATION</Text>
                    <Text style={styles.metricVal} numberOfLines={1}>
                      {bottleneckData?.ranked_stations?.[0]?.zone_label || "None"}
                    </Text>
                  </View>
                  <View style={styles.metricSummaryCol}>
                    <Text style={styles.metricLabel}>STALL EVENTS</Text>
                    <Text style={styles.metricVal}>{bottleneckData?.ranked_stations?.[0]?.event_count || 0}</Text>
                  </View>
                  <View style={styles.metricSummaryCol}>
                    <Text style={styles.metricLabel}>LOSS COST</Text>
                    <Text style={[styles.metricVal, styles.redText]}>
                      {fmtRs(bottleneckData?.ranked_stations?.[0]?.total_cost_inr)}
                    </Text>
                  </View>
                  <View style={styles.metricSummaryCol}>
                    <Text style={styles.metricLabel}>GAIN %</Text>
                    <Text style={[styles.metricVal, styles.greenText]}>
                      +{bottleneckData?.ranked_stations?.[0]?.projected_gain_pct?.toFixed(1) || "0.0"}%
                    </Text>
                  </View>
                </View>

                {expanded.bottleneck && (
                  <View style={styles.expandContent}>
                    <Text style={styles.expandedSecHeader}>RANKED BOTTLENECK STATIONS</Text>
                    {bottleneckData?.ranked_stations && bottleneckData.ranked_stations.length > 0 ? (
                      bottleneckData.ranked_stations.map((item, idx) => (
                        <View key={idx} style={styles.breakdownRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.breakdownName}>#{idx + 1} {item.zone_label}</Text>
                            <Text style={styles.breakdownSub}>
                              Events: {item.event_count} | Cascade: {fmtHrs(item.total_cascade_idle_hours)}
                            </Text>
                          </View>
                          <View style={{ alignItems: "flex-end" }}>
                            <Text style={[styles.breakdownCost, styles.redText]}>{fmtRs(item.total_cost_inr)}</Text>
                            <Text style={[styles.gainText, styles.greenText]}>+{item.projected_gain_pct?.toFixed(1)}%</Text>
                          </View>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.emptyText}>Bottleneck data available after Day 2</Text>
                    )}
                  </View>
                )}
              </>
            )}
          </TouchableOpacity>

          {/* PATTERN CARD */}
          <TouchableOpacity style={styles.card} onPress={() => toggleExpand("patterns")} activeOpacity={0.95}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>⏰ Recurrent Loss Patterns</Text>
              <Text style={styles.expandArrow}>{expanded.patterns ? "▲" : "▼"}</Text>
            </View>

            {isLearningPatterns ? (
              <View style={styles.emptyCacheContainer}>
                <Text style={styles.learningSub}>Pattern data available after Day 7</Text>
              </View>
            ) : (
              <>
                <View style={styles.metricsSummaryGrid}>
                  <View style={[styles.metricSummaryCol, { flex: 2 }]}>
                    <Text style={styles.metricLabel}>WORST RECURRENCE ZONE</Text>
                    <Text style={styles.metricVal} numberOfLines={1}>
                      {patternsData?.patterns?.[0]?.zone_label || "None"}
                    </Text>
                  </View>
                  <View style={styles.metricSummaryCol}>
                    <Text style={styles.metricLabel}>TIME SLOT</Text>
                    <Text style={styles.metricVal}>{patternsData?.patterns?.[0]?.hour_label || "None"}</Text>
                  </View>
                  <View style={styles.metricSummaryCol}>
                    <Text style={styles.metricLabel}>RECURRENCE</Text>
                    <Text style={styles.metricVal}>{patternsData?.patterns?.[0]?.recurrence_count || 0}/30 Days</Text>
                  </View>
                  <View style={styles.metricSummaryCol}>
                    <Text style={styles.metricLabel}>EST. MONTHLY LOSS</Text>
                    <Text style={[styles.metricVal, styles.redText]}>
                      {fmtRs(patternsData?.patterns?.[0]?.monthly_cost_inr)}
                    </Text>
                  </View>
                </View>

                {expanded.patterns && (
                  <View style={styles.expandContent}>
                    <Text style={styles.expandedSecHeader}>ACTIVE LOSS PATTERNS</Text>
                    {patternsData?.patterns && patternsData.patterns.length > 0 ? (
                      patternsData.patterns.map((item, idx) => (
                        <View key={idx} style={styles.breakdownRow}>
                          <View>
                            <Text style={styles.breakdownName}>{item.zone_label}</Text>
                            <Text style={styles.breakdownSub}>
                              Slot: {item.hour_label} | Recurrence: {item.recurrence_count}/30 days
                            </Text>
                          </View>
                          <Text style={[styles.breakdownCost, styles.redText]}>
                            {fmtRs(item.monthly_cost_inr)}/mo
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.emptyText}>Pattern data available after Day 7</Text>
                    )}
                  </View>
                )}
              </>
            )}
          </TouchableOpacity>

        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  contentContainer: { padding: 16, paddingBottom: 32 },
  pickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 4,
    marginBottom: 16,
  },
  pickerBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 8 },
  pickerBtnActive: { backgroundColor: "#1A3C5E" },
  pickerBtnText: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  pickerBtnTextActive: { color: "#FFFFFF" },
  loader: { marginTop: 40 },
  errorContainer: { padding: 24, alignItems: "center" },
  errorText: { color: "#DC2626", fontWeight: "600", fontSize: 15 },
  cardsStack: { flexDirection: "column", gap: 16 },
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
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: "#F3F4F6",
    paddingBottom: 12,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#1A3C5E" },
  expandArrow: { fontSize: 12, color: "#9CA3AF" },
  metricsSummaryGrid: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap" },
  metricSummaryCol: { flex: 1, minWidth: "22%", padding: 4 },
  metricLabel: { fontSize: 9, color: "#9CA3AF", fontWeight: "700", marginBottom: 4 },
  metricVal: { fontSize: 14, fontWeight: "700", color: "#1D1D1F" },
  redText: { color: "#DC2626" },
  greenText: { color: "#16A34A" },
  expandContent: {
    borderTopWidth: 1,
    borderColor: "#F3F4F6",
    marginTop: 16,
    paddingTop: 16,
  },
  expandedSecHeader: { fontSize: 10, color: "#9CA3AF", fontWeight: "800", marginBottom: 12, letterSpacing: 0.5 },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  breakdownName: { fontSize: 14, fontWeight: "600", color: "#1D1D1F" },
  breakdownSub: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  breakdownCost: { fontSize: 14, fontWeight: "700" },
  gainText: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  worstZoneRow: { backgroundColor: "#FEE2E2", borderRadius: 8, paddingHorizontal: 8, borderColor: "#FCA5A5", borderWidth: 1 },
  worstZoneName: { color: "#991B1B", fontWeight: "700" },
  worstZoneCost: { color: "#991B1B" },
  emptyText: { fontSize: 13, color: "#9CA3AF", textAlign: "center", paddingVertical: 12 },
  emptyCacheContainer: { padding: 12, alignItems: "center" },
  learningSub: { fontSize: 13, color: "#9CA3AF", fontStyle: "italic", textAlign: "center" },
  detectionWarningBanner: {
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#F59E0B",
    borderRadius: 10,
    padding: 14,
    marginBottom: 4,
  },
  detectionWarningText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#92400E",
    textAlign: "center",
    lineHeight: 20,
  },
});
