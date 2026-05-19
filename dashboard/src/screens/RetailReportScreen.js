import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Share
} from "react-native";
import { fetchRetailReport } from "../services/api";

export default function RetailReportScreen({ store }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [reportData, setReportData] = useState(null);

  const loadReport = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchRetailReport(store.store_id, store.password);
      setReportData(res);
    } catch (e) {
      console.log("Retail report fetch error:", e.message);
      setError("Could not load — pull to refresh");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [store]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const onRefresh = () => {
    setRefreshing(true);
    loadReport();
  };

  const handleRegenerate = () => {
    setLoading(true);
    loadReport();
  };

  const narrativeText = reportData?.narrative || "";
  const hasData = narrativeText && narrativeText !== "Not enough data yet. First report arrives on Day 7.";

  const handleShare = async () => {
    try {
      await Share.share({
        message: `RETAIL VISITOR ANALYTICS REPORT\nStore: ${store.store_name}\nGenerated: ${new Date().toLocaleDateString()}\n\n${narrativeText}`,
        title: "Retail Footfall AI Report"
      });
    } catch (e) {
      console.log("Share failed:", e.message);
    }
  };

  // Empty state check
  const daysSinceCreation = store.created_at
    ? (new Date() - new Date(store.created_at)) / (1000 * 60 * 60 * 24)
    : 0;
  const isLearningPhase = daysSinceCreation < 7 || !hasData;

  return (
    <View style={styles.container}>
      {/* Header with Regenerate */}
      <View style={styles.header}>
        <Text style={styles.title}>✦ AI Executive Report</Text>
        {hasData && (
          <TouchableOpacity style={styles.regenBtn} onPress={handleRegenerate} disabled={loading || refreshing}>
            <Text style={styles.regenBtnText}>Regenerate</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1A3C5E" style={styles.loader} />
      ) : error ? (
        <ScrollView
          contentContainerStyle={styles.center}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A3C5E" />}
        >
          <Text style={styles.errorText}>{error}</Text>
        </ScrollView>
      ) : isLearningPhase ? (
        <ScrollView
          contentContainerStyle={styles.center}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A3C5E" />}
        >
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>⏳</Text>
            <Text style={styles.emptyTitle}>Assembling Insights</Text>
            <Text style={styles.emptySub}>Not enough data yet. First report arrives on Day 7.</Text>
          </View>
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A3C5E" />}
          >
            <View style={styles.reportCard}>
              <Text style={styles.sectionHeader}>📈 WEEKLY FOOTFALL INSIGHTS</Text>
              <Text style={styles.bodyText}>{narrativeText}</Text>
            </View>

            <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
              <Text style={styles.shareBtnText}>Share Executive Summary</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  title: { fontSize: 18, fontWeight: "600", color: "#1A3C5E" },
  regenBtn: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  regenBtnText: { fontSize: 12, fontWeight: "600", color: "#1A3C5E" },
  loader: { marginTop: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  errorText: { color: "#DC2626", fontWeight: "600", fontSize: 15 },
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
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  reportCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 20,
  },
  sectionHeader: { fontSize: 12, fontWeight: "800", color: "#1A3C5E", marginBottom: 12, letterSpacing: 0.5 },
  bodyText: { fontSize: 14, color: "#374151", lineHeight: 22 },
  shareBtn: {
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
  shareBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
});
