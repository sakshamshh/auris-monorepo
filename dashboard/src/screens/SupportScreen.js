import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Dimensions, Platform } from 'react-native';

const screenWidth = Dimensions.get('window').width;

export default function SupportScreen({ navigation }) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      
      {/* Back Link pseudo-navbar element */}
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backLink}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <View style={styles.header}>
        <Text style={styles.pageTitle}>Support</Text>
        <Text style={styles.pageSubtitle}>We usually respond within a few hours.</Text>
      </View>

      {/* Card 1: Email */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>EMAIL US</Text>
        <TouchableOpacity>
          <Text style={styles.mailto}>support@skymlabs.com</Text>
        </TouchableOpacity>
        <Text style={styles.helperText}>For faster help, mention your Store ID in the subject line.</Text>
      </View>

      {/* Card 2: Send Message */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>SEND A MESSAGE</Text>
        
        <Text style={[styles.label, { marginTop: 16 }]}>Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} />
        
        <Text style={[styles.label, { marginTop: 16 }]}>Message</Text>
        <TextInput 
          style={[styles.input, { height: 120, paddingTop: 12, textAlignVertical: 'top' }]} 
          value={message} 
          onChangeText={setMessage} 
          multiline
          numberOfLines={5}
          placeholder="Describe the issue you're experiencing..."
          placeholderTextColor="#BBBBBB"
        />

        <TouchableOpacity style={styles.btnPri}>
          <Text style={styles.btnPriText}>Send Message</Text>
        </TouchableOpacity>
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
  content: { padding: Platform.OS === 'web' && Dimensions.get('window').width > 768 ? 40 : 20, maxWidth: 600, marginHorizontal: 'auto', width: '100%' },
  
  backLink: { marginBottom: 24, alignSelf: 'flex-start' },
  backText: { fontSize: 13, color: '#888888' },

  header: { marginBottom: 28 },
  pageTitle: { fontSize: 24, fontWeight: '600', color: '#111111' },
  pageSubtitle: { fontSize: 14, color: '#888888', marginTop: 4 },
  
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#EFEFEF', padding: 20, marginBottom: 24 },
  sectionLabel: { fontSize: 11, fontWeight: '500', color: '#BBBBBB', textTransform: 'uppercase', letterSpacing: 0.8 },
  
  mailto: { fontSize: 18, fontWeight: '600', color: '#111111', marginTop: 16, textDecorationLine: 'underline' },
  helperText: { fontSize: 13, color: '#888888', marginTop: 8 },

  label: { fontSize: 12, fontWeight: '500', color: '#111111', marginBottom: 6 },
  input: { width: '100%', height: 44, borderWidth: 1, borderColor: '#EFEFEF', borderRadius: 8, paddingHorizontal: 12, fontSize: 14, color: '#111111' },
  
  btnPri: { width: '100%', backgroundColor: '#111111', borderRadius: 8, height: 44, justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  btnPriText: { color: '#FFFFFF', fontSize: 14, fontWeight: '500' },
  
  footer: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: '#EFEFEF', paddingTop: 16, marginTop: 16, marginBottom: 40 },
  footerText: { fontSize: 12, color: '#BBBBBB' },
});
