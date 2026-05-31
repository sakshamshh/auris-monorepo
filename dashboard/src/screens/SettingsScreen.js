import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Dimensions, Platform } from 'react-native';

const screenWidth = Dimensions.get('window').width;

export default function SettingsScreen({ store, onLogout }) {
  const [shiftStart, setShiftStart] = useState('09:00');
  const [shiftEnd, setShiftEnd] = useState('18:00');
  const [workerCount, setWorkerCount] = useState('45');
  const [workingDays, setWorkingDays] = useState('Mon–Sat');
  const [wageRate, setWageRate] = useState('250');
  
  const [dvrPass, setDvrPass] = useState('password123');
  const [phone, setPhone] = useState('+91 98765 43210');
  const [briefOn, setBriefOn] = useState(true);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Settings</Text>
      
      {/* Card 1: Config */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>FACTORY CONFIGURATION</Text>
        <View style={styles.divider} />
        <View style={styles.gridRow}>
          <View style={styles.colHalf}>
            <Text style={styles.label}>Shift Start</Text>
            <TextInput style={styles.input} value={shiftStart} onChangeText={setShiftStart} />
          </View>
          <View style={styles.colHalf}>
            <Text style={styles.label}>Shift End</Text>
            <TextInput style={styles.input} value={shiftEnd} onChangeText={setShiftEnd} />
          </View>
        </View>
        <View style={styles.gridRow}>
          <View style={styles.colHalf}>
            <Text style={styles.label}>Worker Count</Text>
            <TextInput style={styles.input} value={workerCount} onChangeText={setWorkerCount} keyboardType="numeric" />
          </View>
          <View style={styles.colHalf}>
            <Text style={styles.label}>Working Days</Text>
            <TextInput style={styles.input} value={workingDays} onChangeText={setWorkingDays} />
          </View>
        </View>
        <View style={styles.gridRow}>
          <View style={styles.colHalf}>
            <Text style={styles.label}>Wage Rate ₹/hr</Text>
            <TextInput style={styles.input} value={wageRate} onChangeText={setWageRate} keyboardType="numeric" />
          </View>
          <View style={styles.colHalf} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 }}>
          <TouchableOpacity style={[styles.btnSec, { marginRight: 12 }]}><Text style={styles.btnSecText}>Discard</Text></TouchableOpacity>
          <TouchableOpacity style={styles.btnPri}><Text style={styles.btnPriText}>Save Changes</Text></TouchableOpacity>
        </View>
      </View>

      {/* Card 2: DVR */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>DVR / NVR AUTHENTICATION</Text>
        <View style={styles.divider} />
        <View style={{ flexDirection: screenWidth > 768 ? 'row' : 'column', alignItems: screenWidth > 768 ? 'center' : 'flex-start' }}>
          <Text style={[styles.label, { width: 120, marginBottom: screenWidth > 768 ? 0 : 8 }]}>Stream Password</Text>
          <TextInput style={[styles.input, { flex: 1, marginRight: screenWidth > 768 ? 12 : 0, marginBottom: screenWidth > 768 ? 0 : 12 }]} value={dvrPass} onChangeText={setDvrPass} secureTextEntry />
          <TouchableOpacity style={[styles.btnSec, { alignSelf: screenWidth > 768 ? 'auto' : 'flex-end' }]}><Text style={styles.btnSecText}>Update</Text></TouchableOpacity>
        </View>
        <Text style={styles.helperText}>Used to access camera streams on your local network</Text>
      </View>

      {/* Card 3: Edge */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>EDGE COMPUTE NODE</Text>
        <View style={styles.divider} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#111111' }}>Auris-Node-Alpha</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#1A7F4B', marginRight: 6 }} />
            <Text style={{ fontSize: 13, color: '#111111' }}>Online</Text>
          </View>
        </View>
        <Text style={{ fontSize: 13, color: '#888888', marginTop: 4 }}>Last seen 2 minutes ago</Text>
        <TouchableOpacity style={[styles.btnSec, { width: '100%', marginTop: 16 }]}><Text style={styles.btnSecText}>Restart Node</Text></TouchableOpacity>
        <Text style={[styles.helperText, { marginTop: 8 }]}>This will temporarily interrupt camera processing for 30–60 seconds.</Text>
      </View>

      {/* Card 4: Notifications */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
        <View style={styles.divider} />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <Text style={[styles.label, { width: 140 }]}>WhatsApp Number</Text>
          <TextInput style={[styles.input, { flex: 1 }]} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity 
            style={[styles.toggleTrack, briefOn ? styles.toggleTrackOn : styles.toggleTrackOff]} 
            onPress={() => setBriefOn(!briefOn)}
            activeOpacity={1}
          >
            <View style={[styles.toggleThumb, briefOn ? styles.toggleThumbOn : styles.toggleThumbOff]} />
          </TouchableOpacity>
          <Text style={{ fontSize: 14, color: '#111111', marginLeft: 12 }}>Receive nightly brief on WhatsApp</Text>
        </View>
        <Text style={[styles.helperText, { marginTop: 8 }]}>Sent every night at 9 PM with dead cost summary and zone performance.</Text>
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
  content: { padding: Platform.OS === 'web' && Dimensions.get('window').width > 768 ? 40 : 20, maxWidth: 800, marginHorizontal: 'auto', width: '100%' },
  
  pageTitle: { fontSize: 24, fontWeight: '600', color: '#111111', marginBottom: 28 },
  
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#EFEFEF', padding: 20, marginBottom: 24 },
  sectionLabel: { fontSize: 11, fontWeight: '500', color: '#BBBBBB', textTransform: 'uppercase', letterSpacing: 0.8 },
  divider: { height: 1, backgroundColor: '#EFEFEF', marginTop: 12, marginBottom: 20 },
  
  gridRow: { flexDirection: screenWidth > 768 ? 'row' : 'column', marginHorizontal: -8, marginBottom: 16 },
  colHalf: { flex: 1, paddingHorizontal: 8, marginBottom: screenWidth > 768 ? 0 : 16 },
  
  label: { fontSize: 12, fontWeight: '500', color: '#111111', marginBottom: 6 },
  input: { width: '100%', height: 40, borderWidth: 1, borderColor: '#EFEFEF', borderRadius: 8, paddingHorizontal: 12, fontSize: 14, color: '#111111' },
  
  btnPri: { backgroundColor: '#111111', borderRadius: 8, height: 36, justifyContent: 'center', paddingHorizontal: 16 },
  btnPriText: { color: '#FFFFFF', fontSize: 14, fontWeight: '500' },
  btnSec: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#111111', borderRadius: 8, height: 36, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  btnSecText: { color: '#111111', fontSize: 14, fontWeight: '500' },
  
  helperText: { fontSize: 12, color: '#BBBBBB', marginTop: 8 },
  
  toggleTrack: { width: 40, height: 24, borderRadius: 12, justifyContent: 'center', padding: 2 },
  toggleTrackOn: { backgroundColor: '#111111' },
  toggleTrackOff: { backgroundColor: '#DDDDDD' },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF' },
  toggleThumbOn: { transform: [{ translateX: 16 }] },
  toggleThumbOff: { transform: [{ translateX: 0 }] },
  
  trHeader: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 10, borderBottomWidth: 1, borderColor: '#EFEFEF' },
  th: { fontSize: 11, fontWeight: '500', color: '#BBBBBB', textTransform: 'uppercase' },
  tr: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#EFEFEF', alignItems: 'center' },
  td: { fontSize: 14, color: '#111111' },
  
  statusPill: { borderRadius: 20, paddingVertical: 2, paddingHorizontal: 10, alignSelf: 'flex-start' },
  statusText: { fontSize: 12, fontWeight: '500' },
  
  footer: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: '#EFEFEF', paddingTop: 16, marginTop: 16, marginBottom: 40 },
  footerText: { fontSize: 12, color: '#BBBBBB' },
});
