import React, { useState, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Image, Alert, ActivityIndicator, Dimensions,
} from "react-native";
import {
  fetchCalibrationSnapshot, fetchGCP, saveGCP, solveHomography, fetchCalibrationStatus,
} from "../services/api";

const { width } = Dimensions.get("window");

export default function CalibrationScreen({ store }) {
  const [cameraId, setCameraId] = useState("cam1");
  const [floorId, setFloorId] = useState("floor_0");
  const [snapshot, setSnapshot] = useState(null);
  const [points, setPoints] = useState([]);
  const [pending, setPending] = useState(null);
  const [xM, setXM] = useState("");
  const [yM, setYM] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [rmse, setRmse] = useState(null);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await fetchCalibrationSnapshot(store.store_id, store.password, cameraId);
      setSnapshot(snap.full_frame_b64 ? `data:image/jpeg;base64,${snap.full_frame_b64}` : null);
      const gcp = await fetchGCP(store.store_id, store.password, cameraId);
      setPoints(gcp.points || []);
      if (gcp.rmse_m != null) setRmse(gcp.rmse_m);
      const st = await fetchCalibrationStatus(store.store_id, store.password);
      setStatus(st);
    } catch (e) {
      Alert.alert("Error", e.response?.data?.detail || "Load snapshot failed. Enable calibration on edge.");
    } finally {
      setLoading(false);
    }
  }, [store, cameraId]);

  const onImagePress = (evt) => {
    if (!snapshot) return;
    const { locationX, locationY } = evt.nativeEvent;
    const imgW = width - 48;
    const imgH = imgW * 0.75;
    const px = Math.max(0, Math.min(1, locationX / imgW));
    const py = Math.max(0, Math.min(1, locationY / imgH));
    setPending({ px, py });
    setXM("");
    setYM("");
  };

  const addPoint = () => {
    if (!pending || !xM || !yM) {
      Alert.alert("Error", "Tap the image then enter x_m and y_m from your laser meter");
      return;
    }
    setPoints([...points, {
      px: pending.px,
      py: pending.py,
      x_m: parseFloat(xM),
      y_m: parseFloat(yM),
      label: `P${points.length + 1}`,
    }]);
    setPending(null);
    setXM("");
    setYM("");
  };

  const saveAndSolve = async () => {
    if (points.length < 4) {
      Alert.alert("Need 4+ points", "Mark at least 4 ground control points");
      return;
    }
    setLoading(true);
    try {
      await saveGCP(store.store_id, store.password, {
        store_id: store.store_id,
        camera_id: cameraId,
        floor_id: floorId,
        points,
      });
      const res = await solveHomography(store.store_id, store.password, cameraId, floorId);
      setRmse(res.rmse_m);
      Alert.alert("Calibrated", `RMSE: ${res.rmse_m?.toFixed(3)} m`);
    } catch (e) {
      Alert.alert("Solve failed", e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.title}>LDM Calibration</Text>
      <Text style={styles.sub}>Tap snapshot points, enter metre readings from laser distance meter</Text>

      <Text style={styles.label}>CAMERA ID</Text>
      <TextInput style={styles.input} value={cameraId} onChangeText={setCameraId} autoCapitalize="none" />

      <TouchableOpacity style={styles.btn} onPress={loadSnapshot} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Load Snapshot</Text>}
      </TouchableOpacity>

      {status && (
        <Text style={styles.status}>
          Frames: {status.calibration_frames} · QR: {status.pct_qr}% · Calibrated cams: {status.cameras_calibrated}
        </Text>
      )}

      {snapshot && (
        <TouchableOpacity activeOpacity={1} onPress={onImagePress} style={styles.imageWrap}>
          <Image source={{ uri: snapshot }} style={styles.image} resizeMode="contain" />
          {points.map((p, i) => (
            <View
              key={i}
              style={[styles.marker, {
                left: `${p.px * 100}%`,
                top: `${p.py * 100}%`,
              }]}
            />
          ))}
          {pending && (
            <View style={[styles.marker, styles.markerPending, {
              left: `${pending.px * 100}%`,
              top: `${pending.py * 100}%`,
            }]} />
          )}
        </TouchableOpacity>
      )}

      {pending && (
        <View style={styles.coordForm}>
          <Text style={styles.label}>METRES (from LDM)</Text>
          <View style={styles.row}>
            <TextInput style={styles.coordInput} placeholder="x_m" value={xM} onChangeText={setXM} keyboardType="decimal-pad" />
            <TextInput style={styles.coordInput} placeholder="y_m" value={yM} onChangeText={setYM} keyboardType="decimal-pad" />
          </View>
          <TouchableOpacity style={styles.btnSecondary} onPress={addPoint}>
            <Text style={styles.btnSecondaryText}>Add Point ({points.length}/4+)</Text>
          </TouchableOpacity>
        </View>
      )}

      {points.length > 0 && (
        <View style={styles.pointList}>
          {points.map((p, i) => (
            <Text key={i} style={styles.pointRow}>
              {p.label || `P${i + 1}`}: px={p.px.toFixed(3)}, py={p.py.toFixed(3)} → {p.x_m}m, {p.y_m}m
            </Text>
          ))}
        </View>
      )}

      <TouchableOpacity style={[styles.btn, points.length < 4 && styles.btnDisabled]} onPress={saveAndSolve} disabled={points.length < 4 || loading}>
        <Text style={styles.btnText}>Save & Solve Homography</Text>
      </TouchableOpacity>

      {rmse != null && <Text style={styles.rmse}>RMSE: {rmse.toFixed(3)} m</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: "#F5F5F7", padding: 24, paddingTop: 56 },
  title:           { fontSize: 22, fontWeight: "800", color: "#1D1D1F" },
  sub:             { fontSize: 13, color: "#86868B", marginTop: 4, marginBottom: 20 },
  label:           { fontSize: 10, color: "#86868B", letterSpacing: 1, marginTop: 12, fontWeight: "700" },
  input:           { backgroundColor: "#fff", borderRadius: 10, padding: 14, marginTop: 6, fontSize: 15 },
  btn:             { backgroundColor: "#1D1D1F", borderRadius: 12, padding: 16, alignItems: "center", marginTop: 16 },
  btnDisabled:     { opacity: 0.4 },
  btnText:         { color: "#fff", fontWeight: "700" },
  btnSecondary:    { backgroundColor: "#A68B5B", borderRadius: 10, padding: 12, alignItems: "center", marginTop: 8 },
  btnSecondaryText:{ color: "#fff", fontWeight: "600" },
  status:          { fontSize: 11, color: "#86868B", marginTop: 12 },
  imageWrap:       { marginTop: 16, width: width - 48, height: (width - 48) * 0.75, backgroundColor: "#000", borderRadius: 12, overflow: "hidden", position: "relative" },
  image:           { width: "100%", height: "100%" },
  marker:          { position: "absolute", width: 14, height: 14, borderRadius: 7, backgroundColor: "#A68B5B", marginLeft: -7, marginTop: -7, borderWidth: 2, borderColor: "#fff" },
  markerPending:   { backgroundColor: "#34C759" },
  coordForm:       { marginTop: 16, backgroundColor: "#fff", borderRadius: 12, padding: 16 },
  row:             { flexDirection: "row", gap: 12 },
  coordInput:      { flex: 1, backgroundColor: "#F5F5F7", borderRadius: 8, padding: 12, fontSize: 16 },
  pointList:       { marginTop: 12, backgroundColor: "#fff", borderRadius: 12, padding: 12 },
  pointRow:        { fontSize: 11, color: "#1D1D1F", marginBottom: 4, fontFamily: "monospace" },
  rmse:            { textAlign: "center", marginTop: 12, color: "#A68B5B", fontWeight: "700" },
});
