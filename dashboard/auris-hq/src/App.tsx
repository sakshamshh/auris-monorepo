/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  LayoutDashboard, 
  Map as MapIcon, 
  Settings, 
  LogOut, 
  Hexagon, 
  Users, 
  Video, 
  Radar, 
  Flame, 
  ShieldCheck, 
  TrendingUp, 
  Activity, 
  Camera, 
  Layers, 
  Move, 
  RotateCw, 
  Maximize2, 
  FileUp, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  Cpu, 
  Lock, 
  User, 
  FileText,
  RefreshCw,
  Eye,
  EyeOff,
  Search,
  Check,
  Copy,
  Play,
  ChevronRight,
  Database,
  AlertTriangle,
  Globe,
  LayoutGrid
} from 'lucide-react';

import FactoryOnboarding from '../../src/pages/FactoryOnboarding';
import FactoryDashboard from '../../src/pages/FactoryDashboard';
import { useDropzone } from 'react-dropzone';

// --- CONFIGURATION ---
const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE = IS_DEV ? 'http://localhost:8000' : 'https://auris.skymlabs.com';
const ADMIN_KEY = 'dcd62cb40e5fa0870d73c79fbd521d05';

// --- TYPES ---
type Tab = 'overview' | 'management' | 'mapping' | 'calibration' | 'report' | 'training' | 'factory' | 'factory_analytics';

interface Store {
  store_id: string;
  store_name: string;
  status: 'online' | 'offline';
  cameras_count: number;
  last_blob: string;
  calibrated: boolean;
  plan: 'retail' | 'factory';
}

interface Track {
  track_id: string;
  x_meters: number;
  y_meters: number;
  floor: string;
  camera_id: string;
  last_seen: string;
  warning?: boolean;
}

// --- ERROR BOUNDARY ---
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) return (
      <div style={{padding:32,color:'#DC2626'}}>
        Analytics failed to load. Try selecting a different client.
      </div>
    );
    return this.props.children;
  }
}

// --- RETAIL ANALYTICS ---
const RetailAnalytics = ({ storeId }: { storeId: string }) => {
  const [data, setData] = useState<{ today_total: number; peak_hour: string; seven_day_total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchFootfall = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE}/api/retail/footfall`, {
          headers: {
            'X-Store-ID': storeId,
            'X-Password': 'auris123'
          }
        });
        const historyRes = await fetch(`${API_BASE}/api/retail/footfall/history`, {
          headers: {
            'X-Store-ID': storeId,
            'X-Password': 'auris123'
          }
        });

        if (!res.ok) throw new Error("Failed to load footfall metrics");
        const footfallData = await res.json();
        
        let sevenDayTotal = 0;
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          const daily = historyData.daily || [];
          const last7 = daily.slice(-7);
          sevenDayTotal = last7.reduce((sum: number, day: any) => sum + (day.visitors || 0), 0);
        } else {
          sevenDayTotal = footfallData.today_total * 7;
        }

        setData({
          today_total: footfallData.today_total,
          peak_hour: footfallData.peak_hour,
          seven_day_total: sevenDayTotal
        });
      } catch (err) {
        console.error(err);
        setError("No retail data available yet");
      } finally {
        setLoading(false);
      }
    };

    if (storeId) {
      fetchFootfall();
    }
  }, [storeId]);

  if (loading) {
    return <div className="p-8 text-sm text-[#6B7280]">Loading retail analytics...</div>;
  }

  if (error || !data) {
    return (
      <div className="p-8 text-sm text-[#DC2626] font-medium border border-red-200 bg-red-50 rounded-lg">
        {error || "No retail data available yet"}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-bold text-[#111827] uppercase tracking-widest border-b border-[#E5E7EB] pb-2">Footfall Analytics</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="p-5 border border-[#E5E7EB] rounded-lg bg-white shadow-sm">
          <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider block">Today's Visitors</span>
          <span className="text-3xl font-bold text-[#1A3C5E] mt-2 block">{data.today_total}</span>
        </div>
        <div className="p-5 border border-[#E5E7EB] rounded-lg bg-white shadow-sm">
          <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider block">Peak Hour</span>
          <span className="text-2xl font-bold text-gray-800 mt-2 block">{data.peak_hour}</span>
        </div>
        <div className="p-5 border border-[#E5E7EB] rounded-lg bg-white shadow-sm">
          <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider block">7-Day Total</span>
          <span className="text-3xl font-bold text-gray-800 mt-2 block">{data.seven_day_total}</span>
        </div>
      </div>
    </div>
  );
};

// --- OVERVIEW PAGE (replaces MissionControl) ---
const OverviewPage = ({ 
  onSelectStore, 
  onSelectRegistryClient 
}: { 
  onSelectStore: (id: string) => void;
  onSelectRegistryClient: (id: string) => void;
}) => {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(30);

  const fetchTelemetry = async () => {
    try {
      const storesRes = await fetch(`${API_BASE}/admin/stores`, {
        headers: { 'X-Admin-Key': ADMIN_KEY }
      });
      if (!storesRes.ok) throw new Error("Failed to load stores");
      const storesData = await storesRes.json();

      let configsData = { configs: [] };
      try {
        const configsRes = await fetch(`${API_BASE}/api/factory/configs`, {
          headers: { 'X-Admin-Key': ADMIN_KEY }
        });
        if (configsRes.ok) {
          configsData = await configsRes.json();
        }
      } catch (err) {
        console.error("Failed to load factory configs in overwatch", err);
      }

      const merged = (storesData.stores || []).map((store: any) => {
        const config = configsData.configs.find((c: any) => c.store_id === store.store_id);
        const plan = config ? 'FACTORY' : (store.store_id.includes('retail') ? 'RETAIL' : 'PILOT');
        const status = config ? config.status : 'live';
        
        let statusColor = 'gray';
        if (status === 'suspended' || status === 'pending') {
          statusColor = 'red';
        } else if (status === 'live') {
          if (!store.last_blob) {
            statusColor = 'gray';
          } else {
            const lastBlobDate = new Date(store.last_blob);
            const diffMs = Date.now() - lastBlobDate.getTime();
            const diffMins = diffMs / (1000 * 60);
            if (diffMins < 10) {
              statusColor = 'green';
            } else {
              statusColor = 'amber';
            }
          }
        }

        return {
          ...store,
          plan,
          status,
          statusColor,
          factoryConfig: config || null
        };
      });

      setClients(merged);
    } catch (e) {
      console.error("Failed to load overwatch telemetry:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
    
    const refreshInterval = setInterval(() => {
      fetchTelemetry();
      setTimeLeft(30);
    }, 30000);

    const countdownInterval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) return 30;
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(refreshInterval);
      clearInterval(countdownInterval);
    };
  }, []);

  const formatLastActivity = (timestamp: string | null) => {
    if (!timestamp) return "no data yet";
    const date = new Date(timestamp);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hr${diffHours > 1 ? 's' : ''} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  const totalClients = clients.length;
  const liveCount = clients.filter(c => c.statusColor === 'green').length;
  const pendingCount = clients.filter(c => c.status === 'pending' || c.statusColor === 'amber').length;
  const offlineCount = clients.filter(c => c.statusColor === 'red' || (c.statusColor === 'gray' && c.status !== 'pending')).length;

  return (
    <div className="h-full flex flex-col bg-white">
      <header className="flex justify-between items-center mb-8 pb-4 border-b border-[#E5E7EB]">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Overview</h1>
          <p className="text-sm text-[#6B7280]">Real-time system telemetry and client directories.</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-[#E5E7EB] text-xs text-[#6B7280] font-medium bg-[#F8F9FA]">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#1A3C5E]" />
          Refreshes in <span className="text-[#1A3C5E] font-bold">{timeLeft}s</span>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="p-5 border border-[#E5E7EB] rounded-lg bg-white shadow-sm">
          <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider block">Total Clients</span>
          <span className="text-3xl font-bold text-[#111827] mt-2 block">{totalClients}</span>
        </div>
        <div className="p-5 border border-[#E5E7EB] rounded-lg bg-white shadow-sm">
          <span className="text-xs font-semibold text-[#16A34A] uppercase tracking-wider block">Live</span>
          <span className="text-3xl font-bold text-[#16A34A] mt-2 block">{liveCount}</span>
        </div>
        <div className="p-5 border border-[#E5E7EB] rounded-lg bg-white shadow-sm">
          <span className="text-xs font-semibold text-[#CA8A04] uppercase tracking-wider block">Pending</span>
          <span className="text-3xl font-bold text-[#CA8A04] mt-2 block">{pendingCount}</span>
        </div>
        <div className="p-5 border border-[#E5E7EB] rounded-lg bg-white shadow-sm">
          <span className="text-xs font-semibold text-[#DC2626] uppercase tracking-wider block">Offline</span>
          <span className="text-3xl font-bold text-[#DC2626] mt-2 block">{offlineCount}</span>
        </div>
      </div>

      {/* Clients Table */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-[#6B7280]">
          <RefreshCw className="w-6 h-6 animate-spin mr-2 text-[#1A3C5E]" />
          Loading client telemetry...
        </div>
      ) : (
        <div className="border border-[#E5E7EB] rounded-lg overflow-hidden bg-white shadow-sm">
          <table className="min-w-full divide-y divide-[#E5E7EB]">
            <thead className="bg-[#F8F9FA]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Store ID</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Plan</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Last Active</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-[#E5E7EB] text-sm">
              {clients.map(client => (
                <tr key={client.store_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-[#111827]">{client.store_name}</td>
                  <td className="px-6 py-4 font-mono text-[#6B7280]">{client.store_id}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
                      client.plan === 'FACTORY' 
                        ? 'bg-blue-50 text-blue-700' 
                        : 'bg-green-50 text-green-700'
                    }`}>
                      {client.plan}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${
                        client.statusColor === 'green' ? 'bg-[#16A34A]' :
                        client.statusColor === 'amber' ? 'bg-[#CA8A04]' : 'bg-[#DC2626]'
                      }`} />
                      <span className="capitalize text-xs font-medium text-[#374151]">
                        {client.statusColor === 'green' ? 'Online' :
                         client.statusColor === 'amber' ? 'Warning' : 'Offline'}
                      </span>
                    </span>
                  </td>
                  <td className="px-6 py-4 text-[#6B7280] font-mono text-xs">{formatLastActivity(client.last_blob)}</td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => onSelectRegistryClient(client.store_id)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1A3C5E] rounded-lg hover:opacity-90 transition-opacity"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// --- CLIENTS PAGE (replaces ManagementTab) ---
const ClientsPage = ({ 
  onSelectStore, 
  initialSelectedClient, 
  clearInitialClient 
}: { 
  onSelectStore: (id: string) => void;
  initialSelectedClient?: string | null;
  clearInitialClient?: () => void;
}) => {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [clientTab, setClientTab] = useState<'overview' | 'system' | 'analytics'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addStep, setAddStep] = useState<1 | 2 | 'success'>(1);
  const [isStoreIdAuto, setIsStoreIdAuto] = useState(true);
  const [addForm, setAddForm] = useState({
    store_id: '',
    store_name: '',
    city: '',
    plan: 'FACTORY' as 'FACTORY' | 'RETAIL' | 'PILOT',
    password: '',
    numShifts: 2,
    shifts: [
      { label: 'Day Shift', startTime: '09:00', endTime: '17:00', days: { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: true, Sun: false } },
      { label: 'Night Shift', startTime: '17:00', endTime: '01:00', days: { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: true, Sun: false } },
      { label: 'Third Shift', startTime: '01:00', endTime: '09:00', days: { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: true, Sun: false } }
    ],
    totalHeadcount: 10,
    operatorWage: 120,
    supervisorWage: 250,
    contractorWage: 180,
    whatsAppNumber: ''
  });
  
  const [createdCredentials, setCreatedCredentials] = useState<any>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [detailedStore, setDetailedStore] = useState<any>(null);
  const [retailFootfall, setRetailFootfall] = useState<any>(null);
  const [revealKey, setRevealKey] = useState(false);
  
  const [showEditCamerasModal, setShowEditCamerasModal] = useState(false);
  const [editCamerasList, setEditCamerasList] = useState<any[]>([]);

  // Edge camera state (System tab)
  const [edgeCameras, setEdgeCameras] = useState<any[]>([]);
  const [edgeCamerasLoading, setEdgeCamerasLoading] = useState(false);

  // Password reset inline form state
  const [inlineNewPassword, setInlineNewPassword] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  /** Mask the password portion of an RTSP URL: rtsp://user:pass@host → rtsp://user:****@host */
  const maskRtspPassword = (url: string): string => {
    if (!url) return url;
    return url.replace(
      /^(rtsp:\/\/[^:]+):([^@]+)@/,
      '$1:****@'
    );
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (initialSelectedClient) {
      setSelectedClient(initialSelectedClient);
      setClientTab('overview');
      if (clearInitialClient) clearInitialClient();
    }
  }, [initialSelectedClient]);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const storesRes = await fetch(`${API_BASE}/admin/stores`, {
        headers: { 'X-Admin-Key': ADMIN_KEY }
      });
      if (!storesRes.ok) throw new Error("Failed to load stores");
      const storesData = await storesRes.json();
      
      let configsData = { configs: [] };
      try {
        const configsRes = await fetch(`${API_BASE}/api/factory/configs`, {
          headers: { 'X-Admin-Key': ADMIN_KEY }
        });
        if (configsRes.ok) {
          configsData = await configsRes.json();
        }
      } catch (err) {
        console.error("Failed to load factory configs", err);
      }
      
      const merged = (storesData.stores || []).map((store: any) => {
        const config = configsData.configs.find((c: any) => c.store_id === store.store_id);
        return {
          ...store,
          plan: config ? 'FACTORY' : (store.store_id.includes('retail') ? 'RETAIL' : 'PILOT'),
          status: config ? config.status : 'live',
          factoryConfig: config || null
        };
      });
      
      setClients(merged);
    } catch (error: any) {
      showToast(error.message || "Failed to load clients index", 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  // Fetch edge cameras whenever we switch to the System tab for a FACTORY client
  useEffect(() => {
    setEdgeCameras([]);
    if (!selectedClient || clientTab !== 'system') return;
    const client = clients.find(c => c.store_id === selectedClient);
    if (!client || client.plan !== 'FACTORY') return;
    const apiKey = detailedStore?.api_key || client?.api_key;
    if (!apiKey) return;

    const fetchEdgeCameras = async () => {
      setEdgeCamerasLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/edge/config`, {
          headers: { 'X-API-Key': apiKey }
        });
        if (res.ok) {
          const data = await res.json();
          setEdgeCameras(data.cameras || []);
        }
      } catch (err) {
        console.error('Failed to load edge cameras', err);
      } finally {
        setEdgeCamerasLoading(false);
      }
    };
    fetchEdgeCameras();
  }, [selectedClient, clientTab, detailedStore]);

  useEffect(() => {
    if (!selectedClient) {
      setDetailedStore(null);
      setRetailFootfall(null);
      setRevealKey(false);
      setInlineNewPassword('');
      setEdgeCameras([]);
      return;
    }
    
    const fetchStoreDetails = async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/stores/${selectedClient}`, {
          headers: { 'X-Admin-Key': ADMIN_KEY }
        });
        if (res.ok) {
          const data = await res.json();
          setDetailedStore(data);
        }
      } catch (err) {
        console.error("Failed to load store details", err);
      }
    };
    
    fetchStoreDetails();
    setInlineNewPassword('');
    
    const client = clients.find(c => c.store_id === selectedClient);
    if (!client) return;
    
    if (client.plan === 'RETAIL') {
      const fetchFootfall = async () => {
        try {
          const res = await fetch(`${API_BASE}/api/retail/footfall`, {
            headers: {
              'X-Store-ID': selectedClient,
              'X-Password': 'auris123'
            }
          });
          if (res.ok) {
            const data = await res.json();
            setRetailFootfall(data);
          }
        } catch (err) {
          console.error("Failed to load footfall metrics", err);
        }
      };
      fetchFootfall();
    }
  }, [selectedClient, clients]);

  const handleResetPasswordInline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineNewPassword.trim()) {
      showToast("Password cannot be empty", 'error');
      return;
    }
    setIsResettingPassword(true);
    try {
      const res = await fetch(`${API_BASE}/admin/stores/${selectedClient}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': ADMIN_KEY
        },
        body: JSON.stringify({ password: inlineNewPassword.trim() })
      });
      if (!res.ok) throw new Error("Failed to reset password");
      showToast("Password updated successfully!", 'success');
      setInlineNewPassword('');
    } catch (err: any) {
      showToast(err.message || "Failed to reset password", 'error');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleMarkLive = async () => {
    if (!window.confirm(`Mark ${selectedClientData?.store_name || selectedClient} as LIVE? This will start the 30-day trial.`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/factory/config`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': ADMIN_KEY
        },
        body: JSON.stringify({
          store_id: selectedClient,
          status: 'live'
        })
      });
      if (!res.ok) throw new Error("Failed to mark LIVE");

      // Refresh both the client list AND the detail panel
      await fetchClients();
      const detailRes = await fetch(`${API_BASE}/admin/stores/${selectedClient}`, {
        headers: { 'X-Admin-Key': ADMIN_KEY }
      });
      if (detailRes.ok) setDetailedStore(await detailRes.json());

      showToast("✅ Client is now LIVE!", 'success');
    } catch (err: any) {
      showToast(err.message || "Failed to mark live", 'error');
    }
  };

  const handleDeleteClient = async () => {
    if (!window.confirm(`Are you absolutely sure you want to delete ${selectedClient}? This is permanent.`)) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/admin/stores/${selectedClient}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Key': ADMIN_KEY }
      });
      if (!res.ok) throw new Error("Failed to delete client");
      
      showToast("Client deleted successfully", 'success');
      setSelectedClient(null);
      fetchClients();
    } catch (err: any) {
      showToast(err.message || "Failed to delete client", 'error');
    }
  };

  const handleSaveCameras = async () => {
    for (const cam of editCamerasList) {
      if (!cam.label.trim()) {
        showToast("Label is required for all cameras", 'error');
        return;
      }
      if (!cam.rtsp_url.trim()) {
        showToast("RTSP URL is required for all cameras", 'error');
        return;
      }
    }

    try {
      const res = await fetch(`${API_BASE}/api/factory/cameras/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': ADMIN_KEY
        },
        body: JSON.stringify({
          store_id: selectedClient,
          cameras: editCamerasList
        })
      });

      if (!res.ok) throw new Error("Failed to save camera configuration");

      showToast("Camera configuration saved successfully!", 'success');
      setShowEditCamerasModal(false);
      fetchClients();
    } catch (err: any) {
      showToast(err.message || "Failed to save camera config", 'error');
    }
  };

  const filteredClients = clients.filter(c => 
    c.store_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.store_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedClientData = clients.find(c => c.store_id === selectedClient);

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Toast Banner */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg border text-sm font-medium transition-all ${
          toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {toast.message}
        </div>
      )}

      <header className="flex justify-between items-center mb-8 pb-4 border-b border-[#E5E7EB]">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Clients</h1>
          <p className="text-sm text-[#6B7280]">Registry and workspace management for client configurations.</p>
        </div>
        <button 
          onClick={() => {
            setAddForm({
              store_id: '',
              store_name: '',
              city: '',
              plan: 'FACTORY',
              password: '',
              numShifts: 2,
              shifts: [
                { label: 'Day Shift', startTime: '09:00', endTime: '17:00', days: { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: true, Sun: false } },
                { label: 'Night Shift', startTime: '17:00', endTime: '01:00', days: { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: true, Sun: false } },
                { label: 'Third Shift', startTime: '01:00', endTime: '09:00', days: { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: true, Sun: false } }
              ],
              totalHeadcount: 10,
              operatorWage: 120,
              supervisorWage: 250,
              contractorWage: 180,
              whatsAppNumber: ''
            });
            setAddStep(1);
            setIsStoreIdAuto(true);
            setShowAddModal(true);
          }}
          className="px-4 py-2 font-medium text-white bg-[#1A3C5E] hover:opacity-90 rounded-lg transition-opacity flex items-center gap-1.5 text-sm"
        >
          <Plus className="w-4 h-4" /> Add Client
        </button>
      </header>

      {/* Split Layout */}
      <div className="flex-1 flex gap-8 min-h-0 overflow-hidden">
        {/* Left Side Client Selector */}
        <div className="w-64 flex flex-col border-r border-[#E5E7EB] pr-6 flex-shrink-0">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
            <input 
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search clients..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1A3C5E]"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-1">
            {filteredClients.map(client => {
              const isSelected = selectedClient === client.store_id;
              return (
                <button
                  key={client.store_id}
                  onClick={() => {
                    setSelectedClient(client.store_id);
                    setClientTab('overview');
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between transition-colors ${
                    isSelected 
                      ? 'bg-blue-50 border-l-4 border-[#1A3C5E] font-medium' 
                      : 'hover:bg-gray-50 border-l-4 border-transparent'
                  }`}
                >
                  <div className="truncate pr-2">
                    <div className="text-sm font-medium text-[#111827] truncate">{client.store_name}</div>
                    <div className="text-xs text-[#6B7280] font-mono truncate">{client.store_id}</div>
                  </div>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    client.status === 'live' ? 'bg-[#16A34A]' : 'bg-[#CA8A04]'
                  }`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Side Client Details */}
        <div className="flex-1 overflow-y-auto pl-2">
          {!selectedClient ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 border border-dashed border-gray-200 rounded-lg bg-gray-50">
              <Users className="w-12 h-12 text-[#6B7280]/40 mb-3" />
              <h3 className="text-sm font-semibold text-[#111827] uppercase">No Client Selected</h3>
              <p className="text-xs text-[#6B7280] max-w-xs mt-1">Select a client from the registry listing on the left to view profile and hardware details.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Tab Navigation */}
              <div className="flex gap-4 border-b border-[#E5E7EB] pb-px">
                {(['overview', 'system', 'analytics'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setClientTab(tab)}
                    className={`pb-3 text-sm font-semibold uppercase tracking-wider border-b-2 transition-all ${
                      clientTab === tab 
                        ? 'border-[#1A3C5E] text-[#1A3C5E]' 
                        : 'border-transparent text-[#6B7280] hover:text-[#111827]'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              {clientTab === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                  {/* Left Column: Metadata */}
                  <div className="border border-[#E5E7EB] rounded-lg p-5 bg-white space-y-4">
                    <h3 className="text-xs font-bold text-[#111827] uppercase tracking-widest border-b border-[#E5E7EB] pb-2">Client Details</h3>
                    <div className="grid grid-cols-2 gap-y-3 text-sm">
                      <span className="text-[#6B7280]">Store Name</span>
                      <span className="font-semibold text-[#111827] text-right">{selectedClientData?.store_name}</span>

                      <span className="text-[#6B7280]">Store ID</span>
                      <span className="font-mono text-[#111827] text-right">{selectedClientData?.store_id}</span>

                      <span className="text-[#6B7280]">Plan</span>
                      <span className="font-semibold text-[#1A3C5E] text-right">{selectedClientData?.plan}</span>

                      <span className="text-[#6B7280]">City</span>
                      <span className="text-[#111827] text-right">{selectedClientData?.factoryConfig?.city || selectedClientData?.city || 'Chennai'}</span>

                      <span className="text-[#6B7280]">Status</span>
                      <span className="font-semibold text-right flex items-center justify-end gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${
                          selectedClientData?.status === 'live' ? 'bg-[#16A34A]' : 'bg-[#CA8A04]'
                        }`} />
                        <span className="uppercase text-xs">{selectedClientData?.status || 'Offline'}</span>
                      </span>

                      <span className="text-[#6B7280]">Trial dates</span>
                      <span className="text-xs text-[#111827] text-right">
                        {(() => {
                          const startStr = selectedClientData?.created_at || selectedClientData?.factoryConfig?.trial_start;
                          if (!startStr) return 'N/A';
                          const start = new Date(startStr);
                          const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
                          return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
                        })()}
                      </span>
                    </div>
                  </div>

                  {/* Right Column: Actions */}
                  <div className="space-y-6">
                    {/* Active stacked actions */}
                    <div className="border border-[#E5E7EB] rounded-lg p-5 bg-white space-y-4">
                      <h3 className="text-xs font-bold text-[#111827] uppercase tracking-widest border-b border-[#E5E7EB] pb-2">Workspace Actions</h3>
                      <div className="flex flex-col gap-3">
                        <button
                          onClick={() => window.open("https://auris.skymlabs.com", "_blank")}
                          className="w-full py-2 px-4 bg-[#1A3C5E] text-white font-medium rounded-lg hover:opacity-90 transition-opacity text-sm text-center block"
                        >
                          View Client Dashboard
                        </button>
                        
                        {selectedClientData?.plan === 'FACTORY' && (
                          <button
                            onClick={handleMarkLive}
                            className={`w-full py-3 px-4 font-bold rounded-lg text-sm text-center border-2 transition-all flex items-center justify-center gap-2 ${
                              selectedClientData?.status === 'live'
                                ? 'border-[#16A34A] bg-[#16A34A] text-white opacity-60 cursor-default'
                                : 'border-[#16A34A] bg-[#16A34A] text-white hover:bg-[#15803d] shadow-sm hover:shadow-md'
                            }`}
                            disabled={selectedClientData?.status === 'live'}
                          >
                            <span className="text-base">🚀</span>
                            {selectedClientData?.status === 'live' ? 'Already Live' : 'Mark as LIVE'}
                          </button>
                        )}

                        <button
                          onClick={handleDeleteClient}
                          className="w-full py-2 px-4 border border-[#DC2626] text-[#DC2626] font-medium rounded-lg hover:bg-red-50 transition-colors text-sm text-center"
                        >
                          Delete Client
                        </button>
                      </div>
                    </div>

                    {/* Reset Password Inline Form */}
                    <div className="border border-[#E5E7EB] rounded-lg p-5 bg-white space-y-4">
                      <h3 className="text-xs font-bold text-[#111827] uppercase tracking-widest border-b border-[#E5E7EB] pb-2">Reset Password</h3>
                      <form onSubmit={handleResetPasswordInline} className="space-y-3">
                        <input
                          type="password"
                          value={inlineNewPassword}
                          onChange={e => setInlineNewPassword(e.target.value)}
                          placeholder="Enter new password..."
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1A3C5E]"
                          required
                        />
                        <button
                          type="submit"
                          disabled={isResettingPassword}
                          className="w-full py-2 px-3 border border-gray-200 text-[#374151] bg-white font-medium rounded-lg hover:bg-gray-50 text-xs transition-colors"
                        >
                          {isResettingPassword ? "Updating..." : "Save Password"}
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. SYSTEM TAB */}
              {clientTab === 'system' && (
                <div className="space-y-6">
                  {/* Edge Device Box */}
                  <div className="border border-[#E5E7EB] rounded-lg p-5 bg-white space-y-4">
                    <h3 className="text-xs font-bold text-[#111827] uppercase tracking-widest border-b border-[#E5E7EB] pb-2">Edge Device</h3>
                    <div className="space-y-3 text-sm">
                      {/* API Key row */}
                      <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-2.5">
                        <span className="text-[#6B7280]">API Key</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-[#111827]">
                            {revealKey 
                              ? (detailedStore?.api_key || selectedClientData?.api_key || 'sk_dev_api_key_not_fetched') 
                              : 'sk_••••••••••••••••••••••••••••••••'}
                          </span>
                          <button 
                            onClick={() => setRevealKey(!revealKey)}
                            className="px-2 py-1 border border-gray-200 text-gray-600 rounded text-xs hover:bg-gray-50"
                          >
                            {revealKey ? "Hide" : "Show"}
                          </button>
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(detailedStore?.api_key || selectedClientData?.api_key || '');
                              showToast("API Key copied!", 'success');
                            }}
                            className="px-2 py-1 border border-gray-200 text-gray-600 rounded text-xs hover:bg-gray-50 flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" /> Copy
                          </button>
                        </div>
                      </div>

                      {/* Store ID row */}
                      <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-2.5">
                        <span className="text-[#6B7280]">Store ID</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[#111827]">{selectedClientData?.store_id}</span>
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(selectedClientData?.store_id || '');
                              showToast("Store ID copied!", 'success');
                            }}
                            className="px-2 py-1 border border-gray-200 text-gray-600 rounded text-xs hover:bg-gray-50 flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" /> Copy
                          </button>
                        </div>
                      </div>

                      {/* Online Status / Last Seen */}
                      <div className="flex justify-between items-center pt-1">
                        <span className="text-[#6B7280]">Status</span>
                        {(() => {
                          const lastBlob = selectedClientData?.last_blob;
                          if (!lastBlob) {
                            return (
                              <span className="text-gray-500 font-semibold flex items-center gap-1">
                                <span className="w-2.5 h-2.5 rounded-full bg-gray-400" /> Offline
                              </span>
                            );
                          }
                          const diffMs = Date.now() - new Date(lastBlob).getTime();
                          const diffMins = Math.floor(diffMs / 60000);
                          if (diffMins < 10) {
                            return (
                              <span className="text-[#16A34A] font-semibold flex items-center gap-1">
                                <span className="w-2.5 h-2.5 rounded-full bg-[#16A34A]" /> Online
                              </span>
                            );
                          } else {
                            return (
                              <span className="text-[#DC2626] font-semibold flex items-center gap-1">
                                <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626]" /> Offline (last seen {diffMins} min ago)
                              </span>
                            );
                          }
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Cameras Box (Factory Only) */}
                  {selectedClientData?.plan === 'FACTORY' && (
                    <div className="border border-[#E5E7EB] rounded-lg p-5 bg-white space-y-4">
                      <div className="flex justify-between items-center border-b border-[#E5E7EB] pb-2">
                        <div className="flex items-center gap-2">
                          <h3 className="text-xs font-bold text-[#111827] uppercase tracking-widest">Cameras</h3>
                          {edgeCamerasLoading && (
                            <span className="text-xs text-[#6B7280] italic">Loading...</span>
                          )}
                          {!edgeCamerasLoading && edgeCameras.length > 0 && (
                            <span className="text-xs text-[#16A34A] font-medium">{edgeCameras.length} configured</span>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            const existing = selectedClientData?.factoryConfig?.cameras || [];
                            setEditCamerasList(existing.length > 0 ? [...existing] : [{ camera_id: 'cam1', label: '', rtsp_url: '', fps: 2 }]);
                            setShowEditCamerasModal(true);
                          }}
                          className="px-3 py-1 border border-[#E5E7EB] text-[#374151] rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                        >
                          Edit
                        </button>
                      </div>

                      <div className="overflow-hidden border border-gray-200 rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-[#F8F9FA]">
                            <tr>
                              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Camera ID</th>
                              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Label</th>
                              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">RTSP URL</th>
                              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200 text-xs">
                            {edgeCamerasLoading ? (
                              <tr>
                                <td colSpan={4} className="px-4 py-4 text-center text-[#6B7280] italic">Fetching camera config from edge device...</td>
                              </tr>
                            ) : edgeCameras.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="px-4 py-4 text-center text-[#6B7280] italic">No cameras configured. Use Edit to add cameras.</td>
                              </tr>
                            ) : (
                              edgeCameras.map((cam: any) => {
                                // Determine online status from last_blob data
                                const lastBlob = selectedClientData?.last_blob;
                                const diffMins = lastBlob
                                  ? Math.floor((Date.now() - new Date(lastBlob).getTime()) / 60000)
                                  : null;
                                const isOnline = diffMins !== null && diffMins < 10;
                                return (
                                  <tr key={cam.camera_id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 font-mono font-semibold text-[#111827]">{cam.camera_id}</td>
                                    <td className="px-4 py-3 text-gray-700">{cam.label || '—'}</td>
                                    <td className="px-4 py-3 font-mono text-gray-500 max-w-[200px] truncate" title={maskRtspPassword(cam.rtsp_url)}>
                                      {maskRtspPassword(cam.rtsp_url)}
                                    </td>
                                    <td className="px-4 py-3">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                                        isOnline
                                          ? 'bg-green-50 text-[#16A34A]'
                                          : 'bg-red-50 text-[#DC2626]'
                                      }`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${
                                          isOnline ? 'bg-[#16A34A]' : 'bg-[#DC2626]'
                                        }`} />
                                        {isOnline ? 'Online' : 'Offline'}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Configuration Shifts & Wages (Factory Only) */}
                  {selectedClientData?.plan === 'FACTORY' && (
                    <div className="border border-[#E5E7EB] rounded-lg p-5 bg-white space-y-4">
                      <h3 className="text-xs font-bold text-[#111827] uppercase tracking-widest border-b border-[#E5E7EB] pb-2">Configuration</h3>
                      
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider block">Shifts</span>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {!(selectedClientData?.factoryConfig?.shifts?.length) ? (
                              <p className="text-sm text-[#6B7280] italic col-span-3">No shifts configured.</p>
                            ) : (
                              selectedClientData.factoryConfig.shifts.map((shift: any, idx: number) => (
                                <div key={idx} className="p-3 border border-gray-200 rounded-lg text-xs bg-[#F8F9FA]">
                                  <div className="font-semibold text-gray-800">{shift.label}</div>
                                  <div className="text-xs font-bold text-[#1A3C5E] mt-1">{shift.startTime} - {shift.endTime}</div>
                                  <div className="text-[10px] text-[#6B7280] mt-1 uppercase truncate">
                                    {Object.keys(shift.days || {}).filter(d => shift.days[d]).join(', ')}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="border-t border-gray-100 pt-3">
                          <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider block mb-2">Wage Rates (₹ INR / Hour)</span>
                          <div className="grid grid-cols-3 gap-4 text-xs font-mono text-center">
                            <div className="p-2 border border-gray-200 rounded-lg">
                              <div className="text-gray-500 uppercase text-[9px] font-semibold">Operator</div>
                              <div className="font-bold text-gray-800 mt-1">₹{selectedClientData?.factoryConfig?.operatorWage || 120}</div>
                            </div>
                            <div className="p-2 border border-gray-200 rounded-lg">
                              <div className="text-gray-500 uppercase text-[9px] font-semibold">Supervisor</div>
                              <div className="font-bold text-gray-800 mt-1">₹{selectedClientData?.factoryConfig?.supervisorWage || 250}</div>
                            </div>
                            <div className="p-2 border border-gray-200 rounded-lg">
                              <div className="text-gray-500 uppercase text-[9px] font-semibold">Contractor</div>
                              <div className="font-bold text-gray-800 mt-1">₹{selectedClientData?.factoryConfig?.contractorWage || 180}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 3. ANALYTICS TAB */}
              {clientTab === 'analytics' && (
                <div className="space-y-6">
                  {selectedClientData?.plan === 'FACTORY' ? (
                    <div className="border border-[#E5E7EB] rounded-lg bg-white overflow-hidden shadow-sm">
                      <ErrorBoundary>
                        <FactoryDashboard 
                          storeId={selectedClient || ''} 
                          password="auris123" 
                          factoryName={selectedClientData?.store_name || selectedClient || ''} 
                          trialDay={30} 
                        />
                      </ErrorBoundary>
                    </div>
                  ) : (
                    <RetailAnalytics storeId={selectedClient || ''} />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ADD CLIENT MODAL DIALOG (2-Step Wizard) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="relative w-full max-w-lg bg-white border border-[#E5E7EB] rounded-lg shadow-xl p-6 my-8">
            <button 
              onClick={() => {
                if (addStep !== 'success' && !window.confirm("Abandon onboarding? Client will not be saved.")) return;
                setShowAddModal(false);
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-lg font-bold"
            >
              ✕
            </button>

            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3 mb-5">
              <div>
                <h3 className="text-base font-bold text-[#111827]">Add New Client</h3>
                <p className="text-xs text-[#6B7280]">Register and configure a new store instance.</p>
              </div>
              
              {addStep !== 'success' && (
                <div className="flex gap-1.5 text-xs font-mono font-semibold">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center border ${
                    addStep === 1 ? 'bg-[#1A3C5E] text-white border-[#1A3C5E]' : 'bg-green-15 text-green-700 border-green-200'
                  }`}>
                    {addStep > 1 ? '✓' : '1'}
                  </span>
                  {addForm.plan === 'FACTORY' && (
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center border ${
                      addStep === 2 ? 'bg-[#1A3C5E] text-white border-[#1A3C5E]' : 'bg-gray-50 text-gray-400 border-gray-200'
                    }`}>
                      2
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Step 1: Basic credentials */}
            {addStep === 1 && (
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!addForm.store_id || !addForm.store_name || !addForm.password) {
                  showToast("Please fill all fields", 'error');
                  return;
                }
                const cleanId = addForm.store_id.trim().toLowerCase().replace(/\s+/g, '_');
                try {
                  const res = await fetch(`${API_BASE}/admin/stores`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'X-Admin-Key': ADMIN_KEY
                    },
                    body: JSON.stringify({
                      store_id: cleanId,
                      store_name: addForm.store_name.trim(),
                      password: addForm.password
                    })
                  });
                  if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.detail || "Failed to create store account");
                  }
                  const data = await res.json();
                  const credentials = {
                    store_id: cleanId,
                    store_name: addForm.store_name.trim(),
                    password: addForm.password,
                    api_key: data.api_key,
                    plan: addForm.plan
                  };
                  setCreatedCredentials(credentials);
                  showToast("Store created successfully!", 'success');

                  if (addForm.plan === 'FACTORY') {
                    setAddStep(2);
                  } else {
                    setAddStep('success');
                    fetchClients();
                  }
                } catch (e: any) {
                  showToast(e.message || "Failed to create client", 'error');
                }
              }} className="space-y-4 text-sm text-gray-700">
                <div className="space-y-1 flex flex-col">
                  <label className="font-semibold text-gray-800 text-xs">Store Name</label>
                  <input
                    type="text"
                    required
                    value={addForm.store_name}
                    onChange={e => {
                      const val = e.target.value;
                      setAddForm(prev => ({
                        ...prev,
                        store_name: val,
                        store_id: isStoreIdAuto ? val.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') : prev.store_id
                      }));
                    }}
                    placeholder="e.g. XYZ Labs Pvt Ltd"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1A3C5E]"
                  />
                </div>

                <div className="space-y-1 flex flex-col">
                  <label className="font-semibold text-gray-800 text-xs">Store ID</label>
                  <input
                    type="text"
                    required
                    value={addForm.store_id}
                    onChange={e => {
                      setIsStoreIdAuto(false);
                      setAddForm({ ...addForm, store_id: e.target.value });
                    }}
                    placeholder="e.g. xyz_labs"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1A3C5E] font-mono"
                  />
                </div>

                <div className="space-y-1 flex flex-col">
                  <label className="font-semibold text-gray-800 text-xs">City</label>
                  <input
                    type="text"
                    value={addForm.city}
                    onChange={e => setAddForm({ ...addForm, city: e.target.value })}
                    placeholder="e.g. Chennai"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1A3C5E]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1 flex flex-col">
                    <label className="font-semibold text-gray-800 text-xs">Plan</label>
                    <select
                      value={addForm.plan}
                      onChange={e => setAddForm({ ...addForm, plan: e.target.value as any })}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1A3C5E] bg-white"
                    >
                      <option value="FACTORY">FACTORY</option>
                      <option value="RETAIL">RETAIL</option>
                      <option value="PILOT">PILOT</option>
                    </select>
                  </div>

                  <div className="space-y-1 flex flex-col">
                    <label className="font-semibold text-gray-800 text-xs">Password</label>
                    <input
                      type="password"
                      required
                      value={addForm.password}
                      onChange={e => setAddForm({ ...addForm, password: e.target.value })}
                      placeholder="Password..."
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1A3C5E] font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                  <button 
                    type="button" 
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 border border-gray-200 text-gray-700 bg-white font-medium rounded-lg hover:bg-gray-50 text-xs"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 bg-[#1A3C5E] text-white font-medium rounded-lg hover:opacity-90 text-xs"
                  >
                    Create Account
                  </button>
                </div>
              </form>
            )}

            {/* Step 2: Onboard Factory Parameters */}
            {addStep === 2 && (
              <form onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const res = await fetch(`${API_BASE}/api/factory/onboard`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'X-Admin-Key': ADMIN_KEY
                    },
                    body: JSON.stringify({
                      store_id: createdCredentials.store_id,
                      factory_name: createdCredentials.store_name,
                      city: addForm.city || 'Chennai',
                      numShifts: Number(addForm.numShifts),
                      shifts: addForm.shifts.slice(0, Number(addForm.numShifts)),
                      totalHeadcount: Number(addForm.totalHeadcount),
                      operatorWage: Number(addForm.operatorWage),
                      supervisorWage: Number(addForm.supervisorWage),
                      contractorWage: Number(addForm.contractorWage),
                      whatsAppNumber: addForm.whatsAppNumber
                    })
                  });
                  if (!res.ok) throw new Error("Failed to onboard factory configuration");
                  
                  showToast("Factory configuration onboarded!", 'success');
                  setAddStep('success');
                  fetchClients();
                } catch (err: any) {
                  showToast(err.message || "Failed to onboard factory parameter", 'error');
                }
              }} className="space-y-4 text-sm text-gray-700">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1 flex flex-col">
                    <label className="font-semibold text-gray-800 text-xs">Number of Shifts</label>
                    <select
                      value={addForm.numShifts}
                      onChange={e => setAddForm({ ...addForm, numShifts: Number(e.target.value) })}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1A3C5E] bg-white"
                    >
                      <option value={1}>1 Shift</option>
                      <option value={2}>2 Shifts</option>
                      <option value={3}>3 Shifts</option>
                    </select>
                  </div>

                  <div className="space-y-1 flex flex-col">
                    <label className="font-semibold text-gray-800 text-xs">WhatsApp Number</label>
                    <input
                      type="text"
                      required
                      value={addForm.whatsAppNumber}
                      onChange={e => setAddForm({ ...addForm, whatsAppNumber: e.target.value })}
                      placeholder="e.g. +919876543210"
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1A3C5E] font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-2 border-t border-gray-100 pt-3">
                  <label className="font-semibold text-gray-800 text-xs block">Shifts Configuration</label>
                  {[...Array(addForm.numShifts)].map((_, i) => (
                    <div key={i} className="p-3 border border-gray-200 rounded-lg space-y-2 bg-[#F8F9FA]">
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] text-gray-500 font-semibold block">Label</label>
                          <input
                            type="text"
                            value={addForm.shifts[i]?.label || ''}
                            onChange={e => {
                              const copy = [...addForm.shifts];
                              copy[i].label = e.target.value;
                              setAddForm({ ...addForm, shifts: copy });
                            }}
                            className="w-full border border-gray-200 bg-white rounded px-2 py-1 text-xs"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500 font-semibold block">Start Time</label>
                          <input
                            type="text"
                            value={addForm.shifts[i]?.startTime || ''}
                            onChange={e => {
                              const copy = [...addForm.shifts];
                              copy[i].startTime = e.target.value;
                              setAddForm({ ...addForm, shifts: copy });
                            }}
                            className="w-full border border-gray-200 bg-white rounded px-2 py-1 text-xs font-mono"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500 font-semibold block">End Time</label>
                          <input
                            type="text"
                            value={addForm.shifts[i]?.endTime || ''}
                            onChange={e => {
                              const copy = [...addForm.shifts];
                              copy[i].endTime = e.target.value;
                              setAddForm({ ...addForm, shifts: copy });
                            }}
                            className="w-full border border-gray-200 bg-white rounded px-2 py-1 text-xs font-mono"
                            required
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-3">
                  <div className="space-y-1 flex flex-col">
                    <label className="font-semibold text-gray-800 text-xs">Total Headcount</label>
                    <input
                      type="number"
                      value={addForm.totalHeadcount}
                      onChange={e => setAddForm({ ...addForm, totalHeadcount: Number(e.target.value) })}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1A3C5E]"
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <label className="font-semibold text-gray-800 text-xs block">Wage Rates (₹ INR / Hr)</label>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <span className="text-[10px] text-gray-500 block">Operator</span>
                      <input
                        type="number"
                        value={addForm.operatorWage}
                        onChange={e => setAddForm({ ...addForm, operatorWage: Number(e.target.value) })}
                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 block">Supervisor</span>
                      <input
                        type="number"
                        value={addForm.supervisorWage}
                        onChange={e => setAddForm({ ...addForm, supervisorWage: Number(e.target.value) })}
                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 block">Contractor</span>
                      <input
                        type="number"
                        value={addForm.contractorWage}
                        onChange={e => setAddForm({ ...addForm, contractorWage: Number(e.target.value) })}
                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                  <button 
                    type="button" 
                    onClick={() => {
                      setAddStep('success');
                      fetchClients();
                    }}
                    className="px-4 py-2 border border-gray-200 text-gray-700 bg-white font-medium rounded-lg hover:bg-gray-50 text-xs"
                  >
                    Skip Setup
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 bg-[#1A3C5E] text-white font-medium rounded-lg hover:opacity-90 text-xs"
                  >
                    Save & Finish
                  </button>
                </div>
              </form>
            )}

            {/* Success Done Screen */}
            {addStep === 'success' && (
              <div className="space-y-5 text-sm text-gray-700">
                <div className="text-center py-4 flex flex-col items-center justify-center">
                  <span className="w-10 h-10 rounded-full bg-green-50 text-[#16A34A] border border-green-200 flex items-center justify-center text-lg font-bold mb-2">✓</span>
                  <h4 className="font-bold text-[#16A34A] text-base">Client Provisioned successfully!</h4>
                  <p className="text-xs text-[#6B7280] mt-1 font-mono">Store registered and API keys issued.</p>
                </div>

                <div className="space-y-3 bg-[#F8F9FA] p-4 border border-gray-200 rounded-lg text-xs space-y-2.5">
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <span className="text-[#6B7280]">Store ID</span>
                    <span className="font-mono font-bold text-[#111827] select-all">{createdCredentials?.store_id}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <span className="text-[#6B7280]">Password</span>
                    <span className="font-mono font-bold text-[#111827] select-all">{createdCredentials?.password}</span>
                  </div>
                  <div className="flex justify-between items-center gap-4">
                    <span className="text-[#6B7280] flex-shrink-0">API Key</span>
                    <span className="font-mono font-bold text-[#1A3C5E] truncate select-all">{createdCredentials?.api_key}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-4">
                  <button
                    onClick={() => {
                      const text = `Client Name: ${createdCredentials?.store_name}\nStore ID: ${createdCredentials?.store_id}\nPassword: ${createdCredentials?.password}\nAPI Key: ${createdCredentials?.api_key}`;
                      navigator.clipboard.writeText(text);
                      showToast("Credentials copied to clipboard", 'success');
                    }}
                    className="w-full py-2.5 bg-white border border-gray-200 text-[#374151] rounded-lg hover:bg-gray-50 transition-colors font-medium text-xs text-center"
                  >
                    Copy Credentials
                  </button>
                  <button
                    onClick={() => {
                      setShowAddModal(false);
                      fetchClients();
                    }}
                    className="w-full py-2.5 bg-[#1A3C5E] text-white rounded-lg hover:opacity-90 transition-opacity font-medium text-xs text-center"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* EDIT CAMERAS MODAL */}
      {showEditCamerasModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="relative w-full max-w-lg bg-white border border-[#E5E7EB] rounded-lg shadow-xl p-6 my-8">
            <button 
              onClick={() => setShowEditCamerasModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-lg font-bold"
            >
              ✕
            </button>

            <div className="border-b border-[#E5E7EB] pb-3 mb-5">
              <h3 className="text-base font-bold text-[#111827]">Edit Cameras</h3>
              <p className="text-xs text-[#6B7280]">Update camera labels and RTSP live-stream endpoints.</p>
            </div>

            <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-1">
              {editCamerasList.map((cam, idx) => (
                <div key={idx} className="p-4 border border-gray-200 rounded-lg space-y-3 bg-[#F8F9FA]">
                  <div className="flex justify-between items-center text-xs font-mono border-b border-gray-100 pb-1.5">
                    <span className="text-[#1A3C5E] font-bold uppercase">{cam.camera_id || `cam${idx+1}`}</span>
                    <button
                      type="button"
                      onClick={() => setEditCamerasList(prev => prev.filter((_, i) => i !== idx))}
                      className="text-[#DC2626] font-semibold hover:underline text-xs"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
                    <div className="space-y-1">
                      <span className="text-xs font-medium block">Label</span>
                      <input
                        type="text"
                        required
                        value={cam.label || ''}
                        onChange={e => {
                          const copy = [...editCamerasList];
                          copy[idx].label = e.target.value;
                          setEditCamerasList(copy);
                        }}
                        placeholder="e.g. Lobby 1"
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-white focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <span className="text-xs font-medium block">RTSP URL</span>
                      <input
                        type="text"
                        required
                        value={cam.rtsp_url || ''}
                        onChange={e => {
                          const copy = [...editCamerasList];
                          copy[idx].rtsp_url = e.target.value;
                          setEditCamerasList(copy);
                        }}
                        placeholder="rtsp://..."
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-white focus:outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setEditCamerasList(prev => [
                  ...prev,
                  { camera_id: `cam${prev.length + 1}`, label: '', rtsp_url: '', fps: 2 }
                ])}
                className="w-full py-2 border border-dashed border-gray-300 text-gray-500 rounded-lg hover:border-[#1A3C5E] hover:text-[#1A3C5E] transition-all text-xs font-semibold text-center flex items-center justify-center gap-1"
              >
                <Plus className="w-4 h-4" /> Add Camera
              </button>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 mt-5">
              <button 
                onClick={() => setShowEditCamerasModal(false)}
                className="px-4 py-2 border border-gray-200 text-gray-700 bg-white font-medium rounded-lg hover:bg-gray-50 text-xs"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveCameras}
                className="px-4 py-2 bg-[#1A3C5E] text-white font-medium rounded-lg hover:opacity-90 text-xs"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- MAPPING PAGE ---
const MappingPage = ({ storeId }: { storeId: string }) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [isError, setIsError] = useState(false);
  const [uploadedPlan, setUploadedPlan] = useState<any>(null);

  const fetchUploadedPlan = async () => {
    if (!storeId) return;
    try {
      const res = await fetch(`${API_BASE}/api/mapping/floorplan?floor_id=floor_0`, {
        headers: {
          'X-Store-ID': storeId,
          'X-Password': 'auris123' // default password fallback
        }
      });
      if (res.ok) {
        const data = await res.json();
        setUploadedPlan(data.floorplan || null);
      } else {
        setUploadedPlan(null);
      }
    } catch (e) {
      console.error("Failed to load floorplan:", e);
    }
  };

  useEffect(() => {
    fetchUploadedPlan();
  }, [storeId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatusMsg('');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setStatusMsg("Please select a file first");
      setIsError(true);
      return;
    }
    if (!storeId) {
      setStatusMsg("No client store selected. Select a client first.");
      setIsError(true);
      return;
    }
    setUploading(true);
    setStatusMsg("Uploading floor plan...");
    setIsError(false);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await fetch(`${API_BASE}/api/mapping/floorplan?store_id=${storeId}`, {
        method: 'POST',
        body: formData,
        headers: {
          'X-Admin-Key': ADMIN_KEY
        }
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMsg("Floor plan uploaded successfully!");
        setIsError(false);
        setFile(null);
        fetchUploadedPlan();
      } else {
        setStatusMsg(data.detail || "Upload failed");
        setIsError(true);
      }
    } catch (e: any) {
      setStatusMsg("Network error: failed to upload");
      setIsError(true);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <header className="flex justify-between items-center mb-8 pb-4 border-b border-[#E5E7EB]">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Floor Plans</h1>
          <p className="text-sm text-[#6B7280]">Ingest and manage 2D RoomPlan or vector representations.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        {/* Upload Card */}
        <div className="border border-[#E5E7EB] rounded-lg p-6 bg-white shadow-sm space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-[#111827] uppercase">Upload Floor Plan</h3>
            <p className="text-xs text-[#6B7280] mt-1">Accepts .json files exported from Polycam/RoomPlan or .svg vector outlines.</p>
          </div>

          <div className="border-2 border-dashed border-gray-200 hover:border-[#1A3C5E] transition-colors rounded-lg p-8 flex flex-col items-center justify-center text-center space-y-4">
            <FileUp className="w-10 h-10 text-[#6B7280]/40" />
            <div className="space-y-1">
              <input 
                type="file" 
                accept=".json,.svg" 
                onChange={handleFileChange} 
                id="file-floorplan"
                className="hidden" 
              />
              <label 
                htmlFor="file-floorplan"
                className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-200 text-[#374151] rounded-lg font-medium text-xs hover:bg-gray-50 transition-colors"
              >
                {file ? "Change File" : "Choose File"}
              </label>
            </div>
            {file && (
              <div className="text-xs font-mono text-gray-700 font-medium">
                {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </div>
            )}
          </div>

          {statusMsg && (
            <div className={`p-3 rounded-lg text-xs font-mono border ${
              isError ? 'bg-red-50 border-red-200 text-[#DC2626]' : 'bg-green-50 border-green-200 text-[#16A34A]'
            }`}>
              {statusMsg}
            </div>
          )}

          <button 
            onClick={handleUpload}
            disabled={uploading || !file}
            className="w-full py-2.5 bg-[#1A3C5E] text-white font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity text-sm text-center"
          >
            {uploading ? "Uploading..." : "Upload Floor Plan"}
          </button>
        </div>

        {/* Uploaded Plans Info */}
        <div className="border border-[#E5E7EB] rounded-lg p-6 bg-white shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-[#111827] uppercase border-b border-[#E5E7EB] pb-2">Active Floor Plan</h3>
          
          {uploadedPlan ? (
            <div className="space-y-4 text-sm text-gray-700">
              <div className="grid grid-cols-2 gap-y-3.5">
                <span className="text-[#6B7280]">Name</span>
                <span className="font-semibold text-gray-800 text-right">{uploadedPlan.name}</span>

                <span className="text-[#6B7280]">Source</span>
                <span className="font-mono text-right">{uploadedPlan.map_source}</span>

                <span className="text-[#6B7280]">Updated At</span>
                <span className="text-xs text-right">{new Date(uploadedPlan.updated_at).toLocaleString()}</span>

                {uploadedPlan.scan_quality && (
                  <>
                    <span className="text-[#6B7280]">Area</span>
                    <span className="font-semibold text-right">{uploadedPlan.scan_quality.area_sq_m} m²</span>

                    <span className="text-[#6B7280]">Wall Count</span>
                    <span className="font-semibold text-right">{uploadedPlan.scan_quality.wall_count}</span>
                  </>
                )}
              </div>

              {uploadedPlan.scan_quality?.warnings?.length > 0 && (
                <div className="p-3 border border-yellow-200 bg-yellow-50 rounded-lg text-xs text-[#CA8A04] flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{uploadedPlan.scan_quality.warnings.join(' ')}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-[#6B7280] italic text-xs">
              No floor plan has been uploaded yet for this store workspace.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- CALIBRATION TAB ---
const CalibrationTab = ({ storeId, password }: { storeId: string; password?: string }) => {
    const [points, setPoints] = useState<any[]>([]);
    const [imgUrl, setImgUrl] = useState('https://picsum.photos/seed/calibrate/1200/800');
    const [cameraId, setCameraId] = useState('');
    const [calibMsg, setCalibMsg] = useState('');
    const [cameras, setCameras] = useState<any[]>([]);

    useEffect(() => {
      const fetchCameras = async () => {
        if (!storeId) return;
        try {
          const res = await fetch(`${API_BASE}/api/factory/cameras`, {
            headers: {
              'X-Store-ID': storeId,
              'X-Password': password || 'test123'
            }
          });
          if (res.ok) {
            const data = await res.json();
            if (data && Array.isArray(data.cameras)) {
              setCameras(data.cameras);
              if (data.cameras.length > 0) {
                setCameraId(data.cameras[0].camera_id);
              }
            }
          }
        } catch (e) {
          console.error("Failed to fetch cameras in CalibrationTab:", e);
        }
      };
      fetchCameras();
    }, [storeId, password]);

    const fetchSnapshot = async () => {
      if (!cameraId) return;
      try {
        const res = await fetch(`${API_BASE}/api/calibration/snapshot?store_id=${storeId}&camera_id=${cameraId}`, {
          headers: {
            'X-Store-ID': storeId,
            'X-Password': password || 'test123'
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.full_frame_b64) {
            setImgUrl(data.full_frame_b64.startsWith('data:') ? data.full_frame_b64 : `data:image/jpeg;base64,${data.full_frame_b64}`);
          }
        } else {
          setImgUrl('https://picsum.photos/seed/calibrate/1200/800');
        }
      } catch (e) {
        setImgUrl('https://picsum.photos/seed/calibrate/1200/800');
      }
    };

    useEffect(() => {
      fetchSnapshot();
    }, [storeId, cameraId]);
    
    const handleCanvasClick = (e: React.MouseEvent) => {
      if (points.length >= 4) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * 100;
      const py = ((e.clientY - rect.top) / rect.height) * 100;
      setPoints([...points, { px, py, xm: 0, ym: 0 }]);
    };

    const handleSolveHomography = async () => {
      if (points.length < 4) {
        setCalibMsg("Please select exactly 4 points.");
        return;
      }
      setCalibMsg("Saving...");
      try {
        const payload = {
          store_id: storeId,
          camera_id: cameraId,
          floor_id: 'floor_0',
          points: points.map((p, idx) => ({
            px: p.px,
            py: p.py,
            x_m: p.xm,
            y_m: p.ym,
            label: `GCP_${idx + 1}`
          }))
        };
        const res = await fetch(`${API_BASE}/api/calibration/homography?store_id=${storeId}&camera_id=${cameraId}&floor_id=floor_0`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Store-ID': storeId,
            'X-Password': password || 'test123'
          },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
          setCalibMsg(`Calibration success! RMSE: ${data.rmse_m.toFixed(4)} meters.`);
        } else {
          setCalibMsg(`Calibration error: ${data.detail || "Homography matrix singular."}`);
        }
      } catch (e) {
        setCalibMsg("Failed to calibrate camera.");
      }
    };

    return (
      <div className="h-full flex flex-col bg-white">
        <header className="flex justify-between items-center mb-8 pb-4 border-b border-[#E5E7EB]">
          <div>
            <h1 className="text-2xl font-bold text-[#111827]">Calibration</h1>
            <p className="text-sm text-[#6B7280]">Establish ground-control homography projection maps.</p>
          </div>
        </header>

        <div className="flex-1 flex flex-col md:flex-row gap-8 min-h-0 overflow-hidden">
          {/* Controls column */}
          <div className="w-80 flex flex-col gap-6 flex-shrink-0 overflow-y-auto">
            <div className="border border-[#E5E7EB] rounded-lg p-5 bg-white space-y-4">
              <h3 className="text-xs font-bold text-[#111827] uppercase tracking-widest border-b border-[#E5E7EB] pb-2">Projection Solve</h3>
              <p className="text-xs text-[#6B7280] italic">Select exactly 4 points on the viewport mapping canvas to bind camera pixels to world meters.</p>
              
              <div className="space-y-3">
                {points.map((p, i) => (
                  <div key={i} className="p-3 border border-gray-200 rounded-lg text-xs space-y-2.5">
                    <span className="font-semibold text-[#1A3C5E] uppercase block">Point #{i+1}</span>
                    <div className="grid grid-cols-2 gap-2 font-mono">
                      <div>
                        <label className="text-[10px] text-gray-500 block">World X (m)</label>
                        <input 
                          type="number" 
                          step="0.01"
                          onChange={e => setPoints(pts => pts.map((pt, idx) => idx === i ? {...pt, xm: Number(e.target.value)} : pt))}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-xs" 
                          required
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 block">World Y (m)</label>
                        <input 
                          type="number" 
                          step="0.01"
                          onChange={e => setPoints(pts => pts.map((pt, idx) => idx === i ? {...pt, ym: Number(e.target.value)} : pt))}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-xs" 
                          required
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button 
                  onClick={handleSolveHomography}
                  disabled={points.length < 4}
                  className="w-full py-2 bg-[#1A3C5E] text-white font-medium rounded-lg hover:opacity-90 disabled:opacity-50 text-xs"
                >
                  Solve Homography
                </button>
                <button 
                  onClick={() => { setPoints([]); setCalibMsg(''); }} 
                  className="w-full text-xs text-[#6B7280] hover:text-[#111827] text-center"
                >
                  Clear Points
                </button>
              </div>

              {calibMsg && (
                <div className="p-3 rounded-lg border border-blue-200 bg-blue-50 text-xs font-mono text-blue-700">
                  {calibMsg}
                </div>
              )}
            </div>

            {/* Cameras Select Registry */}
            <div className="border border-[#E5E7EB] rounded-lg p-5 bg-white space-y-3">
              <h3 className="text-xs font-bold text-[#111827] uppercase tracking-widest border-b border-[#E5E7EB] pb-2">Active Nodes</h3>
              <div className="space-y-1">
                {cameras.map(c => (
                  <button
                    key={c.camera_id}
                    onClick={() => { setCameraId(c.camera_id); setPoints([]); setCalibMsg(''); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono flex items-center justify-between transition-colors ${
                      cameraId === c.camera_id 
                        ? 'bg-blue-50 text-[#1A3C5E] font-bold border-l-2 border-[#1A3C5E]' 
                        : 'hover:bg-gray-50 border-l-2 border-transparent text-gray-700'
                    }`}
                  >
                    <span>{c.camera_id}</span>
                    <span className="text-[10px] opacity-75">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Viewport canvas column */}
          <div className="flex-1 border border-[#E5E7EB] rounded-lg overflow-hidden bg-gray-50 relative flex items-center justify-center cursor-crosshair">
            <div className="relative w-full h-full" onClick={handleCanvasClick}>
              <img src={imgUrl} className="w-full h-full object-cover" draggable={false} referrerPolicy="no-referrer" />
              
              {/* Overlay point markers */}
              {points.map((p, i) => (
                <div 
                  key={i} 
                  className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none" 
                  style={{ left: `${p.px}%`, top: `${p.py}%` }}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-[#1A3C5E] border-2 border-white shadow-md block" />
                  <span className="mt-1 bg-black/85 text-white font-mono text-[9px] px-1.5 py-0.5 rounded border border-white/20 whitespace-nowrap block">
                    GCP_{i+1}: {p.xm}m, {p.ym}m
                  </span>
                </div>
              ))}

              <span className="absolute bottom-4 left-4 bg-black/60 text-white font-mono text-xs px-3 py-1 rounded">
                Node ID: {cameraId || "NO ACTIVE NODE"}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
};

// --- TRAINING TAB ---
const TrainingTab = () => {
  const [cases, setCases] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exportMsg, setExportMsg] = useState('');
  const [stats, setStats] = useState({ hard_cases: 0, hard_cases_pending: 0, pseudo_labels: 0 });

  const fetchCases = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/training/hard-cases`, {
        headers: { 'X-Admin-Key': ADMIN_KEY }
      });
      const data = await res.json();
      if (data && Array.isArray(data.cases)) {
        setCases(data.cases);
      }
      
      const statRes = await fetch(`${API_BASE}/api/training/stats`, {
        headers: { 'X-Admin-Key': ADMIN_KEY }
      });
      const statData = await statRes.json();
      setStats(statData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
  }, []);

  const handleReview = async (action: 'approve' | 'reject') => {
    if (!cases[currentIndex]) return;
    const caseId = cases[currentIndex]._id;
    try {
      const res = await fetch(`${API_BASE}/api/training/review`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Admin-Key': ADMIN_KEY
        },
        body: JSON.stringify({ case_id: caseId, action })
      });
      if (res.ok) {
        setCurrentIndex(v => v + 1);
        setStats(prev => ({
          ...prev,
          hard_cases_pending: Math.max(prev.hard_cases_pending - 1, 0)
        }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleExport = async () => {
    setExportMsg("Exporting...");
    try {
      const res = await fetch(`${API_BASE}/api/training/export-yolo`, {
        method: 'POST',
        headers: { 'X-Admin-Key': ADMIN_KEY }
      });
      const data = await res.json();
      if (res.ok) {
        setExportMsg(`Export complete! YOLOv8 Manifest: ${data.approved_hard_cases} Cases, ${data.pseudo_labels} Pseudo Labels.`);
      }
    } catch (e) {
      setExportMsg("Export pipeline error.");
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-[#6B7280]">
        <RefreshCw className="w-6 h-6 animate-spin mr-2 text-[#1A3C5E]" /> Loading active training cases...
      </div>
    );
  }

  const currentCase = cases[currentIndex];

  return (
    <div className="h-full flex flex-col bg-white">
      <header className="flex justify-between items-center mb-8 pb-4 border-b border-[#E5E7EB]">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Active Learning</h1>
          <p className="text-sm text-[#6B7280]">Review low-confidence anomaly frames for model retraining.</p>
        </div>
        <button 
          onClick={handleExport}
          className="px-4 py-2 font-medium text-[#1A3C5E] border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5 text-xs bg-white"
        >
          <Database className="w-4 h-4" /> Export YOLO Dataset
        </button>
      </header>

      {exportMsg && (
        <div className="mb-6 p-4 rounded-lg bg-green-50 border border-green-200 text-xs font-mono text-green-700">
          {exportMsg}
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto space-y-6 w-full">
        <div className="grid grid-cols-2 gap-12 w-full text-center pb-4">
          <div>
            <span className="text-[10px] uppercase font-bold text-[#6B7280] tracking-wider">Cases Pending</span>
            <span className="text-2xl font-bold block mt-1 text-[#111827]">{stats.hard_cases_pending}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-[#6B7280] tracking-wider">Model Core</span>
            <span className="text-2xl font-bold block mt-1 text-[#1A3C5E]">YOLOv8-Auris</span>
          </div>
        </div>

        {!currentCase ? (
          <div className="border border-gray-200 rounded-lg p-8 text-center max-w-md w-full bg-white shadow-sm space-y-4">
            <ShieldCheck className="w-12 h-12 text-[#16A34A] mx-auto" />
            <h3 className="text-base font-bold text-gray-800 uppercase">Review Completed</h3>
            <p className="text-xs text-[#6B7280]">All flagged system drifts and anomalies have been resolved and categorized.</p>
          </div>
        ) : (
          <div className="w-full space-y-4">
            <div className="border border-gray-200 rounded-lg overflow-hidden relative aspect-video bg-gray-50 flex items-center justify-center shadow-sm">
              <img 
                src={currentCase.crop_b64.startsWith('data:') ? currentCase.crop_b64 : `data:image/jpeg;base64,${currentCase.crop_b64}`}
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
              <span className="absolute bottom-4 left-4 bg-black/60 text-white font-mono text-xs px-3 py-1 rounded">
                Node ID: {currentCase.camera_id} | Confidence: {(Number(currentCase.confidence) * 100).toFixed(1)}%
              </span>
            </div>

            <div className="flex gap-4">
              <button 
                onClick={() => handleReview('reject')}
                className="flex-1 py-3 border border-[#DC2626] text-[#DC2626] rounded-lg hover:bg-red-50 transition-colors font-semibold text-xs flex items-center justify-center gap-1.5 bg-white"
              >
                <XCircle className="w-4 h-4" /> Reject Label
              </button>
              <button 
                onClick={() => handleReview('approve')}
                className="flex-1 py-3 bg-[#1A3C5E] text-white rounded-lg hover:opacity-90 transition-opacity font-semibold text-xs flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" /> Approve Label
              </button>
            </div>

            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
              <div 
                className="h-full bg-[#1A3C5E]" 
                style={{ width: `${(currentIndex / Math.max(cases.length, 1)) * 100}%` }}
              />
            </div>
            <div className="text-center font-mono text-xs text-[#6B7280]">
              {currentIndex + 1} of {cases.length} cases reviewed
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// --- REPORT TAB ---
const ReportTab = ({ storeId, password }: { storeId: string; password?: string }) => {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<string>('');
  const [generatedAt, setGeneratedAt] = useState<string>('');
  const [deadtimeData, setDeadtimeData] = useState<any>(null);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/report`, {
        headers: {
          'X-Store-ID': storeId,
          'X-Password': password || 'test123'
        }
      });
      const data = await res.json();
      if (data && data.report) {
        setReport(data.report);
        setGeneratedAt(data.generated_at);
      }
      
      const dtRes = await fetch(`${API_BASE}/api/factory/deadtime`, {
        headers: {
          'X-Store-ID': storeId,
          'X-Password': password || 'test123'
        }
      });
      if (dtRes.ok) {
        const dtData = await dtRes.json();
        setDeadtimeData(dtData);
      }
    } catch (e) {
      console.error(e);
      setReport("Connection failed: could not load report.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [storeId, password]);

  const handlePrint = () => window.print();

  return (
    <div className="h-full flex flex-col bg-white">
      <header className="flex justify-between items-center mb-8 pb-4 border-b border-[#E5E7EB]">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Reports</h1>
          <p className="text-sm text-[#6B7280]">Factory floor operations intelligence report summaries.</p>
        </div>
        <div className="flex gap-2">
          <button 
            className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors bg-white text-[#6B7280]" 
            onClick={fetchReport}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button 
            className="px-4 py-2 font-medium text-white bg-[#1A3C5E] hover:opacity-90 rounded-lg transition-opacity text-xs" 
            onClick={handlePrint}
          >
            Download PDF
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex-grow flex items-center justify-center text-sm text-[#6B7280]">
          <RefreshCw className="w-6 h-6 animate-spin mr-2 text-[#1A3C5E]" /> Generating spatial intelligence summaries...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          {/* Main Sheet */}
          <div className="md:col-span-2 border border-[#E5E7EB] rounded-lg p-8 bg-white shadow-sm space-y-6">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
              <FileText className="w-5 h-5 text-[#1A3C5E]" />
              <h3 className="text-xs font-bold text-[#111827] uppercase tracking-widest">Executive Summary</h3>
            </div>
            
            <p className="text-sm leading-relaxed text-[#374151] font-sans border-l-4 border-[#1A3C5E] pl-4 whitespace-pre-wrap">
              {report || "No data recorded."}
            </p>

            <div className="pt-6 border-t border-gray-100 flex gap-12 text-xs">
              <div>
                <span className="text-[#6B7280] block font-semibold uppercase tracking-wider text-[10px]">Client</span>
                <span className="font-mono text-gray-800 font-bold block mt-1">{storeId.toUpperCase()}</span>
              </div>
              <div>
                <span className="text-[#6B7280] block font-semibold uppercase tracking-wider text-[10px]">Generated At</span>
                <span className="text-gray-800 block mt-1">
                  {generatedAt ? new Date(generatedAt).toLocaleString() : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* Right Metrics panel */}
          <div className="space-y-6">
            <div className="border border-[#E5E7EB] rounded-lg p-5 bg-white shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-[#111827] uppercase tracking-widest border-b border-[#E5E7EB] pb-2">Idle Time Cost Impact</h3>
              
              {!deadtimeData || !deadtimeData.by_zone || deadtimeData.by_zone.length === 0 ? (
                <div className="text-center py-6 text-[#6B7280] italic text-xs">
                  Sufficient spatial telemetry available after Day 7 of deployment.
                </div>
              ) : (
                deadtimeData.by_zone.slice(0, 3).map((z: any, idx: number) => (
                  <div key={idx} className="p-3 border border-gray-200 rounded-lg text-xs bg-[#F8F9FA]">
                    <div className="font-semibold text-gray-500 uppercase tracking-wider text-[9px]">{z.zone_label || z.zone_id}</div>
                    <div className="text-lg font-bold text-[#CA8A04] mt-1">{z.dead_hours.toFixed(1)} hours idle</div>
                    <div className="text-xs text-[#DC2626] font-bold mt-1">Cost Impact: ₹{Math.round(z.dead_cost_inr).toLocaleString('en-IN')}</div>
                  </div>
                ))
              )}
            </div>

            <div className="border border-[#E5E7EB] rounded-lg p-5 bg-white shadow-sm space-y-3">
              <h3 className="text-xs font-bold text-[#111827] uppercase tracking-widest border-b border-[#E5E7EB] pb-2">Action Items</h3>
              <div className="space-y-3 text-xs text-[#374151]">
                <div className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1A3C5E] mt-1.5 flex-shrink-0" />
                  <span>Review homography solves on Node Lobby 4 due to pixel scale variations.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1A3C5E] mt-1.5 flex-shrink-0" />
                  <span>Verify wage matrix calculations in system parameters.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- FACTORY PAGE (FactoryOnboardingView checklist) ---
const FactoryOnboardingView = ({ storeId: initialStoreId }: { storeId: string | null }) => {
  const [stores, setStores] = useState<any[]>([]);
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOnboardStore, setSelectedOnboardStore] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const resStores = await fetch(`${API_BASE}/admin/stores`, {
        headers: { 'X-Admin-Key': ADMIN_KEY }
      });
      const dataStores = await resStores.json();
      
      const factoryStores = (dataStores.stores || []).filter((s: any) => 
        s.store_id.includes('factory') || s.spatial_status === 'factory' || s.plan === 'FACTORY'
      );
      setStores(factoryStores);

      const resConfigs = await fetch(`${API_BASE}/api/factory/configs`, {
        headers: { 'X-Admin-Key': ADMIN_KEY }
      });
      const dataConfigs = await resConfigs.json();
      setConfigs(dataConfigs.configs || []);
    } catch (e) {
      console.error("Failed to load factory details:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleActivate = async (sid: string) => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE}/api/factory/config`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': ADMIN_KEY
        },
        body: JSON.stringify({
          store_id: sid,
          status: 'live'
        })
      });
      if (res.ok) {
        setSuccessMsg(`Factory "${sid.toUpperCase()}" promoted to live!`);
        fetchData();
      } else {
        const errData = await res.json();
        setErrorMsg(errData.detail || "Failed to promote factory status.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Promotion connection failure.");
    }
  };

  const handleOpenOnboard = (sid: string = '') => {
    setSelectedOnboardStore(sid);
    setIsModalOpen(true);
  };

  const handleOnboardSubmit = () => {
    setIsModalOpen(false);
    setSuccessMsg(`Onboarding checklist submitted for "${selectedOnboardStore.toUpperCase()}"!`);
    fetchData();
    setTimeout(() => setSuccessMsg(''), 5000);
  };

  const getFactoryStatus = (sid: string) => {
    const config = configs.find(c => c.store_id === sid);
    return config ? config.status : 'un-onboarded';
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <header className="flex justify-between items-center mb-8 pb-4 border-b border-[#E5E7EB]">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Factory Checklist</h1>
          <p className="text-sm text-[#6B7280]">Step-by-step physical and layout parameters setup.</p>
        </div>
      </header>

      {successMsg && (
        <div className="mb-4 p-3 border border-green-200 bg-green-50 text-xs font-semibold text-[#16A34A] rounded-lg">
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="mb-4 p-3 border border-red-200 bg-red-50 text-xs font-semibold text-[#DC2626] rounded-lg">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="flex-grow flex items-center justify-center text-sm text-[#6B7280]">
          <RefreshCw className="w-6 h-6 animate-spin mr-2 text-[#1A3C5E]" /> Syncing industry configuration checklist...
        </div>
      ) : stores.length === 0 ? (
        <div className="border border-dashed border-gray-200 bg-gray-50 rounded-lg p-8 text-center max-w-md mx-auto space-y-3">
          <LayoutGrid className="w-12 h-12 text-[#6B7280]/40 mx-auto" />
          <h3 className="text-sm font-semibold uppercase text-[#111827]">No Factory Store Listed</h3>
          <p className="text-xs text-[#6B7280]">Register a factory plan account inside the Clients directory workspace first.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {stores.map(s => {
            const status = getFactoryStatus(s.store_id);
            const isLive = status === 'live';
            const isPending = status === 'pending';
            const isUnOnboarded = status === 'un-onboarded';

            return (
              <div key={s.store_id} className="border border-[#E5E7EB] rounded-lg p-5 bg-white shadow-sm space-y-4">
                <div className="flex justify-between items-start">
                  <div className="w-10 h-10 border border-[#E5E7EB] bg-[#F8F9FA] text-[#1A3C5E] rounded-lg flex items-center justify-center">
                    <LayoutGrid className="w-5 h-5" />
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-xs text-[#6B7280] block font-bold">{s.store_id}</span>
                    <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold border rounded-full uppercase mt-1 ${
                      isLive ? 'bg-green-50 border-green-200 text-[#16A34A]' :
                      isPending ? 'bg-yellow-50 border-yellow-200 text-[#CA8A04]' : 'bg-gray-50 border-gray-200 text-gray-500'
                    }`}>
                      {status}
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-bold text-gray-800">{s.store_name}</h3>
                  <span className="text-xs text-[#6B7280] block mt-0.5">Provisioned {s.created_at ? new Date(s.created_at).toLocaleDateString() : 'N/A'}</span>
                </div>

                <div className="border-t border-gray-100 pt-4 flex justify-between items-center">
                  {isPending && (
                    <button 
                      onClick={() => handleActivate(s.store_id)}
                      className="px-3.5 py-1.5 bg-[#1A3C5E] text-white rounded-lg font-medium text-xs hover:opacity-90"
                    >
                      Promote to Live
                    </button>
                  )}
                  {isUnOnboarded && (
                    <button 
                      onClick={() => handleOpenOnboard(s.store_id)}
                      className="px-3.5 py-1.5 border border-gray-200 text-[#374151] rounded-lg hover:bg-gray-50 font-medium text-xs"
                    >
                      Configure Onboarding
                    </button>
                  )}
                  {isLive && (
                    <span className="text-xs font-semibold text-[#16A34A] flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Layout and configurations synced
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Checklist Configuration Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-white border border-[#E5E7EB] rounded-lg shadow-xl p-6 my-8">
            <button 
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-lg font-bold"
            >
              ✕
            </button>

            <div className="border-b border-[#E5E7EB] pb-3 mb-5">
              <h3 className="text-base font-bold text-[#111827]">Factory Onboarding Checklist</h3>
              <p className="text-xs text-[#6B7280]">Configure layout nodes, ROI parameters, and shift telemetry.</p>
            </div>

            {selectedOnboardStore ? (
              <div className="max-h-[60vh] overflow-y-auto rounded-lg">
                <FactoryOnboarding storeId={selectedOnboardStore} onSubmit={handleOnboardSubmit} />
              </div>
            ) : (
              <div className="py-12 text-center text-[#6B7280] italic text-xs">
                Select a registered factory store above to start.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// --- ANALYTICS PAGE ( dropdown selector + FactoryDashboard) ---
const AnalyticsPage = ({ 
  storeId, 
  password, 
  storeName,
  factoryConfigs,
  selectedRegistryClient
}: { 
  storeId: string | null; 
  password?: string; 
  storeName?: string;
  factoryConfigs: any[];
  selectedRegistryClient: string | null;
}) => {
  const isUserAdmin = storeId === 'admin';
  const [selectedAnalyticsStore, setSelectedAnalyticsStore] = useState<string>(() => {
    return isUserAdmin ? (selectedRegistryClient || '') : (storeId || '');
  });

  useEffect(() => {
    if (storeId && storeId !== 'admin') {
      setSelectedAnalyticsStore(storeId);
    } else if (isUserAdmin && selectedRegistryClient) {
      setSelectedAnalyticsStore(selectedRegistryClient);
    }
  }, [storeId, selectedRegistryClient, isUserAdmin]);

  const activeConfigs = factoryConfigs.find(f => f.store_id === selectedAnalyticsStore);
  const trialDay = activeConfigs?.trial_start
    ? Math.floor((Date.now() - new Date(activeConfigs.trial_start).getTime()) / 86400000) + 1
    : 1;

  const currentStoreName = activeConfigs ? activeConfigs.store_name || selectedAnalyticsStore : selectedAnalyticsStore;

  const renderContent = () => {
    if (!selectedAnalyticsStore || selectedAnalyticsStore === 'admin') {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 border border-dashed border-gray-200 bg-gray-50 rounded-lg text-center">
          <AlertTriangle className="w-12 h-12 text-[#CA8A04]/40 mb-3" />
          <h3 className="text-sm font-semibold uppercase text-gray-800">Select Store Context</h3>
          <p className="text-xs text-[#6B7280] max-w-sm mt-1">Select a client from the Clients tab first</p>
        </div>
      );
    }

    const isRetail = selectedAnalyticsStore.toLowerCase().includes('retail');
    
    if (isRetail) {
      return <RetailAnalytics storeId={selectedAnalyticsStore} />;
    }

    const hasFactoryConfig = factoryConfigs.some(f => f.store_id === selectedAnalyticsStore);
    if (!hasFactoryConfig) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 border border-dashed border-gray-200 bg-gray-50 rounded-lg text-center">
          <AlertTriangle className="w-12 h-12 text-[#CA8A04]/40 mb-3" />
          <h3 className="text-sm font-semibold uppercase text-gray-800">No Config Found</h3>
          <p className="text-xs text-[#6B7280] max-w-sm mt-1">No factory data yet for this client</p>
        </div>
      );
    }

    return (
      <div className="flex-1 overflow-y-auto">
        <ErrorBoundary>
          <FactoryDashboard 
            storeId={selectedAnalyticsStore} 
            password={password || 'auris123'} 
            factoryName={currentStoreName} 
            trialDay={trialDay} 
          />
        </ErrorBoundary>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <header className="flex justify-between items-center mb-8 pb-4 border-b border-[#E5E7EB]">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Analytics</h1>
          <p className="text-sm text-[#6B7280]">Industrial floor efficiency parameters and occupancy graphs.</p>
        </div>
        
        {/* Dropdown selector to change store context */}
        {factoryConfigs.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#6B7280]">Store context:</span>
            <select
              value={selectedAnalyticsStore}
              onChange={e => setSelectedAnalyticsStore(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#1A3C5E] bg-white font-medium text-gray-800"
            >
              <option value="" disabled>-- Select Store --</option>
              {factoryConfigs.map(f => (
                <option key={f.store_id} value={f.store_id}>{f.store_name || f.store_id}</option>
              ))}
            </select>
          </div>
        )}
      </header>

      {renderContent()}
    </div>
  );
};

// --- CORE LOGIN COMPONENT ---
const Login = ({ onLogin }: { onLogin: (s: string, p: string, name: string) => void }) => {
  const [usr, setUsr] = useState('');
  const [pwd, setPwd] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usr || !pwd) {
      setError("Please input credentials");
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: usr.trim(), password: pwd })
      });
      if (!res.ok) throw new Error("Invalid credentials");
      const data = await res.json();
      
      if (data.role === 'admin') {
        if (pwd !== ADMIN_KEY) {
          throw new Error("Invalid admin key");
        }
      }
      
      onLogin(data.store_id, pwd, data.store_name);
    } catch (e: any) {
      setError(e.message || "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4">
      <div className="w-full max-w-md p-8 bg-white border border-[#E5E7EB] rounded-lg shadow-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="p-3 bg-[#F8F9FA] border border-[#E5E7EB] rounded-lg mb-4 text-[#1A3C5E]">
            <Hexagon className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-[#1A3C5E] uppercase tracking-tight">Auris HQ</h1>
          <p className="text-xs text-[#6B7280] font-medium tracking-wide mt-1 uppercase">Skym Labs Pvt Ltd</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-sm text-gray-700">
          <div className="flex flex-col gap-1.5">
            <label className="font-semibold text-gray-800 text-xs">Store ID</label>
            <input 
              type="text"
              placeholder="e.g. SKM_NODE_01" 
              value={usr}
              onChange={e => setUsr(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1A3C5E] font-mono"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-semibold text-gray-800 text-xs">Password</label>
            <input 
              type="password" 
              placeholder="••••••••" 
              value={pwd}
              onChange={e => setPwd(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1A3C5E] font-mono"
              required
            />
          </div>

          {error && (
            <div className="text-xs font-semibold text-[#DC2626] font-mono text-center">
              {error}
            </div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-[#1A3C5E] text-white font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity text-sm text-center"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
};

// --- CORE APP LAYOUT ---
export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [password, setPassword] = useState<string>('');
  const [storeName, setStoreName] = useState<string>('');
  const [factoryConfigs, setFactoryConfigs] = useState<any[]>([]);
  const [selectedRegistryClient, setSelectedRegistryClient] = useState<string | null>(null);

  useEffect(() => {
    if (storeId) {
      fetch(`${API_BASE}/api/factory/configs`, {
        headers: { 'X-Admin-Key': ADMIN_KEY }
      })
      .then(res => res.json())
      .then(data => {
        if (data && data.configs) {
          setFactoryConfigs(data.configs);
        }
      })
      .catch(err => console.error("Error loading factory configs in App:", err));
    }
  }, [storeId, activeTab]);

  const handleSelectStore = (id: string) => {
    setStoreId(id);
    setActiveTab('factory_analytics');
  };

  const handleLoginSuccess = (id: string, pass: string, name: string) => {
    setStoreId(id);
    setPassword(pass);
    setStoreName(name);
    setActiveTab('overview');
  };

  const getSectionTitle = () => {
    switch (activeTab) {
      case 'overview': return 'Overview';
      case 'management': return 'Clients';
      case 'mapping': return 'Floor Plans';
      case 'calibration': return 'Calibration';
      case 'report': return 'AI Intelligence Report';
      case 'training': return 'Training';
      case 'factory': return 'Factory Parameters';
      case 'factory_analytics': return 'Analytics';
      default: return 'Auris HQ';
    }
  };

  if (!storeId) {
    return <Login onLogin={handleLoginSuccess} />;
  }

  return (
    <div className="flex h-screen bg-white overflow-hidden text-[#111827]">
      {/* LEFT SIDEBAR NAVIGATION */}
      <nav className="w-[220px] bg-[#F8F9FA] border-r border-[#E5E7EB] flex flex-col flex-shrink-0 py-6 px-4">
        {/* Auris Bold Logo top */}
        <div className="flex items-center gap-2 px-2.5 mb-8">
          <Hexagon className="w-5 h-5 text-[#1A3C5E]" />
          <span className="font-bold text-lg text-[#1A3C5E] tracking-wide">Auris</span>
        </div>

        {/* Text Navigation links below */}
        <div className="flex-1 flex flex-col gap-1 overflow-y-auto">
          <SidebarLink active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} label="Overview" />
          <SidebarLink active={activeTab === 'management'} onClick={() => {
            setSelectedRegistryClient(null);
            setActiveTab('management');
          }} label="Clients" />
          <SidebarLink active={activeTab === 'mapping'} onClick={() => setActiveTab('mapping')} label="Mapping" />
          <SidebarLink active={activeTab === 'calibration'} onClick={() => setActiveTab('calibration')} label="Calibration" />
          <SidebarLink active={activeTab === 'report'} onClick={() => setActiveTab('report')} label="Report" />
          <SidebarLink active={activeTab === 'training'} onClick={() => setActiveTab('training')} label="Training" />
          <SidebarLink active={activeTab === 'factory'} onClick={() => setActiveTab('factory')} label="Factory" />
          <SidebarLink active={activeTab === 'factory_analytics'} onClick={() => setActiveTab('factory_analytics')} label="Analytics" />
        </div>

        {/* Logout bottom */}
        <button 
          onClick={() => { setStoreId(null); setPassword(''); }}
          className="mt-auto w-full text-left px-2.5 py-2 font-medium text-xs text-[#6B7280] hover:text-[#DC2626] flex items-center gap-2 rounded hover:bg-gray-50 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </nav>

      {/* CORE WORKSPACE VIEWPORT */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
        {/* Top bar */}
        <header className="h-[60px] border-b border-[#E5E7EB] px-8 flex items-center flex-shrink-0 bg-white justify-between">
          <span className="font-semibold text-[#111827] text-sm uppercase tracking-wider">{getSectionTitle()}</span>
          <span className="text-xs text-[#6B7280] font-medium font-mono">Workspace ID: {storeId}</span>
        </header>

        {/* Main Content Pane */}
        <main className="flex-1 overflow-y-auto p-8 min-h-0 bg-white">
          {activeTab === 'overview' && (
            <OverviewPage 
              onSelectStore={handleSelectStore} 
              onSelectRegistryClient={(id) => {
                setSelectedRegistryClient(id);
                setActiveTab('management');
              }} 
            />
          )}
          {activeTab === 'management' && (
            <ClientsPage 
              onSelectStore={handleSelectStore} 
              initialSelectedClient={selectedRegistryClient} 
              clearInitialClient={() => setSelectedRegistryClient(null)} 
            />
          )}
          {activeTab === 'mapping' && <MappingPage storeId={storeId || ''} />}
          {activeTab === 'calibration' && <CalibrationTab storeId={storeId} password={password} />}
          {activeTab === 'report' && <ReportTab storeId={storeId} password={password} />}
          {activeTab === 'training' && <TrainingTab />}
          {activeTab === 'factory' && <FactoryOnboardingView storeId={storeId} />}
          {activeTab === 'factory_analytics' && (
            <AnalyticsPage 
              storeId={storeId} 
              password={password} 
              storeName={storeName} 
              factoryConfigs={factoryConfigs} 
              selectedRegistryClient={selectedRegistryClient}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// Helper nav link button component
function SidebarLink({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full text-left px-2.5 py-2 font-medium text-xs rounded transition-colors ${
        active 
          ? 'text-[#1A3C5E] bg-blue-50/55 border-l-2 border-[#1A3C5E] font-bold' 
          : 'text-[#6B7280] hover:text-[#111827] border-l-2 border-transparent hover:bg-gray-50/70'
      }`}
    >
      {label}
    </button>
  );
}
