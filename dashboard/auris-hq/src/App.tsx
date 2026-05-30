import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, Video, Target, Cpu, 
  LogOut, Plus, ChevronRight, Activity, Database, Check, X, Download
} from 'lucide-react';

const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE = 'https://auris.skymlabs.com';

// Global fetch wrapper to handle auth
const fetchAuth = async (url: string, options: any = {}) => {
  const token = localStorage.getItem('auris_token');
  if (token) {
    options.headers = { ...options.headers, 'Authorization': `Bearer ${token}` };
  }
  const res = await fetch(url, options);
  if (res.status === 401 || res.status === 403) {
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
const ClientsTab = () => {
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<any>(null);

  // Add Client Modal states
  const [showAdd, setShowAdd] = useState(false);
  const [newStore, setNewStore] = useState({
    store_id: '',
    store_name: '',
    plan: 'FACTORY',
    total_headcount: 10,
    shift_start: '09:00',
    shift_end: '18:00',
    wage_per_day: 500
  });
  const [adding, setAdding] = useState(false);

  // Edit Configuration states
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  
  const [inviteUrl, setInviteUrl] = useState<string>('');

  const handleGenerateInvite = async () => {
    if (!selectedClient) return;
    try {
      const res = await fetchAuth(`${API_BASE}/api/admin/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: selectedClient.store_id })
      });
      if (res.ok) {
        const data = await res.json();
        setInviteUrl(data.signup_url);
        setSelectedClient((prev: any) => ({
          ...prev,
          invite_code: data.invite_code,
          invite_expiry: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
        }));
      }
    } catch (e) {
      alert('Failed to generate invite');
    }
  };

  useEffect(() => {
    fetchAuth(`${API_BASE}/api/admin/stores`)
    .then(res => res.json())
    .then(data => setClients(data.stores || []))
    .catch(console.error);
  }, []);

  const handleAddClient = async () => {
    if (!newStore.store_id || !newStore.store_name) {
      alert('Please fill out Store ID and Store Name');
      return;
    }
    setAdding(true);
    try {
      const res = await fetchAuth(`${API_BASE}/api/admin/stores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStore)
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setClients(prev => [...prev, data.store || data]);
      setShowAdd(false);
      // Reset form
      setNewStore({
        store_id: '',
        store_name: '',
        plan: 'FACTORY',
        total_headcount: 10,
        shift_start: '09:00',
        shift_end: '18:00',
        wage_per_day: 500
      });
    } catch (e) {
      alert('Failed to create client');
    } finally {
      setAdding(false);
    }
  };

  const handleEditSave = async () => {
    try {
      const res = await fetchAuth(`${API_BASE}/api/admin/stores/${selectedClient.store_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData)
      });
      if (!res.ok) throw new Error('Save failed');
      setClients(prev => prev.map(c => 
        c.store_id === selectedClient.store_id ? {...c, ...editData} : c
      ));
      setSelectedClient((prev: any) => ({ ...prev, ...editData }));
      setEditing(false);
    } catch {
      alert('Save failed');
    }
  };

  return (
    <div className="flex gap-6 h-full relative">
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-[#111827]">Clients</h2>
          <button 
            onClick={() => setShowAdd(true)}
            className="bg-[#2563EB] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus size={16} /> Add Client
          </button>
        </div>
        <Card className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-gray-50/50 sticky top-0">
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Store Name</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Onboarding</th>
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
                  onClick={async () => { 
                    setEditing(false); 
                    setSelectedClient(client);
                    try {
                      const res = await fetchAuth(`${API_BASE}/api/admin/stores/${client.store_id}`);
                      if (res.ok) {
                        const fullData = await res.json();
                        setSelectedClient(fullData);
                      }
                    } catch (e) {}
                  }}
                >
                  <td className="px-4 py-4 text-sm font-medium text-[#111827]">{client.store_name}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${client.status === 'live' ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className="text-sm text-gray-600 capitalize">{client.status || 'Offline'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`text-xs px-2 py-1 rounded-md font-medium ${client.onboarded ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {client.onboarded ? 'Complete ✓' : 'Pending'}
                    </span>
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
            {editing ? (
              <div className="space-y-4">
                <h3 className="text-base font-semibold text-[#111827] mb-4">Edit Configuration</h3>
                
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Store Name</label>
                  <input
                    type="text"
                    value={editData?.store_name || ''}
                    onChange={e => setEditData((prev: any) => ({ ...prev, store_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Shift Start</label>
                  <input
                    type="time"
                    value={editData?.shift_start || ''}
                    onChange={e => setEditData((prev: any) => ({ ...prev, shift_start: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Shift End</label>
                  <input
                    type="time"
                    value={editData?.shift_end || ''}
                    onChange={e => setEditData((prev: any) => ({ ...prev, shift_end: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Total Headcount</label>
                  <input
                    type="number"
                    value={editData?.total_headcount || 0}
                    onChange={e => setEditData((prev: any) => ({ ...prev, total_headcount: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Wage Per Day (₹)</label>
                  <input
                    type="number"
                    value={editData?.wage_per_day || 0}
                    onChange={e => setEditData((prev: any) => ({ ...prev, wage_per_day: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button onClick={() => setEditing(false)} className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">
                    Cancel
                  </button>
                  <button onClick={handleEditSave} className="flex-1 bg-[#2563EB] text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700">
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h3 className="text-base font-semibold text-[#111827] mb-1">{selectedClient.store_name}</h3>
                <p className="text-sm text-gray-500 font-mono mb-6">{selectedClient.store_id}</p>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1">API Key</label>
                    <div className="bg-gray-50 border border-[#E5E7EB] rounded px-3 py-2 text-sm font-mono text-gray-800 break-all">
                      {selectedClient.api_key || '••••••••••••••••••••••••••••••••'}
                    </div>
                  </div>
                  
                  <div className="space-y-2 text-sm text-gray-600">
                    <div><span className="font-medium text-gray-500">Shift:</span> {selectedClient.shift_start || 'N/A'} - {selectedClient.shift_end || 'N/A'}</div>
                    <div><span className="font-medium text-gray-500">Headcount:</span> {selectedClient.total_headcount || 'N/A'}</div>
                    <div><span className="font-medium text-gray-500">Wage:</span> ₹{selectedClient.wage_per_day || 'N/A'} / day</div>
                  </div>

                  <div className="pt-4 border-t border-[#E5E7EB] space-y-3">
                    <button 
                      onClick={() => { setEditing(true); setEditData(selectedClient); }}
                      className="w-full bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                    >
                      Edit Configuration
                    </button>
                    
                    <div className="pt-2">
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1">
                        Self-Signup Status
                      </label>
                      <div className="flex items-center justify-between text-sm">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${selectedClient.onboarded ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {selectedClient.onboarded ? 'Complete ✓' : 'Pending'}
                        </span>
                        <button 
                          onClick={handleGenerateInvite}
                          className="text-xs font-medium text-[#2563EB] hover:underline"
                        >
                          Generate Invite Link
                        </button>
                      </div>
                      
                      {(selectedClient.invite_code || inviteUrl) && (
                        <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs space-y-2">
                          <p className="font-semibold text-blue-800">Copy Signup Link:</p>
                          <input 
                            type="text" 
                            readOnly 
                            value={inviteUrl || `https://auris.skymlabs.com/signup/${selectedClient.invite_code}`}
                            onClick={(e) => {
                              (e.target as HTMLInputElement).select();
                              navigator.clipboard.writeText((e.target as HTMLInputElement).value);
                              alert('Link copied to clipboard!');
                            }}
                            className="w-full border border-blue-200 bg-white rounded p-1 text-[11px] font-mono cursor-pointer focus:outline-none"
                          />
                          <p className="text-[10px] text-blue-600">Expires in 7 days</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold mb-4 text-[#111827]">Add Client</h3>
            <div className="space-y-3">
              {[
                ['store_id', 'Store ID', 'text'],
                ['store_name', 'Store Name', 'text'],
                ['total_headcount', 'Total Headcount', 'number'],
                ['shift_start', 'Shift Start', 'time'],
                ['shift_end', 'Shift End', 'time'],
                ['wage_per_day', 'Wage Per Day (₹)', 'number'],
              ].map(([key, label, type]) => (
                <div key={key}>
                  <label className="text-xs font-medium text-gray-500 block mb-1">{label}</label>
                  <input
                    type={type}
                    value={(newStore as any)[key]}
                    onChange={e => setNewStore(prev => ({
                      ...prev,
                      [key]: type === 'number' ? Number(e.target.value) : e.target.value
                    }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 text-[#111827]"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button 
                onClick={() => setShowAdd(false)} 
                className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button 
                onClick={handleAddClient} 
                disabled={adding} 
                className="flex-1 bg-[#2563EB] text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {adding ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Custom Snapshot component to fetch image securely with auth token
const LiveSnapshot = ({ storeId, cameraId }: { storeId: string, cameraId: string }) => {
  const [src, setSrc] = useState<string>('');
  
  useEffect(() => {
    let active = true;
    const fetchImage = async () => {
      try {
        const res = await fetchAuth(`${API_BASE}/api/live/snapshot?store_id=${storeId}&camera_id=${cameraId}`);
        if (res.ok && active) {
          const blob = await res.blob();
          setSrc(URL.createObjectURL(blob));
        }
      } catch (e) {}
    };
    
    fetchImage();
    const interval = setInterval(fetchImage, 5000); // refresh every 5s
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [storeId, cameraId]);

  if (!src) return <div className="w-full h-full bg-gray-200 animate-pulse" />;
  
  return (
    <img 
      src={src}
      alt={cameraId}
      className="w-full h-full object-cover"
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
};

// TAB 2: Live
const LiveTab = () => {
  const [cameras, setCameras] = useState<any[]>([]);

  const fetchData = useCallback(() => {
    fetchAuth(`${API_BASE}/api/live/cameras`)
      .then(res => res.json())
      .then(data => {
        const cams: any[] = [];
        Object.entries(data.stores || {}).forEach(([storeId, store]: [string, any]) => {
          (store.cameras || []).forEach((c: any) => {
            cams.push({ store_id: storeId, store_name: store.store_name, ...c });
          });
        });
        setCameras(cams);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetchData();
    const int = setInterval(fetchData, 10000);
    return () => clearInterval(int);
  }, [fetchData]);

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-lg font-semibold text-[#111827] mb-4">Live Cameras</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pb-8">
        {cameras.map(cam => (
          <Card key={`${cam.store_id}-${cam.camera_id}`} className="flex flex-col">
            <div className="aspect-video bg-gray-100 border-b border-[#E5E7EB] relative overflow-hidden flex items-center justify-center">
               <LiveSnapshot storeId={cam.store_id} cameraId={cam.camera_id} />
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
      const res = await fetchAuth(
        `${API_BASE}/api/training/export-yolo-full`,
        { method: 'GET' }
      );
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `auris_training_${new Date().toISOString().split('T')[0]}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Export failed — check if training data exists first.');
    }
  };

  const handleReview = async (hc: any, approved: boolean) => {
    try {
      await fetchAuth(`${API_BASE}/api/training/hard-cases/${hc._id}/review`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ approved })
      });
      setHardCases(prev => prev.filter(c => c._id !== hc._id));
      setStats(prev => ({
        ...prev,
        hard_cases_pending: Math.max(0, prev.hard_cases_pending - 1)
      }));
    } catch {
      // Silently remove from UI anyway — don't block the reviewer
      setHardCases(prev => prev.filter(c => c._id !== hc._id));
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
                  <button 
                    onClick={() => handleReview(hc, true)} 
                    className="flex-1 bg-white border border-gray-200 text-green-600 py-1 rounded flex justify-center hover:bg-green-50 transition-colors"
                  >
                    <Check size={14} />
                  </button>
                  <button 
                    onClick={() => handleReview(hc, false)} 
                    className="flex-1 bg-white border border-gray-200 text-red-600 py-1 rounded flex justify-center hover:bg-red-50 transition-colors"
                  >
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
  const [clients, setClients] = useState<any[]>([]);

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

    fetchAuth(`${API_BASE}/api/admin/stores`)
      .then(res => res.json())
      .then(data => {
        const stores = data.stores || [];
        Promise.all(stores.map(async (store: any) => {
          try {
            const resDetails = await fetchAuth(`${API_BASE}/api/admin/stores/${store.store_id}`);
            if (resDetails.ok) {
              return await resDetails.json();
            }
          } catch (e) {}
          return store;
        })).then(fullStores => setClients(fullStores));
      })
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

      {clients.some(c => c.prefill) && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Pre-installation Onboarding Readiness</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clients.filter(c => c.prefill).map(client => (
              <div key={client.store_id} className="border border-green-200 bg-green-50/50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between items-start">
                  <h4 className="font-semibold text-gray-900 text-sm">{client.store_name}</h4>
                  <span className="text-[10px] bg-green-100 text-green-800 font-bold px-2 py-0.5 rounded-full uppercase">
                    Pre-install data received ✓
                  </span>
                </div>
                <div className="text-xs text-gray-600 space-y-1 pt-1">
                  <div><span className="font-medium text-gray-500">Camera Brand:</span> {client.prefill.camera_brand}</div>
                  <div><span className="font-medium text-gray-500">Camera Count:</span> {client.prefill.camera_count}</div>
                  <div><span className="font-medium text-gray-500">WiFi SSID:</span> {client.prefill.wifi_ssid}</div>
                  <div className="pt-2 text-[10px] font-bold text-green-700 uppercase tracking-wider">
                    Ready for Auris edge provisioning ✓
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

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
      const res = await fetchAuth(`${API_BASE}/api/admin/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: 'admin', password: password.trim() })
      });
      if (!res.ok) throw new Error('Invalid credentials');
      const data = await res.json();
      localStorage.setItem('auris_token', data.token);
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
            <label htmlFor="store_id" className="block text-sm font-medium text-[#111827] mb-1.5">Store ID</label>
            <input 
              id="store_id"
              name="store_id"
              type="text" 
              value="admin" 
              readOnly 
              className="w-full bg-gray-50 border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm text-gray-500 focus:outline-none" 
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[#111827] mb-1.5">Password</label>
            <input 
              id="password"
              name="password"
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
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
    const stored = localStorage.getItem('auris_token');
    if (stored) setToken(stored);
    
    const handler = () => {
      localStorage.removeItem('auris_token');
      setToken(null);
    };
    window.addEventListener('unauthorized', handler);
    return () => window.removeEventListener('unauthorized', handler);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('auris_token');
    setToken(null);
  };

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
            onClick={handleLogout}
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
