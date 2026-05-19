import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, ActivityIndicator,
} from "react-native";
import Svg, { Rect, Circle } from "react-native-svg";
import {
  fetchFloors, fetchSpatialLive, fetchHeatmap,
} from "../services/api";

const { width } = Dimensions.get("window");
const MAP_SIZE = width - 48;

export default function MapScreen({ store }) {
  const [floors, setFloors] = useState([{ floor_id: "floor_0", bounds_m: { width: 50, height: 50 } }]);
  const [floorId, setFloorId] = useState("floor_0");
  const [positions, setPositions] = useState([]);
  const [heatmap, setHeatmap] = useState([]);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [bounds, setBounds] = useState({ width: 50, height: 50 });
  const [loading, setLoading] = useState(true);

  const loadFloors = useCallback(async () => {
    try {
      const data = await fetchFloors(store.store_id, store.password);
      if (data.floors?.length) {
        setFloors(data.floors);
        const f = data.floors.find((x) => x.floor_id === floorId) || data.floors[0];
        setBounds(f.bounds_m || { width: 50, height: 50 });
      }
    } catch (e) {
      console.log("Floors error:", e.message);
    }
  }, [store, floorId]);

  const loadLive = useCallback(async () => {
    try {
      const [live, hm] = await Promise.all([
        fetchSpatialLive(store.store_id, store.password, floorId),
        showHeatmap ? fetchHeatmap(store.store_id, store.password, floorId) : Promise.resolve({ cells: [] }),
      ]);
      setPositions(live.positions || []);
      setHeatmap(hm.cells || []);
    } catch (e) {
      console.log("Map live error:", e.message);
    } finally {
      setLoading(false);
    }
  }, [store, floorId, showHeatmap]);

  useEffect(() => { loadFloors(); }, [loadFloors]);
  useEffect(() => {
    loadLive();
    const t = setInterval(loadLive, 2000);
    return () => clearInterval(t);
  }, [loadLive]);

  const bw = bounds.width || 50;
  const bh = bounds.height || 50;

  const maxHeat = Math.max(...heatmap.map((c) => c.count || 0), 1);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Floor Map</Text>
        <TouchableOpacity
          style={[styles.toggle, showHeatmap && styles.toggleOn]}
          onPress={() => setShowHeatmap(!showHeatmap)}
        >
          <Text style={styles.toggleText}>{showHeatmap ? "Heatmap" : "Live"}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.floorBar}>
        {floors.map((f) => (
          <TouchableOpacity
            key={f.floor_id}
            style={[styles.floorChip, floorId === f.floor_id && styles.floorChipActive]}
            onPress={() => {
              setFloorId(f.floor_id);
              setBounds(f.bounds_m || { width: 50, height: 50 });
            }}
          >
            <Text style={[styles.floorChipText, floorId === f.floor_id && styles.floorChipTextActive]}>
              {f.floor_id}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator size="large" color="#A68B5B" style={{ marginTop: 40 }} />
      ) : (
        <View style={styles.mapWrap}>
          <Svg width={MAP_SIZE} height={MAP_SIZE} viewBox={`0 0 ${bw} ${bh}`}>
            <Rect x={0} y={0} width={bw} height={bh} fill="#F5F5F7" stroke="#ddd" strokeWidth={0.1} />
            {showHeatmap && heatmap.map((c, i) => {
              const intensity = (c.count || 0) / maxHeat;
              return (
                <Rect
                  key={`h-${i}`}
                  x={c.gx}
                  y={c.gy}
                  width={1}
                  height={1}
                  fill={`rgba(166,139,91,${0.15 + intensity * 0.7})`}
                />
              );
            })}
            {!showHeatmap && positions.map((p) => (
              <Circle
                key={`t-${p.track_id}`}
                cx={p.x_m}
                cy={p.y_m}
                r={0.4}
                fill="#A68B5B"
                opacity={0.9}
              />
            ))}
          </Svg>
          <Text style={styles.legend}>
            {showHeatmap ? `${heatmap.length} heat cells` : `${positions.length} people live`}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: "#F5F5F7", paddingTop: 56 },
  header:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 24, marginBottom: 12 },
  title:       { fontSize: 22, fontWeight: "800", color: "#1D1D1F" },
  toggle:      { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: "#fff", borderWidth: 1, borderColor: "#ddd" },
  toggleOn:    { backgroundColor: "#A68B5B", borderColor: "#A68B5B" },
  toggleText:  { fontSize: 12, fontWeight: "700", color: "#1D1D1F" },
  floorBar:    { paddingHorizontal: 16, marginBottom: 16, maxHeight: 44 },
  floorChip:   { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: "#fff", marginRight: 8, borderWidth: 1, borderColor: "#eee" },
  floorChipActive: { backgroundColor: "#1D1D1F", borderColor: "#1D1D1F" },
  floorChipText: { fontSize: 12, color: "#86868B", fontWeight: "600" },
  floorChipTextActive: { color: "#fff" },
  mapWrap:     { alignItems: "center", padding: 24 },
  legend:      { marginTop: 12, fontSize: 12, color: "#86868B", fontWeight: "500" },
});
