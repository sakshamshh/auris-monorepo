import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  ActivityIndicator, RefreshControl, TouchableOpacity, FlatList
} from 'react-native';

const API_BASE = 'https://auris.skymlabs.com';

const fmtNum = (n) => n?.toLocaleString('en-IN') ?? '—';
const fmtRs = (n) => n != null ? `₹${fmtNum(Math.round(n))}` : '—';
const fmtHrs = (n) => n != null ? `${parseFloat(n).toFixed(1)} hrs` : '—';

export default function FactoryScreen({ store }) {
  const [subTab, setSubTab] = useState('deadtime'); // 'deadtime' | 'bottleneck' | 'patterns'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const fetchData = async (currentTab = subTab) => {
    setLoading(true);
    setError(null);
    try {
      let endpoint = '';
      if (currentTab === 'deadtime') endpoint = '/api/factory/deadtime';
      else if (currentTab === 'bottleneck') endpoint = '/api/factory/bottleneck';
      else if (currentTab === 'patterns') endpoint = '/api/factory/patterns';

      const res = await fetch(`${API_BASE}${endpoint}`, {
        headers: {
          'X-Store-ID': store.store_id,
          'X-Password': store.password,
        }
      });

      if (!res.ok) {
        throw new Error(`Failed to load ${currentTab} data`);
      }

      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData(subTab);
  }, [subTab]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData(subTab);
  };

  const handleSubTabChange = (tabId) => {
    setSubTab(tabId);
  };

  // Helper check for empty telemetry state
  const isTelemetryEmpty = () => {
    if (!data) return true;
    if (subTab === 'deadtime') {
      return !data.by_zone || data.by_zone.length === 0;
    }
    if (subTab === 'bottleneck') {
      return data.cached === false || !data.ranked_stations || data.ranked_stations.length === 0;
    }
    if (subTab === 'patterns') {
      return !data.patterns || data.patterns.length === 0;
    }
    return true;
  };

  // Renders the sub tab navigation switcher at the top
  const renderTabSwitcher = () => (
    <View style={styles.subNavBar}>
      {['deadtime', 'bottleneck', 'patterns'].map((t) => {
        const label = t === 'deadtime' ? 'Dead Time' : t === 'bottleneck' ? 'Bottleneck' : 'Patterns';
        const active = subTab === t;
        return (
          <TouchableOpacity
            key={t}
            style={[styles.subTabButton, active && styles.subTabActiveButton]}
            onPress={() => handleSubTabChange(t)}
          >
            <Text style={[styles.subTabLabel, active && styles.subTabLabelActive]}>
              {label.toUpperCase()}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // 1. Render Dead Time Dashboard
  const renderDeadTime = () => {
    if (isTelemetryEmpty()) return renderEmptyState();
    const summary = data.summary || {};
    const zones = data.by_zone || [];

    return (
      <View style={styles.tabContent}>
        {/* Stat Boxes */}
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{fmtHrs(summary.expected_hours_total)}</Text>
            <Text style={styles.statLabel}>PAID HOURS</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{fmtHrs(summary.productive_hours_total)}</Text>
            <Text style={styles.statLabel}>PRODUCTIVE HOURS</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{fmtHrs(summary.dead_hours_total)}</Text>
            <Text style={styles.statLabel}>DEAD HOURS</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statVal, styles.rupeeText]}>{fmtRs(summary.dead_cost_inr)}</Text>
            <Text style={styles.statLabel}>COST IMPACT</Text>
          </View>
        </View>

        {/* Zones List Header */}
        <Text style={styles.sectionHeader}>WORKSTATION IDLE TIMELINE</Text>

        {/* Zones */}
        {zones.map((item, idx) => (
          <View key={idx} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.zone_label}</Text>
              <Text style={styles.cardSubtitle}>{item.zone_id}</Text>
            </View>
            <View style={styles.cardRow}>
              <View>
                <Text style={styles.cardMetaLabel}>PRODUCTIVE</Text>
                <Text style={styles.cardMetaVal}>{fmtHrs(item.productive_hours)}</Text>
              </View>
              <View>
                <Text style={styles.cardMetaLabel}>DEAD HOURS</Text>
                <Text style={styles.cardMetaVal}>{fmtHrs(item.dead_hours)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.cardMetaLabel}>FINANCIAL COST</Text>
                <Text style={[styles.cardMetaVal, styles.rupeeText]}>{fmtRs(item.dead_cost_inr)}</Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    );
  };

  // 2. Render Bottleneck Dashboard
  const renderBottleneck = () => {
    if (isTelemetryEmpty()) return renderEmptyState();
    const stations = data.ranked_stations || [];
    const topStation = stations[0] || {};

    return (
      <View style={styles.tabContent}>
        {/* Top Station Highlight Card */}
        <View style={styles.highlightCard}>
          <Text style={styles.highlightTag}>CRITICAL BOTTLENECK STATION</Text>
          <Text style={styles.highlightTitle}>{topStation.zone_label}</Text>
          <Text style={styles.highlightSubtitle}>Rank #1 - Highest cascade propagation loss</Text>

          <View style={styles.highlightStats}>
            <View style={styles.highlightStatItem}>
              <Text style={styles.highlightStatLabel}>CASCADE LOSS COST</Text>
              <Text style={[styles.highlightStatVal, styles.rupeeText]}>{fmtRs(topStation.total_cost_inr)}</Text>
            </View>
            <View style={[styles.highlightStatItem, { alignItems: 'flex-end' }]}>
              <Text style={styles.highlightStatLabel}>PROJECTED OUTPUT GAIN</Text>
              <Text style={[styles.highlightStatVal, styles.greenText]}>+{topStation.projected_gain_pct?.toFixed(1)}%</Text>
            </View>
          </View>
        </View>

        {/* Subsequent stations */}
        <Text style={styles.sectionHeader}>RANKED BOTTLENECK CASCADE</Text>
        {stations.map((item, idx) => (
          <View key={idx} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>#{idx + 1} {item.zone_label}</Text>
              <Text style={styles.cardSubtitle}>ID: {item.zone_id}</Text>
            </View>
            <View style={styles.cardRow}>
              <View>
                <Text style={styles.cardMetaLabel}>STALL EVENTS</Text>
                <Text style={styles.cardMetaVal}>{item.event_count} counts</Text>
              </View>
              <View>
                <Text style={styles.cardMetaLabel}>CASCADE IDLE</Text>
                <Text style={styles.cardMetaVal}>{fmtHrs(item.total_cascade_idle_hours)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.cardMetaLabel}>PROJECTED GAIN</Text>
                <Text style={[styles.cardMetaVal, styles.greenText]}>+{item.projected_gain_pct?.toFixed(1)}%</Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    );
  };

  // 3. Render Patterns Dashboard
  const renderPatterns = () => {
    if (isTelemetryEmpty()) return renderEmptyState();
    const patterns = data.patterns || [];

    return (
      <View style={styles.tabContent}>
        <Text style={styles.sectionHeader}>IDENTIFIED WASTE PATTERNS</Text>
        {patterns.map((item, idx) => (
          <View key={idx} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.zone_label}</Text>
              <Text style={styles.cardSubtitle}>Time Slot: {item.hour_label} ({item.hour_slot}:00)</Text>
            </View>
            <View style={styles.cardRow}>
              <View>
                <Text style={styles.cardMetaLabel}>CONFIDENCE</Text>
                <Text style={styles.cardMetaVal}>{item.confidence?.toFixed(1)}%</Text>
              </View>
              <View>
                <Text style={styles.cardMetaLabel}>RECURRENCE</Text>
                <Text style={styles.cardMetaVal}>{item.recurrence_count} weekly</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.cardMetaLabel}>EST. MONTHLY LOSS</Text>
                <Text style={[styles.cardMetaVal, styles.rupeeText]}>{fmtRs(item.monthly_cost_inr)}</Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    );
  };

  // Empty State Placeholder
  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>⏳</Text>
      <Text style={styles.emptyTitle}>Building your picture</Text>
      <Text style={styles.emptySubtitle}>check back Day 7</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Screen Header */}
      <View style={styles.header}>
        <Text style={styles.headerSubtitle}>ENVIRONMENT MATRIX</Text>
        <Text style={styles.headerTitle}>Industrial Analytics</Text>
        <Text style={styles.storeName}>{store.store_name}</Text>
      </View>

      {/* Sub navigation tabs */}
      {renderTabSwitcher()}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#A68B5B" />
          <Text style={styles.loadingText}>Synchronizing factory telemetry...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>No factory configuration active</Text>
          <Text style={styles.errorSub}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => fetchData(subTab)}>
            <Text style={styles.retryText}>Retry Link</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A68B5B" />
          }
        >
          {subTab === 'deadtime' && renderDeadTime()}
          {subTab === 'bottleneck' && renderBottleneck()}
          {subTab === 'patterns' && renderPatterns()}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    color: '#86868B',
    marginTop: 16,
    fontSize: 13,
    fontWeight: '500',
  },
  errorText: {
    color: '#1D1D1F',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorSub: {
    color: '#86868B',
    fontSize: 13,
    marginBottom: 24,
    textAlign: 'center',
    fontWeight: '500',
  },
  retryBtn: {
    backgroundColor: '#1D1D1F',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  headerSubtitle: {
    fontSize: 10,
    color: '#A68B5B',
    letterSpacing: 1.5,
    fontWeight: '800',
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1D1D1F',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  storeName: {
    fontSize: 13,
    color: '#86868B',
    fontWeight: '500',
  },
  subNavBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 16,
  },
  subTabButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  subTabActiveButton: {
    borderBottomColor: '#A68B5B',
  },
  subTabLabel: {
    fontSize: 10,
    color: '#86868B',
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  subTabLabelActive: {
    color: '#A68B5B',
  },
  scrollView: {
    flex: 1,
  },
  tabContent: {
    padding: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statBox: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  statVal: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1D1D1F',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 8,
    color: '#86868B',
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  sectionHeader: {
    fontSize: 10,
    color: '#86868B',
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 16,
    marginBottom: 12,
    paddingLeft: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 3,
  },
  cardHeader: {
    borderBottomWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    paddingBottom: 12,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1D1D1F',
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 11,
    color: '#86868B',
    fontWeight: '500',
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardMetaLabel: {
    fontSize: 8,
    color: '#86868B',
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  cardMetaVal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1D1D1F',
  },
  highlightCard: {
    backgroundColor: '#1D1D1F',
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
  },
  highlightTag: {
    fontSize: 8,
    color: '#A68B5B',
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  highlightTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  highlightSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '500',
    marginBottom: 24,
  },
  highlightStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingTop: 16,
  },
  highlightStatItem: {
    flex: 1,
  },
  highlightStatLabel: {
    fontSize: 8,
    color: 'rgba(255,255,255,0.3)',
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  highlightStatVal: {
    fontSize: 18,
    fontWeight: '800',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 60,
    margin: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 16,
    opacity: 0.6,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1D1D1F',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#86868B',
    fontWeight: '500',
  },
  rupeeText: {
    color: '#DC2626',
  },
  greenText: {
    color: '#16A34A',
  },
});
