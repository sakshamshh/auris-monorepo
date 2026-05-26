import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Share, Platform
} from "react-native";
import { fetchDeadtime, fetchBottleneck, fetchPatterns } from "../services/api";

export default function FactoryReportScreen({ store }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const [narratives, setNarratives] = useState({ deadtime: "", bottleneck: "", patterns: "" });

  const loadReport = useCallback(async () => {
    setError(null);
    try {
      // Fetch 30-day range by default
      const to = new Date();
      const from = new Date();
      from.setDate(to.getDate() - 30);

      const [dead, bottle, patt] = await Promise.all([
        fetchDeadtime(store.store_id, store.password, from.toISOString(), to.toISOString()),
        fetchBottleneck(store.store_id, store.password),
        fetchPatterns(store.store_id, store.password)
      ]);

      setNarratives({
        deadtime: dead.narrative || "",
        bottleneck: bottle.narrative || "",
        patterns: patt.narrative || ""
      });
    } catch (e) {
      console.log("Narratives fetch error:", e.message);
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

  const handleDownloadPDF = async () => {
    setDownloading(true);
    const pdfUrl = "https://auris.skymlabs.com/api/factory/report/pdf";
    const isMobile = Platform.OS !== "web" || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
      try {
        const authedUrl = `${pdfUrl}?store_id=${encodeURIComponent(store.store_id)}&password=${encodeURIComponent(store.password)}`;
        if (typeof window !== "undefined" && window.open) {
          window.open(authedUrl, "_blank");
        } else {
          alert("Download failed. Try opening in a web browser.");
        }
      } catch (e) {
        alert("Download failed. Try again.");
      }
      setDownloading(false);
      return;
    }

    try {
      const response = await fetch(pdfUrl, {
        headers: {
          "X-Store-ID": store.store_id,
          "X-Password": store.password,
        }
      });
      if (!response.ok) throw new Error("Failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `auris_report_${store.store_id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Download failed. Try again.");
    }
    setDownloading(false);
  };

  // Compile combined narrative
  const combinedText = `
FACTORY EFFICIENCY ANALYSIS REPORT
Store: ${store.store_name}
Generated: ${new Date().toLocaleDateString()}

1. WORKSTATION DEAD TIME INSIGHTS
${narratives.deadtime || "No dead time narrative generated."}

2. BOTTLENECK CASCADE INSIGHTS
${narratives.bottleneck || "No bottleneck narrative generated."}

3. RECURRENT WASTE PATTERNS
${narratives.patterns || "No repetitive loss patterns narrative generated."}
  `.trim();

  const handleShare = async () => {
    try {
      await Share.share({
        message: combinedText,
        title: "Factory Efficiency Report"
      });
    } catch (e) {
      console.log("Share sheet failed:", e.message);
    }
  };

  const hasData = narratives.deadtime || narratives.bottleneck || narratives.patterns;

  // Empty state check
  const daysSinceCreation = store.created_at
    ? (new Date() - new Date(store.created_at)) / (1000 * 60 * 60 * 24)
    : 0;
  const isLearningPhase = daysSinceCreation < 7 || !hasData;

  return (
    <View style={styles.container}>
      {/* Header Controls */}
      <View style={styles.header}>
        <Text style={styles.title}>✦ AI Executive Report</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {hasData && (
            <TouchableOpacity style={styles.regenBtn} onPress={handleDownloadPDF} disabled={loading || refreshing || downloading}>
              <Text style={styles.regenBtnText}>{downloading ? "Downloading..." : "Download PDF"}</Text>
            </TouchableOpacity>
          )}
          {hasData && (
            <TouchableOpacity style={styles.regenBtn} onPress={handleRegenerate} disabled={loading || refreshing}>
              <Text style={styles.regenBtnText}>Regenerate</Text>
            </TouchableOpacity>
          )}
        </View>
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
            <Text style={styles.emptyTitle}>AI Report Pending</Text>
            <Text style={styles.emptySub}>Your first AI report generates after Day 7</Text>
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
              
              <Text style={styles.sectionTitle}>1. Workstation Idle Times</Text>
              <Text style={styles.bodyText}>
                {narratives.deadtime || "Analysis building. Live workstation telemetry is being aggregated daily."}
              </Text>

              <View style={styles.divider} />

              <Text style={styles.sectionTitle}>2. Bottleneck Cascades</Text>
              <Text style={styles.bodyText}>
                {narratives.bottleneck || "Stall cascade tracking in progress. Nightly runs trace cascading line delays."}
              </Text>

              <View style={styles.divider} />

              <Text style={styles.sectionTitle}>3. Repetitive Loss Patterns</Text>
              <Text style={styles.bodyText}>
                {narratives.patterns || "Loss recurrence flagging. High-frequency waste patterns appear after 7 days."}
              </Text>

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
  sectionTitle: { fontSize: 15, fontWeight: "600", color: "#1A3C5E", marginBottom: 8 },
  bodyText: { fontSize: 14, color: "#374151", lineHeight: 22 },
  divider: { height: 1, backgroundColor: "#E5E7EB", my: 16, marginVertical: 16 },
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
