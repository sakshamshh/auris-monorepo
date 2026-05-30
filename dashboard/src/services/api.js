import axios from 'axios';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = 'https://auris.skymlabs.com';
export const API_BASE = BASE_URL;
const api = axios.create({ baseURL: BASE_URL });

const storage = {
  async set(key, value) {
    if (Platform.OS === 'web') { localStorage.setItem(key, value); }
    else { await SecureStore.setItemAsync(key, value); }
  },
  async get(key) {
    if (Platform.OS === 'web') { return localStorage.getItem(key); }
    return await SecureStore.getItemAsync(key);
  },
  async delete(key) {
    if (Platform.OS === 'web') { localStorage.removeItem(key); }
    else { await SecureStore.deleteItemAsync(key); }
  }
};

export const login = async (store_id, password) => {
  const res = await api.post('/api/login', { store_id, password });
  await storage.set('store_id', store_id);
  await storage.set('password', password);
  await storage.set('store_name', res.data.store_name);
  if (res.data.plan) { await storage.set('plan', res.data.plan); }
  if (res.data.created_at) { await storage.set('created_at', res.data.created_at); }
  return { ...res.data, password };
};

export const requestPasswordReset = async (store_id) => {
  const res = await api.post('/api/auth/reset-request', { store_id });
  return res.data;
};

export const logout = async () => {
  await storage.delete('store_id');
  await storage.delete('password');
  await storage.delete('store_name');
  await storage.delete('plan');
  await storage.delete('created_at');
};

export const getSavedCredentials = async () => {
  const store_id = await storage.get('store_id');
  const password = await storage.get('password');
  const store_name = await storage.get('store_name');
  const plan = await storage.get('plan');
  const created_at = await storage.get('created_at');
  return store_id && password ? { store_id, password, store_name, plan: plan || 'retail', created_at } : null;
};

const authHeaders = (store_id, password) => ({
  'X-Store-ID': store_id,
  'X-Password': password,
});

export const fetchToday = async (store_id, password) => {
  const res = await api.get('/api/today', { headers: authHeaders(store_id, password) });
  return res.data;
};

export const fetchHourly = async (store_id, password) => {
  const res = await api.get('/api/hourly', { headers: authHeaders(store_id, password) });
  return res.data;
};

export const fetchZones = async (store_id, password) => {
  const res = await api.get('/api/zones', { headers: authHeaders(store_id, password) });
  return res.data;
};

export const fetchFactoryCameras = async (store_id, password) => {
  const res = await api.get('/api/factory/cameras/live', { headers: authHeaders(store_id, password) });
  return res.data;
};

export const fetchReport = async (store_id, password) => {
  const res = await api.get('/api/report', { headers: authHeaders(store_id, password) });
  return res.data;
};

// Spatial
export const fetchFloors = async (store_id, password) => {
  const res = await api.get('/api/spatial/floors', { headers: authHeaders(store_id, password) });
  return res.data;
};

export const fetchSpatialLive = async (store_id, password, floor_id = 'floor_0') => {
  const res = await api.get('/api/spatial/live', {
    headers: authHeaders(store_id, password),
    params: { floor_id },
  });
  return res.data;
};

export const fetchHeatmap = async (store_id, password, floor_id = 'floor_0', date) => {
  const res = await api.get('/api/spatial/heatmap', {
    headers: authHeaders(store_id, password),
    params: { floor_id, date },
  });
  return res.data;
};

export const fetchMapSvg = async (store_id, password, floor_id = 'floor_0') => {
  const res = await api.get('/api/spatial/map.svg', {
    headers: authHeaders(store_id, password),
    params: { floor_id },
    responseType: 'text',
  });
  return res.data;
};

// Calibration
export const fetchCalibrationSnapshot = async (store_id, password, camera_id) => {
  const res = await api.get('/api/calibration/snapshot', {
    headers: authHeaders(store_id, password),
    params: { store_id, camera_id },
  });
  return res.data;
};

export const fetchGCP = async (store_id, password, camera_id) => {
  const res = await api.get('/api/calibration/gcp', {
    headers: authHeaders(store_id, password),
    params: { store_id, camera_id },
  });
  return res.data;
};

export const saveGCP = async (store_id, password, body) => {
  const res = await api.post('/api/calibration/gcp', body, {
    headers: authHeaders(store_id, password),
  });
  return res.data;
};

export const solveHomography = async (store_id, password, camera_id, floor_id = 'floor_0') => {
  const res = await api.post('/api/calibration/solve', null, {
    headers: authHeaders(store_id, password),
    params: { store_id, camera_id, floor_id },
  });
  return res.data;
};

export const fetchCalibrationStatus = async (store_id, password) => {
  const res = await api.get('/api/calibration/status', {
    headers: authHeaders(store_id, password),
    params: { store_id },
  });
  return res.data;
};

// Alerts
export const fetchAlertHistory = async (store_id, password, limit = 50) => {
  const res = await api.get('/api/alerts/history', {
    headers: authHeaders(store_id, password),
    params: { limit },
  });
  return res.data;
};

// Training (admin)
export const fetchHardCases = async (adminKey, store_id, status = 'pending') => {
  const res = await api.get('/api/training/hard-cases', {
    headers: { 'X-Admin-Key': adminKey },
    params: { store_id, status },
  });
  return res.data;
};

export const reviewHardCase = async (adminKey, case_id, action) => {
  const res = await api.post('/api/training/review', { case_id, action }, {
    headers: { 'X-Admin-Key': adminKey },
  });
  return res.data;
};

export const fetchTrainingStats = async (adminKey) => {
  const res = await api.get('/api/training/stats', {
    headers: { 'X-Admin-Key': adminKey },
  });
  return res.data;
};

// Factory and Retail API Integrations
export const fetchDeadtime = async (store_id, password, from_date, to_date, shift_id) => {
  const res = await api.get('/api/factory/deadtime', {
    headers: authHeaders(store_id, password),
    params: { from_date, to_date, shift_id },
  });
  return res.data;
};

export const fetchBottleneck = async (store_id, password) => {
  const res = await api.get('/api/factory/bottleneck', {
    headers: authHeaders(store_id, password),
  });
  return res.data;
};

export const fetchPatterns = async (store_id, password) => {
  const res = await api.get('/api/factory/patterns', {
    headers: authHeaders(store_id, password),
  });
  return res.data;
};

export const fetchRetailFootfall = async (store_id, password) => {
  const res = await api.get('/api/retail/footfall', {
    headers: authHeaders(store_id, password),
  });
  return res.data;
};

export const fetchRetailFootfallHistory = async (store_id, password) => {
  const res = await api.get('/api/retail/footfall/history', {
    headers: authHeaders(store_id, password),
  });
  return res.data;
};

export const fetchRetailReport = async (store_id, password) => {
  const res = await api.get('/api/retail/report', {
    headers: authHeaders(store_id, password),
  });
  return res.data;
};
