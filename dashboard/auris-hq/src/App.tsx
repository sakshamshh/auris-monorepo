import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, Video, Target, Cpu, 
  LogOut, Plus, ChevronRight, Activity, Database, Check, X, Download
} from 'lucide-react';

const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE = IS_DEV ? 'http://localhost:8000' : 'https://auris.skymlabs.com';
const ADMIN_KEY = 'dcd62cb40e5fa0870d73c79fbd521d05';

// Global fetch wrapper to handle 401 Unauthorized
const fetchAuth = async (url: string, options: RequestInit = {}) => {
  const res = await fetch(url, options);
  if (res.status === 401) {
    window.dispatchEvent(new Event('unauthorized'));
  }
  return res;
};

// --- Reusable Components ---
const Card = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-white border border-[#E5E7EB] rounded-xl overflow-hidden ${className}`}>
    {children}
  </div>
);

// --- Tabs ---

// TAB 1: Clients
const ClientsTab = ({ token }: { token: string }) => {
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<any>(null);

  useEffect(() => {
    // Data from: GET /api/admin/stores (X-Admin-Key header)
    fetchAuth(`${API_BASE}/admin/stores`, {
      headers: { 'X-Admin-Key': ADMIN_KEY }
    })
    .then(res => res.json())
    .then(data => setClients(data.stores || []))
    .catch(console.error);
  }, []);

  return (
    <div className="flex gap-6 h-full">
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-[#111827]">Clients</h2>
          <button className="bg-[#2563EB] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2">
            <Plus size={16} /> Add Client
          </button>
        </div>
        <Card className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-gray-50/50 sticky top-0">
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Store Name</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Plan</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Last Seen</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Cameras</th>
                <th className="px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {clients.map(client => (
                <tr 
                  key={client.store_id} 
                  className={`border-b border-[#E5E7EB] last:border-0 cursor-pointer hover:bg-gray-50 transition-colors ${selectedClient?.store_id === client.store_id ? 'bg-gray-50' : ''}`}
                  onClick={() => setSelectedClient(client)}
                >
                  <td className="px-4 py-4 text-sm font-medium text-[#111827]">{client.store_name}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${client.status === 'live' ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className="text-sm text-gray-600 capitalize">{client.status || 'Offline'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-md font-medium">{client.plan || 'FACTORY'}</span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500 font-mono">
                    {client.last_blob ? new Date(client.last_blob).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600">{client.cameras_count || 0}</td>
                  <td className="px-4 py-4 text-right">
                    <ChevronRight size={16} className="text-gray-400 inline" />
                  </td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-gray-500 text-sm">No clients found</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      {selectedClient && (
        <div className="w-80 flex-shrink-0 flex flex-col min-h-0 pt-10">
          <Card className="p-5">
            <h3 className="text-base font-semibold text-[#111827] mb-1">{selectedClient.store_name}</h3>
            <p className="text-sm text-gray-500 font-mono mb-6">{selectedClient.store_id}</p>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1">API Key</label>
                <div className="bg-gray-50 border border-[#E5E7EB] rounded px-3 py-2 text-sm font-mono text-gray-800 break-all">
                  {selectedClient.api_key || '••••••••••••••••••••••••••••••••'}
                </div>
              </div>
              
              <div className="pt-4 border-t border-[#E5E7EB]">
                <button className="w-full bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                  Edit Configuration
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

// TAB 2: Live
const LiveTab = ({ token }: { token: string }) => {
  const [cameras, setCameras] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetchAuth(`${API_BASE}/api/live/cameras`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCameras(data.cameras || []);
      }
    } catch (e) {
      console.error(e);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
    const int = setInterval(fetchData, 10000); // Auto-refreshes every 10 seconds
    return () => clearInterval(int);
  }, [fetchData]);

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-lg font-semibold text-[#111827] mb-4">Live Cameras</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pb-8">
        {cameras.map(cam => (
          <Card key={cam.camera_id} className="flex flex-col">
            <div className="aspect-video bg-gray-100 border-b border-[#E5E7EB] relative overflow-hidden flex items-center justify-center">
               <img 
                 src={`${API_BASE}/api/live/snapshot?camera_id=${cam.camera_id}`}
                 alt={cam.camera_id}
                 className="w-full h-full object-cover"
                 onError={(e) => { e.currentTarget.style.display = 'none'; }}
               />
               <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                 LIVE
               </div>
            </div>
            <div className="p-4 flex justify-between items-end">
              <div>
                <p className="text-sm font-medium text-[#111827]">{cam.store_name}</p>
                <p className="text-xs text-gray-500 font-mono mt-1">{cam.camera_id}</p>
                <p className="text-xs text-gray-400 mt-1">{cam.last_timestamp ? new Date(cam.last_timestamp).toLocaleTimeString() : ''}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-gray-500 uppercase font-medium block">People</span>
                <span className="text-2xl font-bold text-[#2563EB]">{cam.people_now || 0}</span>
              </div>
            </div>
          </Card>
        ))}
        {cameras.length === 0 && (
          <div className="col-span-full py-12 text-center text-gray-500">No active cameras found.</div>
        )}
      </div>
    </div>
  );
};

// TAB 3: Training
const TrainingTab = ({ token }: { token: string }) => {
  const [stats, setStats] = useState({ hard_cases_pending: 0, pseudo_labels: 0, training_frames: 0 });
  const [hardCases, setHardCases] = useState<any[]>([]);

  useEffect(() => {
    fetchAuth(`${API_BASE}/api/training/stats`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => setStats(data))
    .catch(console.error);

    fetchAuth(`${API_BASE}/api/training/hard-cases`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => setHardCases(data.cases || []))
    .catch(console.error);
  }, [token]);

  const handleExport = async () => {
    try {
      await fetchAuth(`${API_BASE}/api/training/export-yolo-full`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      alert('Export triggered successfully.');
    } catch (e) {
      console.error(e);
      alert('Export failed.');
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-semibold text-[#111827]">Training & Refinement</h2>
        <button onClick={handleExport} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2">
          <Download size={16} /> Export Dataset
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6 flex-shrink-0">
        <Card className="p-4 flex flex-col justify-center">
          <span className="text-xs text-gray-500 uppercase font-medium">Pending Hard Cases</span>
          <span className="text-3xl font-semibold text-[#111827] mt-1">{stats.hard_cases_pending || 0}</span>
        </Card>
        <Card className="p-4 flex flex-col justify-center">
          <span className="text-xs text-gray-500 uppercase font-medium">Pseudo Labels</span>
          <span className="text-3xl font-semibold text-[#111827] mt-1">{stats.pseudo_labels || 0}</span>
        </Card>
        <Card className="p-4 flex flex-col justify-center">
          <span className="text-xs text-gray-500 uppercase font-medium">Total Training Frames</span>
          <span className="text-3xl font-semibold text-[#111827] mt-1">{stats.training_frames || 0}</span>
        </Card>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-8">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {hardCases.map((hc, i) => (
            <Card key={i} className="flex flex-col">
              <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden p-2">
                {hc.crop_b64 ? (
                  <img src={`data:image/jpeg;base64,${hc.crop_b64}`} alt="Hard Case" className="max-w-full max-h-full rounded" />
                ) : (
                  <span className="text-xs text-gray-400">No Image</span>
                )}
              </div>
              <div className="p-3 border-t border-[#E5E7EB] bg-gray-50 flex flex-col justify-between">
                <div className="text-xs text-gray-600 mb-2 font-medium">Conf: {(hc.confidence * 100).toFixed(1)}%</div>
                <div className="flex gap-2">
                  <button className="flex-1 bg-white border border-gray-200 text-green-600 py-1 rounded flex justify-center hover:bg-green-50 transition-colors">
                    <Check size={14} />
                  </button>
                  <button className="flex-1 bg-white border border-gray-200 text-red-600 py-1 rounded flex justify-center hover:bg-red-50 transition-colors">
                    <X size={14} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
          {hardCases.length === 0 && (
             <div className="col-span-full py-12 text-center text-gray-500">No hard cases pending review.</div>
          )}
        </div>
      </div>
    </div>
  );
};

// TAB 4: System
const SystemTab = ({ token }: { token: string }) => {
  const [health, setHealth] = useState({ status: 'unknown', db_timeout_count: 0, queue_depth: 0 });
  const [devices, setDevices] = useState<any[]>([]);

  useEffect(() => {
    fetchAuth(`${API_BASE}/health`)
      .then(res => res.json())
      .then(data => setHealth(data))
      .catch(console.error);

    fetchAuth(`${API_BASE}/api/edge/heartbeats`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setDevices(data.devices || []))
      .catch(console.error);
  }, [token]);

  return (
    <div className="flex flex-col gap-6 h-full">
      <h2 className="text-lg font-semibold text-[#111827]">System Diagnostics</h2>
      
      <div className="grid grid-cols-3 gap-4 flex-shrink-0">
        <Card className="p-5 flex items-center justify-between">
           <div>
             <span className="text-xs text-gray-500 uppercase font-medium">Server Status</span>
             <div className="text-lg font-semibold text-[#111827] mt-1 flex items-center gap-2">
               <div className={`w-2 h-2 rounded-full ${health.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`} />
               {(health.status || 'unknown').toUpperCase()}
             </div>
           </div>
           <Activity className="text-gray-300" size={32} />
        </Card>
        <Card className="p-5 flex items-center justify-between">
           <div>
             <span className="text-xs text-gray-500 uppercase font-medium">DB Timeouts</span>
             <div className="text-lg font-semibold text-[#111827] mt-1">{health.db_timeout_count || 0}</div>
           </div>
           <Database className="text-gray-300" size={32} />
        </Card>
        <Card className="p-5 flex items-center justify-between">
           <div>
             <span className="text-xs text-gray-500 uppercase font-medium">Queue Depth</span>
             <div className="text-lg font-semibold text-[#111827] mt-1">{health.queue_depth || 0}</div>
           </div>
           <Cpu className="text-gray-300" size={32} />
        </Card>
      </div>

      <Card className="flex-1 overflow-y-auto">
        <div className="p-4 border-b border-[#E5E7EB] bg-gray-50/50 sticky top-0">
          <h3 className="text-sm font-medium text-gray-700">Edge Devices Topology</h3>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#E5E7EB]">
               <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Store ID</th>
               <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Camera ID</th>
               <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Last Heartbeat</th>
               <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody>
             {devices.map((dev, i) => (
                <tr key={i} className="border-b border-[#E5E7EB] last:border-0 hover:bg-gray-50">
                   <td className="px-4 py-4 text-sm font-mono text-[#111827] font-medium">{dev.store_id}</td>
                   <td className="px-4 py-4 text-sm font-mono text-gray-600">{dev.camera_id}</td>
                   <td className="px-4 py-4 text-sm text-gray-500">{new Date(dev.last_heartbeat).toLocaleString()}</td>
                   <td className="px-4 py-4">
                     <span className={`text-xs px-2 py-1 rounded-md font-medium ${dev.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                       {dev.status || 'offline'}
                     </span>
                   </td>
                </tr>
             ))}
             {devices.length === 0 && (
               <tr><td colSpan={4} className="text-center py-12 text-gray-500 text-sm">No edge devices connected.</td></tr>
             )}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

// Login
const LoginScreen = ({ onLogin }: { onLogin: (t: string) => void }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: 'admin', password })
      });
      if (!res.ok) throw new Error('Invalid credentials');
      const data = await res.json();
      onLogin(data.token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4 font-sans">
      <Card className="w-full max-w-sm p-8 shadow-sm">
        <div className="w-10 h-10 bg-[#2563EB] rounded-lg mb-6 flex items-center justify-center text-white font-bold text-xl">A</div>
        <h1 className="text-xl font-semibold text-[#111827] mb-6">Sign in to AURIS</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#111827] mb-1.5">Store ID</label>
            <input 
              type="text" 
              value="admin" 
              disabled 
              className="w-full bg-gray-50 border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm text-gray-500 focus:outline-none" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#111827] mb-1.5">Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
              autoFocus 
              className="w-full bg-white border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-all" 
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button 
            type="submit" 
            disabled={loading} 
            className="w-full bg-[#111827] text-white py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors mt-2"
          >
            {loading ? 'Authenticating...' : 'Continue'}
          </button>
        </form>
      </Card>
    </div>
  );
};

// Main App
export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('clients');

  useEffect(() => {
    const handler = () => setToken(null);
    window.addEventListener('unauthorized', handler);
    return () => window.removeEventListener('unauthorized', handler);
  }, []);

  if (!token) {
    return <LoginScreen onLogin={setToken} />;
  }

  const tabs = [
    { id: 'clients', label: 'Clients', icon: Users, component: ClientsTab },
    { id: 'live', label: 'Live', icon: Video, component: LiveTab },
    { id: 'training', label: 'Training', icon: Target, component: TrainingTab },
    { id: 'system', label: 'System', icon: Cpu, component: SystemTab },
  ];

  const ActiveComponent = tabs.find(t => t.id === activeTab)?.component || ClientsTab;

  return (
    <div className="flex h-screen bg-[#F9FAFB] text-[#111827] font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-[#E5E7EB] flex flex-col flex-shrink-0">
        <div className="p-5 border-b border-[#E5E7EB] flex items-center gap-3">
          <div className="w-8 h-8 bg-[#2563EB] rounded-md flex items-center justify-center text-white font-bold text-lg">A</div>
          <span className="font-semibold text-[#111827] tracking-tight">AURIS HQ</span>
        </div>
        
        <nav className="flex-1 py-6 space-y-1 px-4">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-2">Menu</div>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id 
                  ? 'bg-gray-100 text-[#111827]' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <tab.icon size={18} className={activeTab === tab.id ? 'text-[#111827]' : 'text-gray-400'} />
              {tab.label}
            </button>
          ))}
        </nav>
        
        <div className="p-4 border-t border-[#E5E7EB]">
          <button 
            onClick={() => setToken(null)}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <LogOut size={18} className="text-gray-400" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-8 min-w-0 h-full overflow-hidden">
        <ActiveComponent token={token} />
      </main>
    </div>
  );
}
