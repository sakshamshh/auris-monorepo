import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  ActivityIndicator, RefreshControl, TouchableOpacity
} from 'react-native';

const BASE_URL = 'https://auris.skymlabs.com';

export default function ReportScreen({ store }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadReport = async () => {
    try {
      setError(null);
      const res = await fetch(`${BASE_URL}/api/report`, {
        headers: {
          'X-Store-ID': store.store_id,
          'X-Password': store.password,
        }
      });
      if (!res.ok) throw new Error('Failed to load report');
      const data = await res.json();
      setReport(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadReport(); }, []);

  const onRefresh = () => { setRefreshing(true); loadReport(); };

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#A68B5B" />
      <Text style={styles.loadingText}>Generating AI report...</Text>
    </View>
  );

  if (error) return (
    <View style={styles.center}>
      <Text style={styles.errorText}>No report yet</Text>
      <Text style={styles.errorSub}>Report generates at 10pm daily</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={loadReport}>
        <Text style={styles.retryText}>Generate Now</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A68B5B" />
      }
    >
      <View style={styles.header}>
        <Text style={styles.date}>{report?.date || 'Today'}</Text>
        <Text style={styles.title}>Daily Intelligence Report</Text>
        <Text style={styles.storeName}>{store.store_name}</Text>
      </View>

      {(report?.report || report?.raw) && (
        <View style={styles.section}>
          <Text style={styles.sectionBody}>{report.report || report.raw}</Text>
        </View>
      )}

      {report?.sections?.map((section, i) => (
        <View key={i} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={styles.sectionBody}>{section.body}</Text>
        </View>
      ))}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#F5F5F7' },
  center:       { flex: 1, backgroundColor: '#F5F5F7', justifyContent: 'center', alignItems: 'center', padding: 32 },
  loadingText:  { color: '#86868B', marginTop: 16, fontSize: 13, fontWeight: '500' },
  errorText:    { color: '#1D1D1F', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  errorSub:     { color: '#86868B', fontSize: 14, marginBottom: 24, textAlign: 'center', fontWeight: '500' },
  retryBtn:     { backgroundColor: '#1D1D1F', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8 },
  retryText:    { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  header:       { padding: 24, paddingTop: 60, borderBottomWidth: 1, borderColor: 'rgba(0, 0, 0, 0.05)', marginBottom: 12, backgroundColor: 'rgba(255, 255, 255, 0.9)' },
  date:         { fontSize: 12, color: '#A68B5B', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, fontWeight: '700' },
  title:        { fontSize: 28, fontWeight: '800', color: '#1D1D1F', marginBottom: 6, letterSpacing: -0.5 },
  storeName:    { fontSize: 14, color: '#86868B', fontWeight: '500' },
  section:      { margin: 16, marginTop: 4, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.05, shadowRadius: 24, elevation: 5 },
  sectionTitle: { fontSize: 12, color: '#A68B5B', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16, fontWeight: '800' },
  sectionBody:  { fontSize: 16, color: '#1D1D1F', lineHeight: 26, fontWeight: '400' },
});
