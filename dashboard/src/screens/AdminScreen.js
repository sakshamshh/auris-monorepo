import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, ScrollView, Platform
} from "react-native";
import axios from "axios";
import TrainingReviewScreen from "./TrainingReviewScreen";

const BASE_URL = "https://auris.skymlabs.com";

export default function AdminScreen({ onBack }) {
  const [adminKey, setAdminKey]   = useState("");
  const [authed, setAuthed]       = useState(false);
  const [stores, setStores]       = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("create");

  // create store form
  const [storeId, setStoreId]     = useState("");
  const [storeName, setStoreName] = useState("");
  const [password, setPassword]   = useState("");
  const [result, setResult]       = useState(null);

  const verify = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${BASE_URL}/admin/stores`, {
        headers: { "X-Admin-Key": adminKey }
      });
      setStores(res.data.stores);
      setAuthed(true);
    } catch (e) {
      Alert.alert("Error", "Invalid admin key");
    } finally {
      setLoading(false);
    }
  };

  const createStore = async () => {
    if (!storeId || !storeName || !password) {
      Alert.alert("Error", "All fields required");
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${BASE_URL}/admin/stores`, {
        store_id:   storeId.trim().toLowerCase().replace(/\s+/g, "_"),
        store_name: storeName.trim(),
        password:   password.trim()
      }, { headers: { "X-Admin-Key": adminKey } });
      setResult(res.data);
      // refresh store list
      const list = await axios.get(`${BASE_URL}/admin/stores`, {
        headers: { "X-Admin-Key": adminKey }
      });
      setStores(list.data.stores);
    } catch (e) {
      Alert.alert("Error", e.response?.data?.detail || "Failed to create store");
    } finally {
      setLoading(false);
    }
  };

  const deleteStore = async (storeId) => {
    const doDelete = async () => {
      try {
        await axios.delete(`${BASE_URL}/admin/stores/${storeId}`, {
          headers: { "X-Admin-Key": adminKey }
        });
        const list = await axios.get(`${BASE_URL}/admin/stores`, {
          headers: { "X-Admin-Key": adminKey }
        });
        setStores(list.data.stores);
      } catch (e) {
        Alert.alert("Error", "Failed to remove store");
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm(`Are you sure you want to remove ${storeId}?`)) {
        doDelete();
      }
    } else {
      Alert.alert("Remove Store", `Are you sure you want to remove ${storeId}?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: doDelete }
      ]);
    }
  };

  const reset = () => {
    setResult(null);
    setStoreId("");
    setStoreName("");
    setPassword("");
  };

  // ── admin key screen ───────────────────────────────────────────────────────
  if (!authed) return (
    <View style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.title}>Auris Admin</Text>
        <Text style={styles.sub}>Skym Labs Internal</Text>
        <View style={styles.form}>
          <Text style={styles.label}>ADMIN KEY</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter admin key"
            placeholderTextColor="#858582"
            value={adminKey}
            onChangeText={setAdminKey}
            secureTextEntry
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.btn} onPress={verify} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Access Admin Panel</Text>}
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back to login</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── result screen ──────────────────────────────────────────────────────────
  if (result) return (
    <ScrollView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.title}>Store Created</Text>
        <View style={styles.resultCard}>
          <Text style={styles.cardTitle}>SHARE WITH OWNER</Text>
          <Row label="Store Name" value={result.store_name} />
          <Row label="Dashboard" value="auris.skymlabs.com" />
          <Row label="Store ID" value={result.store_id} />
          <Row label="Password" value={password} />
        </View>
        <View style={styles.resultCard}>
          <Text style={styles.cardTitle}>DEVICE API KEY</Text>
          <Text style={styles.apiKey}>{result.api_key}</Text>
          <Text style={styles.apiKeySub}>Add to device .env as CLOUD_API_KEY</Text>
        </View>
        <TouchableOpacity style={styles.btn} onPress={reset}>
          <Text style={styles.btnText}>Create Another Store</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.outlineBtn} onPress={() => setTab("stores")}>
          <Text style={styles.outlineBtnText}>View All Stores</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  // ── main admin panel ───────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Auris Admin</Text>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backText}>← Exit</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity style={[styles.tabBtn, tab === "create" && styles.tabBtnActive]} onPress={() => setTab("create")}>
          <Text style={[styles.tabBtnText, tab === "create" && styles.tabBtnTextActive]}>Create Store</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab === "stores" && styles.tabBtnActive]} onPress={() => setTab("stores")}>
          <Text style={[styles.tabBtnText, tab === "stores" && styles.tabBtnTextActive]}>Stores ({stores.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab === "training" && styles.tabBtnActive]} onPress={() => setTab("training")}>
          <Text style={[styles.tabBtnText, tab === "training" && styles.tabBtnTextActive]}>Training</Text>
        </TouchableOpacity>
      </View>

      {tab === "training" ? (
        <TrainingReviewScreen adminKey={adminKey} />
      ) : tab === "create" ? (
        <ScrollView style={styles.content}>
          <View style={styles.form}>
            <Text style={styles.label}>STORE ID</Text>
            <Text style={styles.hint}>lowercase, no spaces (e.g. sharma_karolbagh)</Text>
            <TextInput style={styles.input} placeholder="sharma_karolbagh" placeholderTextColor="#858582" value={storeId} onChangeText={setStoreId} autoCapitalize="none" />

            <Text style={styles.label}>STORE NAME</Text>
            <TextInput style={styles.input} placeholder="Sharma Electronics, Karol Bagh" placeholderTextColor="#858582" value={storeName} onChangeText={setStoreName} />

            <Text style={styles.label}>PASSWORD</Text>
            <Text style={styles.hint}>Share this with the store owner</Text>
            <TextInput style={styles.input} placeholder="Strong password" placeholderTextColor="#858582" value={password} onChangeText={setPassword} />

            <TouchableOpacity style={styles.btn} onPress={createStore} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create Store & Generate API Key</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        <ScrollView style={styles.content}>
          {stores.length === 0 ? (
            <Text style={styles.empty}>No stores yet</Text>
          ) : stores.map((s, i) => (
            <View key={i} style={styles.storeCard}>
              <Text style={styles.storeName}>{s.store_name}</Text>
              <Text style={styles.storeId}>{s.store_id}</Text>
              <View style={styles.storeRow}>
                <Text style={styles.storeMeta}>Plan: {s.plan}</Text>
                <View style={[styles.badge, s.active ? styles.badgeActive : styles.badgeInactive]}>
                  <Text style={styles.badgeText}>{s.active ? "Active" : "Inactive"}</Text>
                </View>
              </View>
              <Text style={styles.storeMeta}>Created: {s.created?.slice(0, 10)}</Text>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => deleteStore(s.store_id)}
              >
                <Text style={styles.deleteBtnText}>Remove Store</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: "#FDFDFB" },
  inner:            { flex: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 40 },
  title:            { fontSize: 28, fontWeight: "800", color: "#2D2D2A", marginBottom: 4 },
  sub:              { fontSize: 13, color: "#858582", marginBottom: 32 },
  form:             { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 24, borderWidth: 1, borderColor: "rgba(166,139,91,0.08)" },
  label:            { fontSize: 10, color: "#858582", letterSpacing: 2, marginBottom: 4, marginTop: 16, textTransform: "uppercase" },
  hint:             { fontSize: 11, color: "#858582", marginBottom: 8 },
  input:            { backgroundColor: "#FDFDFB", borderRadius: 8, padding: 14, color: "#2D2D2A", fontSize: 15, borderWidth: 1, borderColor: "rgba(166,139,91,0.15)" },
  btn:              { backgroundColor: "#A68B5B", borderRadius: 8, padding: 16, alignItems: "center", marginTop: 24 },
  btnText:          { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  outlineBtn:       { borderWidth: 1, borderColor: "#A68B5B", borderRadius: 8, padding: 16, alignItems: "center", marginTop: 12 },
  outlineBtnText:   { color: "#A68B5B", fontWeight: "700", fontSize: 15 },
  backBtn:          { marginTop: 24, alignItems: "center" },
  backText:         { color: "#A68B5B", fontSize: 13 },
  header:           { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, paddingTop: 56, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderColor: "rgba(166,139,91,0.08)" },
  headerTitle:      { fontSize: 18, fontWeight: "700", color: "#2D2D2A" },
  tabBar:           { flexDirection: "row", backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderColor: "rgba(166,139,91,0.08)" },
  tabBtn:           { flex: 1, padding: 14, alignItems: "center" },
  tabBtnActive:     { borderBottomWidth: 2, borderColor: "#A68B5B" },
  tabBtnText:       { fontSize: 13, color: "#858582" },
  tabBtnTextActive: { color: "#A68B5B", fontWeight: "700" },
  content:          { flex: 1, padding: 16 },
  resultCard:       { backgroundColor: "#FFFFFF", borderRadius: 12, padding: 20, marginBottom: 12, borderWidth: 1, borderColor: "rgba(166,139,91,0.08)" },
  cardTitle:        { fontSize: 10, color: "#858582", letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 },
  row:              { marginBottom: 12 },
  rowLabel:         { fontSize: 10, color: "#858582", letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 },
  rowValue:         { fontSize: 15, color: "#2D2D2A", fontWeight: "600" },
  apiKey:           { fontSize: 12, color: "#A68B5B", fontFamily: "monospace", marginBottom: 4 },
  apiKeySub:        { fontSize: 11, color: "#858582" },
  storeCard:        { backgroundColor: "#FFFFFF", borderRadius: 12, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: "rgba(166,139,91,0.08)" },
  storeName:        { fontSize: 16, fontWeight: "700", color: "#2D2D2A", marginBottom: 4 },
  storeId:          { fontSize: 12, color: "#A68B5B", fontFamily: "monospace", marginBottom: 8 },
  storeRow:         { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  storeMeta:        { fontSize: 11, color: "#858582" },
  badge:            { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  badgeActive:      { backgroundColor: "rgba(166,139,91,0.1)" },
  badgeInactive:    { backgroundColor: "rgba(0,0,0,0.05)" },
  badgeText:        { fontSize: 11, color: "#A68B5B", fontWeight: "600" },
  deleteBtn:        { marginTop: 8, padding: 8, borderRadius: 6, borderWidth: 1, borderColor: "rgba(255,0,0,0.2)", alignItems: "center" },
  deleteBtnText:    { color: "#ff4444", fontSize: 12 },
  empty:            { textAlign: "center", color: "#858582", marginTop: 40 },
});


