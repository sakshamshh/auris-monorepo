import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Dimensions, ActivityIndicator, RefreshControl
} from "react-native";
import { SvgXml, Svg, Circle } from "react-native-svg";
import { fetchMapSvg, fetchSpatialLive } from "../services/api";

const { width } = Dimensions.get("window");
const MAP_SIZE = width - 32;

export default function RetailMapScreen({ store }) {
  const [svgString, setSvgString] = useState(null);
  const [positions, setPositions] = useState([]);
  const [bounds, setBounds] = useState({ width: 50, height: 50 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadMapData = useCallback(async () => {
    try {
      const xml = await fetchMapSvg(store.store_id, store.password, "floor_0");
      setSvgString(xml);
      
      const match = xml.match(/viewBox="0 0 (\d+(\.\d+)?) (\d+(\.\d+)?)"/);
      if (match) {
        setBounds({ width: parseFloat(match[1]), height: parseFloat(match[3]) });
      }
    } catch (e) {
      console.log("Failed to load retail map SVG:", e.message);
    }
  }, [store]);

  const loadLivePositions = useCallback(async () => {
    try {
      const live = await fetchSpatialLive(store.store_id, store.password, "floor_0");
      setPositions(live.positions || []);
      setError(null);
    } catch (e) {
      console.log("Failed to load live spatial positions:", e.message);
      setError("Could not load — pull to refresh");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [store]);

  useEffect(() => {
    loadMapData();
    loadLivePositions();
    const interval = setInterval(loadLivePositions, 5000);
    return () => clearInterval(interval);
  }, [loadMapData, loadLivePositions]);

  const onRefresh = () => {
    setRefreshing(true);
    loadMapData();
    loadLivePositions();
  };

  const isWarmingUp = !loading && positions.length === 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A3C5E" />
      }
    >
      {/* Total People in Store display at top */}
      <View style={styles.headcountCard}>
        <Text style={styles.headcountLabel}>TOTAL PEOPLE IN STORE</Text>
        <Text style={styles.headcountVal}>{positions.length}</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1A3C5E" style={styles.loader} />
      ) : isWarmingUp ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>💨</Text>
          <Text style={styles.emptyTitle}>Warming Up</Text>
          <Text style={styles.emptySub}>No live data yet. Cameras may still be warming up.</Text>
        </View>
      ) : (
        <View style={styles.mapCard}>
          <Text style={styles.mapTitle}>Live Footfall Location</Text>
          <View style={styles.mapWrap}>
            {svgString ? (
              <View style={styles.svgContainer}>
                <SvgXml xml={svgString} width={MAP_SIZE} height={MAP_SIZE * 0.75} />
                <Svg width={MAP_SIZE} height={MAP_SIZE * 0.75} viewBox={`0 0 ${bounds.width} ${bounds.height}`} style={StyleSheet.absoluteFill}>
                  {positions.map((p) => (
                    <Circle
                      key={`live-${p.track_id}`}
                      cx={p.x_m}
                      cy={p.y_m}
                      r={0.8}
                      fill="#1A3C5E"
                      stroke="#FFFFFF"
                      strokeWidth={0.2}
                      opacity={0.95}
                    />
                  ))}
                </Svg>
              </View>
            ) : (
              <View style={styles.emptyMap}>
                <Text style={styles.emptyText}>Floor map not configured</Text>
              </View>
            )}
          </View>
          <Text style={styles.legend}>
            ● {positions.length} Customers Active
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  contentContainer: { padding: 16, paddingBottom: 32 },
  headcountCard: {
    backgroundColor: "#1A3C5E",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  headcountLabel: { fontSize: 11, fontWeight: "700", color: "#E5E7EB", letterSpacing: 1.5, marginBottom: 4 },
  headcountVal: { fontSize: 44, fontWeight: "800", color: "#FFFFFF" },
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
  },
  emptyIcon: { fontSize: 40, marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#1D1D1F", marginBottom: 6 },
  emptySub: { fontSize: 13, color: "#6B7280", textAlign: "center" },
  mapCard: {
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
  mapTitle: { fontSize: 16, fontWeight: "600", color: "#1A3C5E", marginBottom: 12 },
  mapWrap: {
    width: "100%",
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  svgContainer: { position: "relative", width: MAP_SIZE, height: MAP_SIZE * 0.75 },
  emptyMap: { height: 200, justifyContent: "center", alignItems: "center" },
  emptyText: { color: "#6B7280", fontSize: 14 },
  legend: { marginTop: 12, fontSize: 13, color: "#6B7280", textAlign: "right" },
});
