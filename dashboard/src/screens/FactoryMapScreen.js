import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Dimensions, ActivityIndicator, RefreshControl
} from "react-native";
import { SvgXml, Svg, Circle } from "react-native-svg";
import { fetchMapSvg, fetchSpatialLive, fetchFactoryZones, fetchFactoryCameras } from "../services/api";

const { width } = Dimensions.get("window");
const MAP_SIZE = width - 32;

export default function FactoryMapScreen({ store, setCameraCount }) {
  const [svgString, setSvgString] = useState(null);
  const [positions, setPositions] = useState([]);
  const [bounds, setBounds] = useState({ width: 50, height: 50 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [zones, setZones] = useState([]);
  const [zonesLoaded, setZonesLoaded] = useState(false);
  const [camerasData, setCamerasData] = useState({ cameras: [], total_online: 0 });

  const loadZones = useCallback(async () => {
    try {
      const data = await fetchFactoryZones(store.store_id, store.password);
      setZones(data.zones || []);
      setZonesLoaded(true);
    } catch (e) {
      console.log("Failed to load factory zones:", e.message);
      setZonesLoaded(true);
    }
  }, [store]);

  const loadCameras = useCallback(async () => {
    try {
      const data = await fetchFactoryCameras(store.store_id, store.password);
      setCamerasData(data);
      if (setCameraCount) {
        setCameraCount(data.total_online);
      }
    } catch (e) {
      console.log("Failed to load factory cameras status:", e.message);
    }
  }, [store, setCameraCount]);

  const loadMapData = useCallback(async () => {
    try {
      const xml = await fetchMapSvg(store.store_id, store.password, "floor_0");
      setSvgString(xml);
      
      // Parse SVG viewBox or bounds if possible, or fallback
      const match = xml.match(/viewBox="0 0 (\d+(\.\d+)?) (\d+(\.\d+)?)"/);
      if (match) {
        setBounds({ width: parseFloat(match[1]), height: parseFloat(match[3]) });
      }
    } catch (e) {
      console.log("Failed to load map SVG:", e.message);
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
    loadZones();
    loadCameras();
    loadMapData();
    loadLivePositions();
    const interval = setInterval(() => {
      loadLivePositions();
      loadCameras();
    }, 5000);
    return () => clearInterval(interval);
  }, [loadZones, loadCameras, loadMapData, loadLivePositions]);

  const onRefresh = () => {
    setRefreshing(true);
    loadZones();
    loadCameras();
    loadMapData();
    loadLivePositions();
  };

  // Check if cameras are offline (based on total_online count from cameras status API)
  const isCameraOffline = error || (camerasData && camerasData.total_online === 0);

  // Check if system is in learning phase (created_at < 3 days)
  const daysSinceCreation = store.created_at
    ? (new Date() - new Date(store.created_at)) / (1000 * 60 * 60 * 24)
    : 0;
  const isLearningPhase = daysSinceCreation < 3;

  const getZoneMetrics = (zone) => {
    const bbox = zone.bbox;
    if (!bbox || bbox.length < 4) {
      return { count: 0, status: "Empty", statusColor: "#DC2626" };
    }
    const [x1, y1, x2, y2] = bbox;
    const count = positions.filter(p => {
      const px = p.x_m / bounds.width;
      const py = p.y_m / bounds.height;
      return px >= x1 && px <= x2 && py >= y1 && py <= y2;
    }).length;

    let status = "Empty";
    let statusColor = "#DC2626"; // red
    const expected = parseInt(zone.expected_headcount || 1, 10);
    if (count >= expected) {
      status = "Full";
      statusColor = "#16A34A"; // green
    } else if (count > 0) {
      status = "Low";
      statusColor = "#CA8A04"; // amber
    }

    return { count, status, statusColor };
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A3C5E" />
      }
    >
      {/* Offline Banner */}
      {isCameraOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>⚠️ Camera offline — check NVR</Text>
        </View>
      )}

      {/* Learning Phase Banner */}
      {isLearningPhase && (
        <View style={styles.learningBanner}>
          <Text style={styles.learningText}>⏳ System learning your factory. Live data in 3 days.</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#1A3C5E" style={styles.loader} />
      ) : (
        <View style={styles.mapCard}>
          <Text style={styles.mapTitle}>Live Spatial Tracking</Text>
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
            ● {positions.length} Live Personnel Located
          </Text>
        </View>
      )}

      {/* Zone Summary list */}
      <View style={styles.listCard}>
        <Text style={styles.listTitle}>Workstation Headcounts</Text>
        {zones.length === 0 && zonesLoaded ? (
          <Text style={styles.noZonesText}>No zones configured yet. Label zones in HQ portal → hq.skymlabs.com</Text>
        ) : (
          zones.map((z, idx) => {
            const { count, status, statusColor } = getZoneMetrics(z);
            return (
              <View key={idx} style={styles.listItem}>
                <View style={styles.listLeft}>
                  <Text style={styles.zoneName}>{z.zone_label || z.label || z.zone_id}</Text>
                  <Text style={styles.headcountSub}>
                    Type: {z.zone_type || "N/A"} • Expected: {z.expected_headcount || 0}
                  </Text>
                  <Text style={styles.headcountSub}>
                    {count} active worker{count !== 1 ? 's' : ''}
                  </Text>
                </View>
                <View style={[styles.statusTag, { backgroundColor: statusColor + "15" }]}>
                  <Text style={[styles.statusText, { color: statusColor }]}>{status.toUpperCase()}</Text>
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  contentContainer: { padding: 16, paddingBottom: 32 },
  loader: { marginTop: 40 },
  offlineBanner: {
    backgroundColor: "#FEE2E2",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  offlineText: { color: "#DC2626", fontWeight: "700", fontSize: 13, textAlign: "center" },
  learningBanner: {
    backgroundColor: "#FEF3C7",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  learningText: { color: "#D97706", fontWeight: "700", fontSize: 13, textAlign: "center" },
  mapCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  mapTitle: { fontSize: 18, fontWeight: "600", color: "#1A3C5E", marginBottom: 12 },
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
  listCard: {
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
  listTitle: { fontSize: 18, fontWeight: "600", color: "#1A3C5E", marginBottom: 12 },
  listItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  listLeft: { flexDirection: "column" },
  zoneName: { fontSize: 15, fontWeight: "600", color: "#1D1D1F" },
  headcountSub: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  statusTag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: "700" },
  noZonesText: {
    color: "#6B7280",
    fontSize: 14,
    textAlign: "center",
    marginVertical: 20,
    fontStyle: "italic",
  },
});
