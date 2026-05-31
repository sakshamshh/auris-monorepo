import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Platform } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { fetchDeadtime, fetchBottleneck, fetchPatterns } from '../services/api';

const screenWidth = Dimensions.get('window').width;

const CustomBarChart = ({ dailyTrend }) => {
  const data = dailyTrend ? dailyTrend.map(d => {
    const day = new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' });
    return { day, thisWeek: d.cost || 0, lastWeek: 0 };
  }) : [];

  const chartHeight = 220; // taller than home
  const paddingVertical = 20;
  const maxValueInData = Math.max(...data.map(d => d.thisWeek), 0);
  const maxVal = Math.max(maxValueInData, 5000); 
  const yLabels = [0, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal];
  const getBarHeight = (val) => ((val / maxVal) * (chartHeight - paddingVertical * 2));
  
  const innerWidth = screenWidth > 768 ? 1200 : screenWidth - 80;
  const groupWidth = innerWidth / Math.max(data.length, 1);
  const barWidth = 24;
  const gap = 8;

  const formatY = (val) => {
    if (val === 0) return '0';
    if (val >= 1000) return (val / 1000).toFixed(val % 1000 === 0 ? 0 : 1) + 'k';
    return Math.round(val).toString();
  };

  return (
    <View style={{ width: '100%', height: chartHeight }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 16 }}>
          <View style={{ width: 10, height: 10, borderRadius: 2, marginRight: 6, backgroundColor: '#111111' }} />
          <Text style={{ fontSize: 12, color: '#888888' }}>This Week</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 16 }}>
          <View style={{ width: 10, height: 10, borderRadius: 2, marginRight: 6, backgroundColor: '#EFEFEF' }} />
          <Text style={{ fontSize: 12, color: '#888888' }}>Last Week</Text>
        </View>
      </View>

      <Svg width="100%" height={chartHeight - 30}>
        {yLabels.map((val, i) => {
          const y = chartHeight - 30 - paddingVertical - ((val / maxVal) * (chartHeight - 30 - paddingVertical * 2));
          return (
            <React.Fragment key={`grid-${i}`}>
              <Line x1="45" y1={y} x2="100%" y2={y} stroke="#F5F5F5" strokeWidth="1" />
              <SvgText x="35" y={y + 4} fontSize="11" fill="#BBBBBB" textAnchor="end">{formatY(val)}</SvgText>
            </React.Fragment>
          );
        })}
        {data.map((d, i) => {
          const xGroup = 45 + i * groupWidth + (groupWidth / 2) - barWidth - (gap / 2);
          const yThisWeek = chartHeight - 30 - paddingVertical - getBarHeight(d.thisWeek);
          const yLastWeek = chartHeight - 30 - paddingVertical - getBarHeight(d.lastWeek);
          return (
            <React.Fragment key={`group-${i}`}>
              <Rect x={xGroup} y={yThisWeek} width={barWidth} height={getBarHeight(d.thisWeek)} fill="#C0392B" rx="4" ry="4" />
              <Rect x={xGroup + barWidth + gap} y={yLastWeek} width={barWidth} height={getBarHeight(d.lastWeek)} fill="#EFEFEF" rx="4" ry="4" />
              <SvgText x={45 + i * groupWidth + (groupWidth / 2)} y={chartHeight - 15} fontSize="11" fill="#BBBBBB" textAnchor="middle">{d.day}</SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
};
// Heatmap removed as requested

export default function StatsScreen({ store }) {
  const [range, setRange] = useState('This Week');
  const [data, setData] = useState(null);
  const [bottlenecks, setBottlenecks] = useState([]);
  const [patterns, setPatterns] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const to = new Date().toISOString();
        const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const [dead, bottle, patt] = await Promise.all([
          fetchDeadtime(store.store_id, store.password, from, to),
          fetchBottleneck(store.store_id, store.password),
          fetchPatterns(store.store_id, store.password)
        ]);
        setData(dead);
        setBottlenecks(bottle?.ranked_stations || []);
        setPatterns(patt?.patterns || []);
      } catch (e) {
      }
    })();
  }, [store]);

  const fmtRs = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
  const totalIdleCost = data?.summary?.month_cost_inr || 0;
  const estimatedSavings = totalIdleCost * 0.75;
  const byZone = data?.by_zone || [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.pageTitle}>Dead Cost Analysis</Text>
          <Text style={styles.pageSubtitle}>Systematic inefficiencies and resource allocation overview.</Text>
        </View>
        <View style={styles.pillGroup}>
          {['Today', 'This Week', 'This Month'].map(r => (
            <TouchableOpacity 
              key={r} 
              style={[styles.pill, range === r && styles.pillActive]}
              onPress={() => setRange(r)}
            >
              <Text style={[styles.pillText, range === r && styles.pillTextActive]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Section 1: Savings */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1, paddingRight: 20 }}>
            <Text style={styles.sectionLabel}>TOTAL IDLE COST IDENTIFIED</Text>
            <Text style={[styles.bigNumber, { color: '#C0392B' }]}>{fmtRs(totalIdleCost)}</Text>
            <Text style={styles.subText}>Since installation</Text>
          </View>
          <View style={{ width: 1, backgroundColor: '#EFEFEF', marginVertical: 10 }} />
          <View style={{ flex: 1, paddingLeft: 20 }}>
            <Text style={styles.sectionLabel}>YOUR ESTIMATED SAVINGS</Text>
            <Text style={[styles.bigNumber, { color: '#1A7F4B' }]}>{fmtRs(estimatedSavings)}</Text>
            <Text style={styles.subText}>75% of identified losses retained</Text>
          </View>
        </View>
      </View>

      {/* Section 2: Breakdown */}
      <View style={[styles.card, { padding: 0 }]}>
        <View style={{ padding: 20, paddingBottom: 0 }}>
          <Text style={styles.sectionLabel}>ZONE BREAKDOWN</Text>
        </View>
        <View style={styles.table}>
          <View style={styles.trHeader}>
            <Text style={[styles.th, { flex: 2 }]}>Zone</Text>
            <Text style={[styles.th, { flex: 1 }]}>Status</Text>
            <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Dead Time (hrs)</Text>
            <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Dead Cost (₹)</Text>
            <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>vs Last Week</Text>
          </View>
          
          {byZone.map((z, i) => (
            <View key={i} style={[styles.tr, { backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#F9F9F9' }]}>
              <Text style={[styles.td, { flex: 2 }]}>{z.zone_label || z.zone_id}</Text>
              <View style={[styles.td, { flex: 1 }]}>
                <View style={[styles.statusPill, { backgroundColor: '#F0FBF5' }]}><Text style={[styles.statusText, { color: '#1A7F4B' }]}>Active</Text></View>
              </View>
              <Text style={[styles.td, { flex: 1, textAlign: 'right' }]}>{Number(z.dead_hours).toFixed(1)}</Text>
              <Text style={[styles.td, { flex: 1, textAlign: 'right', color: '#C0392B', fontWeight: '600' }]}>{fmtRs(z.dead_cost_inr)}</Text>
              <Text style={[styles.td, { flex: 1, textAlign: 'right', color: '#888888' }]}>-</Text>
            </View>
          ))}
          {byZone.length === 0 && <Text style={{ padding: 20, color: '#888888' }}>No data</Text>}
          
        </View>
      </View>

      {/* Section 3 */}
      <View style={styles.gridRow}>
        <View style={styles.colHalf}>
          <View style={[styles.card, { flex: 1 }]}>
            <Text style={styles.sectionLabel}>DAILY DEAD COST</Text>
            <CustomBarChart dailyTrend={data?.daily_trend} />
          </View>
        </View>
        <View style={styles.colHalf}>
          <View style={[styles.card, { flex: 1 }]}>
            <Text style={styles.sectionLabel}>TOP ZONES</Text>
            
            {byZone.slice(0, 5).map((z, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: i === byZone.length - 1 || i === 4 ? 0 : 1, borderColor: '#EFEFEF' }}>
                <Text style={{ fontSize: 14, color: '#111111' }}>{z.zone_label || z.zone_id}</Text>
                <Text style={{ fontSize: 14, color: '#C0392B', fontWeight: '500' }}>{fmtRs(z.dead_cost_inr)}</Text>
              </View>
            ))}
            {byZone.length === 0 && <Text style={{ color: '#888888', marginTop: 12 }}>No data available.</Text>}

          </View>
        </View>
      </View>

      {/* Section 4 */}
      <View style={styles.gridRow}>
        <View style={styles.colHalf}>
          <View style={[styles.card, { flex: 1 }]}>
            <Text style={styles.sectionLabel}>OBSERVED PATTERNS</Text>
            
            {patterns.slice(0, 3).map((p, idx) => (
              <View key={idx} style={styles.patternCard}>
                <Text style={styles.patternText}>{p.zone_label || p.zone_id} idle at {p.hour_label}</Text>
                <Text style={styles.patternFreq}>Observed {p.recurrence_count} times ({p.confidence.toFixed(0)}% confidence)</Text>
              </View>
            ))}
            {patterns.length === 0 && <Text style={{ color: '#888888' }}>No patterns detected yet.</Text>}

          </View>
        </View>
        <View style={styles.colHalf}>
          <View style={[styles.card, { flex: 1 }]}>
            <Text style={styles.sectionLabel}>CRITICAL BOTTLENECK</Text>
            
            {bottlenecks.length > 0 ? (
              <View style={styles.bottleneckCard}>
                <Text style={styles.bnZone}>{bottlenecks[0].zone_label || bottlenecks[0].zone_id}</Text>
                <Text style={styles.bnRec}>Recorded {bottlenecks[0].event_count} events causing {Number(bottlenecks[0].total_cascade_idle_hours).toFixed(1)}h cascade idle time.</Text>
                <TouchableOpacity style={{ alignSelf: 'flex-end', marginTop: 12 }}>
                  <Text style={{ fontSize: 13, color: '#111111', textDecorationLine: 'underline' }}>View Zone →</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={{ color: '#888888' }}>No active bottlenecks.</Text>
            )}
            
          </View>
        </View>
      </View>
      
      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>© Auris by Skym Labs</Text>
        <Text style={styles.footerText}>support@skymlabs.com · Request Access</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F9F9' },
  content: { padding: Platform.OS === 'web' && Dimensions.get('window').width > 768 ? 40 : 20, maxWidth: 1280, marginHorizontal: 'auto', width: '100%' },
  
  header: { flexDirection: screenWidth > 768 ? 'row' : 'column', justifyContent: 'space-between', alignItems: screenWidth > 768 ? 'center' : 'flex-start', marginBottom: 28 },
  pageTitle: { fontSize: 24, fontWeight: '600', color: '#111111' },
  pageSubtitle: { fontSize: 14, color: '#888888', marginTop: 4 },
  
  pillGroup: { flexDirection: 'row', marginTop: screenWidth > 768 ? 0 : 16 },
  pill: { backgroundColor: '#FFFFFF', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#EFEFEF', paddingVertical: 6, paddingHorizontal: 12, justifyContent: 'center' },
  pillActive: { backgroundColor: '#111111', borderColor: '#111111', borderRadius: 20 },
  pillText: { fontSize: 13, fontWeight: '500', color: '#888888' },
  pillTextActive: { color: '#FFFFFF' },

  card: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#EFEFEF', padding: 20, marginBottom: 28 },
  sectionLabel: { fontSize: 11, fontWeight: '500', color: '#BBBBBB', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 16 },
  
  bigNumber: { fontSize: 32, fontWeight: '700', marginVertical: 4 },
  subText: { fontSize: 12, color: '#BBBBBB' },
  
  table: { width: '100%' },
  trHeader: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 10, borderBottomWidth: 1, borderColor: '#EFEFEF' },
  th: { fontSize: 11, fontWeight: '500', color: '#BBBBBB', textTransform: 'uppercase' },
  tr: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#EFEFEF', alignItems: 'center' },
  td: { fontSize: 14, color: '#111111' },
  
  statusPill: { borderRadius: 20, paddingVertical: 2, paddingHorizontal: 10, alignSelf: 'flex-start' },
  statusText: { fontSize: 12, fontWeight: '500' },
  
  gridRow: { flexDirection: screenWidth > 768 ? 'row' : 'column', marginHorizontal: -6 },
  colHalf: { flex: 1, paddingHorizontal: 6, marginBottom: screenWidth > 768 ? 0 : 16 },
  
  patternCard: { backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#EFEFEF', padding: 14, marginBottom: 12 },
  patternText: { fontSize: 14, color: '#111111' },
  patternFreq: { fontSize: 12, color: '#888888', marginTop: 4 },
  
  bottleneckCard: { borderRadius: 8, borderLeftWidth: 3, borderLeftColor: '#C0392B', backgroundColor: '#FFFFFF', padding: 16, elevation: 1 },
  bnZone: { fontSize: 16, fontWeight: '600', color: '#111111', marginBottom: 4 },
  bnRec: { fontSize: 14, color: '#888888', lineHeight: 20 },
  
  footer: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: '#EFEFEF', paddingTop: 16, marginTop: 16, marginBottom: 40 },
  footerText: { fontSize: 12, color: '#BBBBBB' },
});
