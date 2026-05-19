import React, { useState, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Image, ActivityIndicator, Alert,
} from "react-native";
import { fetchHardCases, reviewHardCase, fetchTrainingStats } from "../services/api";

export default function TrainingReviewScreen({ adminKey }) {
  const [cases, setCases] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [storeFilter, setStoreFilter] = useState("");

  const load = async () => {
    if (!adminKey) return;
    setLoading(true);
    try {
      const [c, s] = await Promise.all([
        fetchHardCases(adminKey, storeFilter || undefined),
        fetchTrainingStats(adminKey),
      ]);
      setCases(c.cases || []);
      setStats(s);
    } catch (e) {
      Alert.alert("Error", "Failed to load training queue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [adminKey, storeFilter]);

  const handleReview = async (caseId, action) => {
    try {
      await reviewHardCase(adminKey, caseId, action);
      await load();
    } catch (e) {
      Alert.alert("Error", "Review failed");
    }
  };

  if (!adminKey) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Admin key required</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Training Review</Text>
      {stats && (
        <Text style={styles.stats}>
          Pending: {stats.hard_cases_pending} · Total hard: {stats.hard_cases} · Pseudo: {stats.pseudo_labels}
        </Text>
      )}

      <TextInput
        style={styles.filter}
        placeholder="Filter by store_id (optional)"
        value={storeFilter}
        onChangeText={setStoreFilter}
        autoCapitalize="none"
      />
      <TouchableOpacity style={styles.refreshBtn} onPress={load}>
        <Text style={styles.refreshText}>Refresh</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator color="#A68B5B" style={{ marginTop: 24 }} />
      ) : cases.length === 0 ? (
        <Text style={styles.empty}>No pending hard cases</Text>
      ) : cases.map((c) => (
        <View key={c._id} style={styles.card}>
          <Text style={styles.meta}>{c.store_id} / {c.camera_id} · conf {c.confidence?.toFixed(2)}</Text>
          {c.crop_b64 && (
            <Image
              source={{ uri: `data:image/jpeg;base64,${c.crop_b64}` }}
              style={styles.crop}
              resizeMode="contain"
            />
          )}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.approve} onPress={() => handleReview(c._id, "approve")}>
              <Text style={styles.actionText}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reject} onPress={() => handleReview(c._id, "reject")}>
              <Text style={styles.actionText}>Reject</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: "#FDFDFB", padding: 16 },
  center:      { flex: 1, justifyContent: "center", alignItems: "center" },
  title:       { fontSize: 20, fontWeight: "800", color: "#2D2D2A", marginBottom: 8 },
  stats:       { fontSize: 12, color: "#858582", marginBottom: 12 },
  filter:      { backgroundColor: "#fff", borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: "#eee" },
  refreshBtn:  { alignSelf: "flex-start", marginBottom: 16 },
  refreshText: { color: "#A68B5B", fontWeight: "600" },
  empty:       { textAlign: "center", color: "#858582", marginTop: 40 },
  card:        { backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "rgba(166,139,91,0.1)" },
  meta:        { fontSize: 11, color: "#858582", marginBottom: 8 },
  crop:        { width: "100%", height: 120, backgroundColor: "#f0f0f0", borderRadius: 8 },
  actions:     { flexDirection: "row", gap: 12, marginTop: 12 },
  approve:     { flex: 1, backgroundColor: "#A68B5B", padding: 10, borderRadius: 8, alignItems: "center" },
  reject:      { flex: 1, backgroundColor: "#eee", padding: 10, borderRadius: 8, alignItems: "center" },
  actionText:  { fontWeight: "700", fontSize: 13 },
});
