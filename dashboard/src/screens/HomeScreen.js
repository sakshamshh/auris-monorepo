import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { fetchDeadtime, fetchFactoryCameras } from '../services/api';

const screenWidth = Dimensions.get('window').width;

const CustomBarChart = ({ dailyTrend }) => {
  // Extract last 7 days of data.
  // We don't have "last week" data from the current API response format in daily_trend, 
  // so we'll just plot the current week and leave last week as 0 to avoid faking data.
  const data = dailyTrend ? dailyTrend.map(d => {
    const day = new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' });
    return { day, thisWeek: d.cost || 0, lastWeek: 0 };
  }) : [];

  const chartHeight = 180;
  const paddingVertical = 20;
  const maxVal = Math.max(...data.map(d => d.thisWeek), 5000); 
  const yLabels = [0, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal];

  const getBarHeight = (val) => ((val / maxVal) * (chartHeight - paddingVertical * 2));
  
  const innerWidth = screenWidth > 768 ? 1200 : screenWidth - 80;
  const groupWidth = innerWidth / Math.max(data.length, 1);
  const barWidth = 12;
  const gap = 4;

  return (
    <View style={styles.chartWrapper}>
      <View style={styles.legendContainer}>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: '#111111' }]} />
          <Text style={styles.legendText}>This Week</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: '#EFEFEF' }]} />
          <Text style={styles.legendText}>Last Week</Text>
        </View>
      </View>

      <Svg width="100%" height={chartHeight}>
        {yLabels.map((val, i) => {
          const y = chartHeight - paddingVertical - ((val / maxVal) * (chartHeight - paddingVertical * 2));
          return (
            <React.Fragment key={`grid-${i}`}>
              <Line x1="40" y1={y} x2="100%" y2={y} stroke="#F5F5F5" strokeWidth="1" />
              <SvgText x="30" y={y + 4} fontSize="11" fill="#BBBBBB" textAnchor="end">
                {val === 0 ? '0' : `${Math.round(val / 1000)}k`}
              </SvgText>
            </React.Fragment>
          );
        })}

        {data.map((d, i) => {
          const xGroup = 40 + i * groupWidth + (groupWidth / 2) - barWidth - (gap / 2);
          const yThisWeek = chartHeight - paddingVertical - getBarHeight(d.thisWeek);
          const yLastWeek = chartHeight - paddingVertical - getBarHeight(d.lastWeek);

          return (
            <React.Fragment key={`group-${i}`}>
              <Rect x={xGroup} y={yThisWeek} width={barWidth} height={getBarHeight(d.thisWeek)} fill="#111111" rx="3" ry="3" />
              <Rect x={xGroup + barWidth + gap} y={yLastWeek} width={barWidth} height={getBarHeight(d.lastWeek)} fill="#EFEFEF" rx="3" ry="3" />
              <SvgText x={40 + i * groupWidth + (groupWidth / 2)} y={chartHeight} fontSize="11" fill="#BBBBBB" textAnchor="middle">
                {d.day}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
};

export default function HomeScreen({ store }) {
  const [data, setData] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const to = new Date().toISOString();
        const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const res = await fetchDeadtime(store.store_id, store.password, from, to);
        setData(res);
        const camRes = await fetchFactoryCameras(store.store_id, store.password);
        
        // Use real count, mock names as API only returns `total_online`
        const onlineCount = camRes?.total_online || 0;
        const mappedCams = Array.from({ length: Math.max(onlineCount, 1) }, (_, i) => ({
          name: `CAM-0${i + 1}`,
          status: i < onlineCount ? 'Active' : 'Offline'
        }));
        setCameras(mappedCams);
      } catch (e) {
      } finally {
        setLoading(false);
      }
    })();
  }, [store]);

  const fmtRs = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

  const todayCost = data?.summary?.today_cost_inr || 0;
  const deadHours = data?.summary?.dead_hours_total || 0;
  const worstZone = data?.worst_zone || "No deadtime detected";
  
  // Clean narrative string (strip markdown)
  const rawNarrative = data?.narrative || "System operating normally. No major insights to report.";
  const narrative = rawNarrative.replace(/\*\*[^*]+\*\*/g, '').replace(/#/g, '').trim();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      
      {/* Card 1: Today's Dead Cost */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>TODAY'S DEAD COST</Text>
        <View style={styles.heroRow}>
          <Text style={styles.bigNumber}>{fmtRs(todayCost)}</Text>
          <Text style={styles.subMetric}>🕒 {deadHours.toFixed(1)}h Dead Hours</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.cardFooter}>
          <Text style={styles.bodyText}>Calculated from active zones across all cameras · Updated every hour</Text>
          <TouchableOpacity style={styles.btnSecondary}>
            <Text style={styles.btnSecondaryText}>Download Report</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Card 2: Worst Zone */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>WORST PERFORMING ZONE</Text>
        <Text style={styles.zoneName}>{worstZone}</Text>
        <Text style={styles.reasonText}>Highest idle time contributor for this period.</Text>
        <TouchableOpacity style={styles.textLinkWrapper}>
          <Text style={styles.textLink}>View in Stats →</Text>
        </TouchableOpacity>
      </View>

      {/* Card 3: Trend */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>DEAD COST — THIS WEEK VS LAST WEEK</Text>
        <CustomBarChart dailyTrend={data?.daily_trend} />
      </View>

      {/* Card 4: System Insights */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>SYSTEM INSIGHTS</Text>
        <Text style={styles.insightText}>{narrative}</Text>
      </View>

      {/* Card 5: Camera Status */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>CAMERA STATUS</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.camScroll}>
          {cameras.map((c, i) => (
            <View key={i} style={styles.camPill}>
              <View style={[styles.camDot, { backgroundColor: c.status === 'Active' ? '#1A7F4B' : c.status === 'Offline' ? '#C0392B' : '#E07B00' }]} />
              <Text style={styles.camText}>{c.name} ({c.status})</Text>
            </View>
          ))}
        </ScrollView>
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
  
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    padding: 20,
    marginBottom: 12,
  },
  
  sectionLabel: { fontSize: 11, fontWeight: '500', color: '#BBBBBB', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 16 },
  
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 20 },
  bigNumber: { fontSize: 40, fontWeight: '700', color: '#C0392B', lineHeight: 48 },
  subMetric: { fontSize: 13, fontWeight: '500', color: '#888888', marginLeft: 16, marginBottom: 6 },
  
  divider: { height: 1, backgroundColor: '#EFEFEF', marginBottom: 16 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  bodyText: { fontSize: 13, color: '#888888', flex: 1, marginRight: 16 },
  
  btnSecondary: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#111111', borderRadius: 8, height: 36, justifyContent: 'center', paddingHorizontal: 16 },
  btnSecondaryText: { color: '#111111', fontSize: 14, fontWeight: '500' },
  
  zoneName: { fontSize: 20, fontWeight: '600', color: '#111111', marginBottom: 8 },
  reasonText: { fontSize: 14, color: '#888888' },
  textLinkWrapper: { alignSelf: 'flex-end', marginTop: 12 },
  textLink: { fontSize: 13, color: '#111111', textDecorationLine: 'underline' },
  
  insightText: { fontSize: 14, color: '#111111', lineHeight: 22 },
  
  camScroll: { flexDirection: 'row', marginTop: 4 },
  camPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EFEFEF', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12, marginRight: 8 },
  camDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  camText: { fontSize: 12, color: '#111111', fontWeight: '500' },
  
  footer: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: '#EFEFEF', paddingTop: 16, marginTop: 16, marginBottom: 40 },
  footerText: { fontSize: 12, color: '#BBBBBB' },

  // Chart styles
  chartWrapper: { width: '100%' },
  legendContainer: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginLeft: 16 },
  legendBox: { width: 10, height: 10, borderRadius: 2, marginRight: 6 },
  legendText: { fontSize: 12, color: '#888888' },
});
