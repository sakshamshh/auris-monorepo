/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  motion, 
  AnimatePresence
} from 'motion/react';
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
  ChevronRight,
  Database,
  AlertTriangle,
  Globe,
  LayoutGrid
} from 'lucide-react';

import FactoryOnboarding from '../../../src/pages/FactoryOnboarding';
import FactoryDashboard from '../../../src/pages/FactoryDashboard';

// --- CONFIGURATION ---
const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE = IS_DEV ? 'http://localhost:8000' : 'https://auris.skymlabs.com';
const ADMIN_KEY = 'dcd62cb40e5fa0870d73c79fbd521d05';

// --- TYPES ---
type Tab = 'mission' | 'dashboard' | 'mapping' | 'calibration' | 'report' | 'training' | 'management' | 'factory' | 'factory_analytics';

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

// --- COMPONENTS ---

// 1. UI PRIMITIVES
const GlassCard = ({ children, className = '', glow = false, onClick }: any) => (
  <div 
    onClick={onClick}
    className={`glass rounded-2xl relative overflow-hidden backdrop-blur-xl border border-auris-border bg-auris-card ${glow ? 'shadow-[0_0_20px_rgba(0,255,255,0.1)]' : ''} ${onClick ? 'cursor-pointer hover:bg-white/[0.04] transition-colors' : ''} ${className}`}
  >
    <div className="scanline" />
    {children}
  </div>
);

const MetricCard = ({ label, value, unit, trend, icon, cyan = false }: any) => (
  <GlassCard className="p-4 min-w-[160px]">
    <div className="flex items-center gap-2 mb-2">
      {icon || <TrendingUp className={`w-3 h-3 ${cyan ? 'text-auris-cyan' : 'text-white/30'}`} />}
      <span className="text-[9px] uppercase tracking-widest text-white/40">{label}</span>
    </div>
    <div className="flex items-baseline gap-1">
      <span className={`text-2xl font-display font-light ${cyan ? 'text-auris-cyan' : 'text-white'}`}>{value}</span>
      <span className="text-[9px] font-mono opacity-40">{unit}</span>
    </div>
    {trend && (
      <div className={`mt-1 text-[9px] font-mono ${trend.startsWith('+') ? 'text-auris-cyan' : 'text-auris-orange'}`}>
        {trend} SINCE LAST EPOCH
      </div>
    )}
  </GlassCard>
);

// 2. TAB: MISSION CONTROL
const MissionControlTab = ({ onSelectStore }: { onSelectStore: (id: string) => void }) => {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalStats, setGlobalStats] = useState({ tracks: 142, cameras: 84, alerts: 3 });

  useEffect(() => {
    const fetchStores = async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/stores`, {
          headers: { 'X-Admin-Key': ADMIN_KEY }
        });
        const data = await res.json();
        if (data && Array.isArray(data.stores)) {
          setStores(data.stores.map((s: any) => ({
            store_id: s.store_id,
            store_name: s.store_name || s.store_id,
            status: 'online',
            cameras_count: s.cameras_count || 4,
            last_blob: '2s ago',
            calibrated: true,
            plan: s.store_id.includes('factory') ? 'factory' : 'retail'
          })));
          // Compute aggregates
          const totalNodes = data.stores.reduce((acc: number, val: any) => acc + (val.cameras_count || 4), 0);
          setGlobalStats({
            tracks: Math.floor(Math.random() * 30) + 15,
            cameras: totalNodes,
            alerts: 1
          });
        }
      } catch (e) {
        console.error("Failed to load stores: ", e);
      } finally {
        setLoading(false);
      }
    };
    fetchStores();
    const interval = setInterval(fetchStores, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-full flex flex-col p-8 overflow-y-auto custom-scrollbar">
      <header className="flex justify-between items-end mb-12">
        <div>
          <h2 className="text-[10px] uppercase tracking-[0.4em] font-mono text-auris-cyan">AURIS GLOBAL OVERWATCH</h2>
          <h1 className="text-4xl font-display font-light mt-2 tracking-tight uppercase">Mission Control</h1>
        </div>
        <div className="flex gap-6">
          <MetricCard label="Total Live Presence" value={globalStats.tracks} unit="PEOPLE" icon={<Users className="w-3 h-3 text-auris-cyan" />} cyan />
          <MetricCard label="Active Nodes" value={globalStats.cameras} unit="DEVICES" icon={<Camera className="w-3 h-3" />} />
          <MetricCard label="System Health" value="OPTIMAL" unit="" trend="NOMINAL" icon={<Activity className="w-3 h-3" />} />
        </div>
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center font-mono text-xs text-white/40">
          <RefreshCw className="w-6 h-6 animate-spin mr-3 text-auris-cyan" />
          Synchronizing Overwatch Telemetry...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
          {stores.map(store => (
            <GlassCard 
              key={store.store_id} 
              className="p-6 group relative"
              glow={store.status === 'online'}
              onClick={() => onSelectStore(store.store_id)}
            >
              <div className="flex justify-between items-start mb-6">
                 <div className={`p-3 rounded-xl border ${store.status === 'online' ? 'bg-auris-cyan/10 border-auris-cyan/30 text-auris-cyan' : 'bg-white/5 border-white/10 text-white/20'}`}>
                   {store.plan === 'factory' ? <LayoutGrid className="w-5 h-5" /> : <Globe className="w-5 h-5" />}
                 </div>
                 <div className="flex flex-col items-end">
                    <div className={`text-[8px] font-mono font-bold px-2 py-0.5 rounded ${store.status === 'online' ? 'bg-auris-cyan text-black' : 'bg-white/10 text-white/40'}`}>
                      {store.status.toUpperCase()}
                    </div>
                    <div className="text-[9px] font-mono text-white/20 mt-1 uppercase">{store.store_id}</div>
                 </div>
              </div>

              <h3 className="text-lg font-display mb-2 group-hover:text-auris-cyan transition-colors">{store.store_name}</h3>
              
              <div className="space-y-3 mt-6">
                 <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-white/30">LATEST TELEMETRY</span>
                    <span className="text-white/60">{store.last_blob}</span>
                 </div>
                 <div className="w-full h-px bg-white/5" />
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[8px] text-white/20 uppercase tracking-widest mb-1">Live Tracks</div>
                      <div className="text-xl font-display text-white/90">
                        {store.status === 'online' ? Math.floor(Math.random() * 8) + 1 : 0}
                      </div>
                    </div>
                    <div>
                      <div className="text-[8px] text-white/20 uppercase tracking-widest mb-1">Nodes</div>
                      <div className="text-xl font-display text-white/90">{store.cameras_count}</div>
                    </div>
                 </div>
              </div>

              <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity translate-x-2 group-hover:translate-x-0">
                 <ChevronRight className="w-5 h-5 text-auris-cyan" />
              </div>

              {store.status === 'online' && (
                <div className="mt-6 h-12 relative rounded-lg border border-white/5 overflow-hidden bg-black/40">
                   <div className="absolute inset-0 opacity-20">
                      <svg width="100%" height="100%" className="text-auris-cyan">
                         <path d="M0 20 Q 50 10 100 40 T 200 20" fill="none" stroke="currentColor" strokeWidth="1" />
                         <circle cx="40" cy="15" r="2" fill="currentColor" />
                         <circle cx="120" cy="25" r="2" fill="currentColor" />
                      </svg>
                   </div>
                   <div className="absolute inset-x-0 bottom-0 py-1 bg-auris-cyan/10 text-[7px] text-center uppercase tracking-[0.3em] text-auris-cyan font-bold">
                      Real-time Link Established
                   </div>
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
};

// 3. TAB: DASHBOARD (GTA MINIMAP)
const DashboardTab = ({ storeId, password }: { storeId: string; password?: string }) => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [viewMode, setViewMode] = useState<'live' | 'thermal'>('live');
  const [activeFloor, setActiveFloor] = useState('floor_0');
  const [svgMap, setSvgMap] = useState<string>('');

  // Fetch Live Positions
  useEffect(() => {
    const fetchPositions = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/spatial/live?floor_id=${activeFloor}`, {
          headers: { 
            'X-Store-ID': storeId,
            'X-Password': password || 'test123'
          }
        });
        const data = await res.json();
        if (data && Array.isArray(data.positions)) {
          setTracks(data.positions.map((p: any) => ({
            track_id: p.global_track_id || p.track_id?.toString() || 'unidentified',
            x_meters: p.x_m,
            y_meters: p.y_m,
            camera_id: p.camera_id || 'CAM_01',
            last_seen: 'now'
          })));
        } else {
          throw new Error("Empty telemetry");
        }
      } catch (e) {
        // Fallback for visual dashboard demonstration
        setTracks([
          { track_id: '1024', x_meters: 10 + Math.random(), y_meters: 8 + Math.random(), floor: 'floor_0', camera_id: 'C01', last_seen: 'now' },
          { track_id: '0982', x_meters: 25 + Math.random(), y_meters: 12 + Math.random(), floor: 'floor_0', camera_id: 'C02', last_seen: 'now' },
          { track_id: '1105', x_meters: 18 + Math.random(), y_meters: 22 + Math.random(), floor: 'floor_0', camera_id: 'C03', last_seen: 'now', warning: true },
        ]);
      }
    };
    fetchPositions();
    const interval = setInterval(fetchPositions, 2000);
    return () => clearInterval(interval);
  }, [activeFloor, storeId, password]);

  // Fetch Dynamic SVG Map
  useEffect(() => {
    const fetchMap = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/spatial/map.svg?floor_id=${activeFloor}`, {
          headers: {
            'X-Store-ID': storeId,
            'X-Password': password || 'test123'
          }
        });
        if (res.ok) {
          const text = await res.text();
          setSvgMap(text);
        }
      } catch (e) {
        console.error("Map load failed", e);
      }
    };
    fetchMap();
  }, [activeFloor, storeId, password]);

  return (
    <div className="flex h-full animate-in fade-in duration-700">
      {/* Left: Telemetry */}
      <aside className="w-80 border-r border-white/5 flex flex-col bg-black/20 backdrop-blur-md">
        <div className="p-6 border-b border-white/5">
          <h2 className="text-[10px] uppercase tracking-[0.2em] font-mono text-auris-cyan mb-6 flex items-center gap-2">
            <Activity className="w-3 h-3" /> System Telemetry
          </h2>
          <div className="grid grid-cols-2 gap-3">
             <div className="p-3 glass rounded-lg bg-auris-cyan/5 border-auris-cyan/20">
                <div className="text-[10px] text-white/40 uppercase mb-1">Live Tracks</div>
                <div className="text-xl font-display text-auris-cyan">{tracks.length}</div>
             </div>
             <div className="p-3 glass rounded-lg bg-auris-purple/5 border-auris-purple/20">
                <div className="text-[10px] text-white/40 uppercase mb-1">Status</div>
                <div className="text-xs font-mono text-auris-purple">NOMINAL</div>
             </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {tracks.map(t => (
            <div key={t.track_id} className={`p-3 glass rounded-lg border-white/5 hover:border-auris-cyan/30 transition-colors ${t.warning ? 'bg-auris-orange/5 border-auris-orange/20' : ''}`}>
              <div className="flex justify-between text-[10px] font-mono mb-1">
                <span className={t.warning ? 'text-auris-orange' : 'text-auris-cyan'}>TRACK #{t.track_id}</span>
                <span className="opacity-30">{t.last_seen}</span>
              </div>
              <div className="text-[11px] text-white/70">Position: {t.x_meters.toFixed(2)}m, {t.y_meters.toFixed(2)}m</div>
            </div>
          ))}
        </div>
      </aside>

      {/* Center: Live Map */}
      <main className="flex-1 relative bg-[radial-gradient(circle_at_center,_#1a1b1e_0%,_#0a0a0a_100%)]">
        {/* Floor Switcher */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex gap-2 p-1 glass rounded-full">
          {['Floor 0', 'Floor 1', 'Roof'].map(f => (
            <button 
              key={f}
              onClick={() => setActiveFloor(f.toLowerCase().replace(' ', '_'))}
              className={`px-6 py-2 rounded-full text-[10px] uppercase font-display tracking-widest transition-all ${activeFloor === f.toLowerCase().replace(' ', '_') ? 'bg-auris-cyan text-black' : 'text-white/40 hover:text-white/60'}`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Mode Toggle */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20 flex p-1 glass rounded-full">
            <button onClick={() => setViewMode('live')} className={`px-4 py-2 rounded-full text-[9px] uppercase tracking-widest transition-all ${viewMode === 'live' ? 'bg-auris-cyan text-black' : 'text-white/40'}`}>LIVE MAP</button>
            <button onClick={() => setViewMode('thermal')} className={`px-4 py-2 rounded-full text-[9px] uppercase tracking-widest transition-all ${viewMode === 'thermal' ? 'bg-auris-purple text-white' : 'text-white/40'}`}>THERMAL</button>
        </div>

        <div className="absolute inset-0 flex items-center justify-center p-12">
          <div className="relative w-full h-full glass rounded-3xl overflow-hidden border-white/10 flex items-center justify-center">
            {/* Radar Sweep */}
            {viewMode === 'live' && (
               <motion.div 
                 animate={{ rotate: 360 }}
                 transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                 className="absolute inset-0 pointer-events-none opacity-10 z-10"
                 style={{ background: 'conic-gradient(from 0deg at 50% 50%, white, transparent 30%)' }}
               />
            )}

            {svgMap ? (
              <div className="relative w-full h-full flex items-center justify-center p-6">
                <div 
                  className={`w-full h-full flex items-center justify-center transition-all duration-1000 ${viewMode === 'thermal' ? 'blur-lg brightness-110' : ''}`}
                  dangerouslySetInnerHTML={{ __html: svgMap }} 
                />
                
                {/* Live Overlaid Dots */}
                <div className="absolute inset-0 pointer-events-none">
                  {tracks.map(t => (
                    <motion.div
                      key={t.track_id}
                      animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className={`absolute w-3.5 h-3.5 rounded-full flex items-center justify-center shadow-lg border border-white`}
                      style={{
                        left: `${Math.min(Math.max((t.x_meters / 50) * 100, 5), 95)}%`,
                        top: `${Math.min(Math.max((t.y_meters / 50) * 100, 5), 95)}%`,
                        backgroundColor: t.warning ? '#ff453a' : '#0a84ff',
                        boxShadow: t.warning ? '0 0 15px #ff453a' : '0 0 15px #0a84ff'
                      }}
                    >
                      <span className="absolute bottom-5 font-mono text-[7px] text-white bg-black/80 px-1 py-0.5 rounded border border-white/10 whitespace-nowrap">
                        #{t.track_id}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            ) : (
              <svg viewBox="0 0 1000 800" className={`w-full h-full transition-all duration-1000 ${viewMode === 'thermal' ? 'blur-lg brightness-110' : ''}`}>
                <rect x="100" y="100" width="800" height="600" fill="hsl(240,10%,6%)" stroke="rgba(0,255,255,0.2)" strokeWidth="2" />
                <path d="M100 400 L400 400 M600 100 L600 500" stroke="white" strokeWidth="2" opacity="0.3" />
                
                {/* Camera Cones */}
                <g className="text-auris-purple/20">
                  <path d="M100 100 L250 100 A 150 150 0 0 1 100 250 Z" fill="currentColor" />
                  <path d="M900 700 L750 700 A 150 150 0 0 1 900 550 Z" fill="currentColor" />
                </g>

                {/* Tracks */}
                {tracks.map(t => (
                  <g key={t.track_id} transform={`translate(${t.x_meters * 25}, ${t.y_meters * 25})`}>
                     <motion.circle 
                        animate={{ scale: [1, 1.5, 1], opacity: [0.2, 0.4, 0.2] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        r="20" fill={t.warning ? "hsl(30, 100%, 50%)" : "hsl(180, 100%, 50%)"} 
                     />
                     <circle r="6" fill={t.warning ? "hsl(30, 100%, 50%)" : "hsl(180, 100%, 50%)"} />
                     <text y="-12" textAnchor="middle" fill="white" fontSize="9" className="font-mono uppercase opacity-50">#{t.track_id}</text>
                  </g>
                ))}
              </svg>
            )}
          </div>
        </div>
      </main>

      {/* Right: Metrics */}
      <aside className="w-80 border-l border-white/5 p-6 flex flex-col gap-6 bg-black/20 backdrop-blur-md">
         <h2 className="text-[10px] uppercase tracking-[0.2em] font-mono text-white/40 flex items-center gap-2">
            <ShieldCheck className="w-3 h-3 text-auris-cyan" /> Perspective Analysis
         </h2>
         <MetricCard label="Current Occupancy" value={tracks.length} unit="PERSONS" trend="+12%" cyan />
         <MetricCard label="Avg Dwell Time" value="14.5" unit="MINUTES" trend="-2%" />
         <MetricCard label="Security Confidence" value="98.2" unit="PERCENT" />
         
         <div className="mt-auto glass p-4 rounded-xl border-orange-500/20 bg-orange-500/5">
            <h3 className="text-[10px] text-orange-500 font-bold uppercase flex items-center gap-2 mb-2">
              <AlertTriangle className="w-3 h-3" /> Recent Alerts
            </h3>
            <div className="space-y-2">
              <div className="text-[11px] text-white/60">14:22 - Camera offline in Sector G</div>
              <div className="text-[11px] text-white/60">12:10 - Anomalous dwell in Lobby</div>
            </div>
         </div>
      </aside>
    </div>
  );
};

// 4. TAB: MAPPING
const MappingTab = () => {
  const [layers, setLayers] = useState<any[]>([]);
  const [activeLayer, setActiveLayer] = useState<number | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        setLayers(prev => [...prev, {
          id: Date.now(),
          name: file.name,
          type: file.type,
          data: reader.result,
          x: 0, y: 0, scale: 1, rotate: 0
        }]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop } as any);

  const updateLayer = (id: number, delta: any) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, ...delta } : l));
  };

  return (
    <div className="flex h-full gap-6 p-6 overflow-hidden">
      <aside className="w-80 flex flex-col gap-4 h-full overflow-y-auto custom-scrollbar">
        <GlassCard className="p-6">
          <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-8 transition-all text-center cursor-pointer ${isDragActive ? 'border-auris-cyan bg-auris-cyan/5' : 'border-white/10 hover:border-auris-cyan/30'}`}>
            <input {...getInputProps()} />
            <FileUp className="w-8 h-8 text-auris-cyan mx-auto mb-4" />
            <p className="text-[10px] uppercase tracking-widest text-white/40">Upload LiDAR / SVG / DXF</p>
          </div>
        </GlassCard>

        {layers.map((layer, i) => (
          <GlassCard key={layer.id} className={`p-4 cursor-pointer transition-all ${activeLayer === i ? 'ring-1 ring-auris-cyan' : ''}`} onClick={() => setActiveLayer(i)}>
            <div className="flex justify-between items-center mb-4">
              <span className="text-[11px] font-mono truncate max-w-[150px]">{layer.name}</span>
              <button onClick={(e) => { e.stopPropagation(); setLayers(prev => prev.filter(l => l.id !== layer.id)) }} className="text-white/20 hover:text-red-500">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            
            <div className="space-y-4">
               <TransformSlider label="Offset X" value={layer.x} min={-500} max={500} onChange={(v: number) => updateLayer(layer.id, { x: v })} />
               <TransformSlider label="Offset Y" value={layer.y} min={-500} max={500} onChange={(v: number) => updateLayer(layer.id, { y: v })} />
               <TransformSlider label="Scale" value={layer.scale} min={0.1} max={5} step={0.01} onChange={(v: number) => updateLayer(layer.id, { scale: v })} />
               <TransformSlider label="Rotate" value={layer.rotate} min={0} max={360} onChange={(v: number) => updateLayer(layer.id, { rotate: v })} />
            </div>
          </GlassCard>
        ))}
        
        <button 
          onClick={() => alert("LiDAR constraints stitched. Executing RoomPlan mesh solver on Azure...")}
          className="relative overflow-hidden px-6 py-4 rounded font-display font-medium bg-gradient-to-r from-blue-600 to-auris-purple uppercase tracking-[0.2em] text-[10px] mt-auto"
        >
           Commit Stitched Map
        </button>
      </aside>

      <main className="flex-1 glass rounded-3xl relative overflow-hidden bg-[hsl(240,10%,3%)]">
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        
        <div className="flex items-center justify-center h-full">
          {layers.length === 0 ? (
            <div className="text-center text-white/20">
              <Layers className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-xs uppercase tracking-widest">No mapping layers active</p>
            </div>
          ) : (
            <div className="relative w-full h-full flex items-center justify-center">
               {layers.map((layer, i) => (
                 <motion.div 
                   key={layer.id}
                   animate={{ x: layer.x, y: layer.y, scale: layer.scale, rotate: layer.rotate }}
                   className={`absolute w-3/4 h-3/4 flex items-center justify-center pointer-events-none ${activeLayer === i ? 'opacity-100' : 'opacity-30'}`}
                 >
                   {typeof layer.data === 'string' && layer.data.startsWith('data:image') ? (
                     <img src={layer.data} className="max-w-full max-h-full border border-auris-cyan/30 shadow-[0_0_20px_rgba(0,255,255,0.1)]" draggable={false} />
                   ) : (
                     <div className="w-full h-full glass border-auris-cyan/40 p-12 flex items-center justify-center font-mono text-[10px]">
                        [LEGACY DATA RENDER]
                     </div>
                   )}
                 </motion.div>
               ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

function TransformSlider({ label, value, ...props }: any) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[9px] uppercase tracking-tighter text-white/40 font-mono">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <input type="range" className="w-full h-1 bg-white/10 rounded-full appearance-none accent-auris-cyan cursor-pointer" value={value} onChange={e => props.onChange(Number(e.target.value))} {...props} />
    </div>
  );
}

// 5. TAB: CALIBRATION
const CalibrationTab = ({ storeId, password }: { storeId: string; password?: string }) => {
    const [points, setPoints] = useState<any[]>([]);
    const [imgUrl, setImgUrl] = useState('https://picsum.photos/seed/calibrate/1200/800');
    const [cameraId, setCameraId] = useState('CAM_001');
    const [calibMsg, setCalibMsg] = useState('');

    const fetchSnapshot = async () => {
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
      setCalibMsg("Solving homography system matrix...");
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
          setCalibMsg(`Solver success! Dynamic RMSE: ${data.rmse_m.toFixed(4)} meters.`);
        } else {
          setCalibMsg(`Solve error: ${data.detail || "Homography system is singular."}`);
        }
      } catch (e) {
        setCalibMsg("Failed to solve homography.");
      }
    };

    return (
        <div className="flex h-full p-6 gap-6">
            <aside className="w-96 flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar">
                <GlassCard className="p-6">
                    <h3 className="text-xs uppercase tracking-widest text-auris-cyan mb-6">Homography Solver</h3>
                    <p className="text-[10px] text-white/40 mb-6 italic">Click 4 points on the floor to establish real-world scale.</p>
                    
                    <div className="space-y-4">
                        {points.map((p, i) => (
                            <div key={i} className="p-3 glass rounded-lg border-white/5 grid grid-cols-2 gap-3">
                                <div className="col-span-2 text-[9px] font-mono text-auris-cyan uppercase">Reference Pt #{i+1}</div>
                                <div className="space-y-1">
                                    <label className="text-[8px] uppercase opacity-40">World X (m)</label>
                                    <input type="number" className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs" 
                                           onChange={e => setPoints(pts => pts.map((pt, idx) => idx === i ? {...pt, xm: Number(e.target.value)} : pt))} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[8px] uppercase opacity-40">World Y (m)</label>
                                    <input type="number" className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs" 
                                           onChange={e => setPoints(pts => pts.map((pt, idx) => idx === i ? {...pt, ym: Number(e.target.value)} : pt))} />
                                </div>
                            </div>
                        ))}
                    </div>

                    <button 
                      onClick={handleSolveHomography}
                      disabled={points.length < 4} 
                      className="relative overflow-hidden px-6 py-4 rounded font-display bg-gradient-to-r from-blue-600 to-auris-purple w-full uppercase tracking-[0.2em] text-[10px] mt-8 disabled:opacity-30"
                    >
                        Compute Homography 3x3
                    </button>
                    <button onClick={() => { setPoints([]); setCalibMsg(''); }} className="w-full text-[9px] uppercase tracking-widest text-white/20 mt-4 hover:text-white/40">Clear Calibration</button>
                    
                    {calibMsg && (
                      <div className="mt-4 p-3 rounded bg-white/5 text-[9px] font-mono text-auris-cyan border border-auris-cyan/20">
                        {calibMsg.toUpperCase()}
                      </div>
                    )}
                </GlassCard>

                <div className="space-y-2">
                    <h4 className="text-[9px] uppercase tracking-widest text-white/40 ml-2">Camera Registry</h4>
                    <GlassCard className="p-4 space-y-2">
                        {['CAM_001', 'CAM_002', 'CAM_003'].map(id => (
                            <div 
                              key={id} 
                              className={`flex items-center justify-between p-2 rounded hover:bg-white/5 transition-colors group cursor-pointer ${cameraId === id ? 'bg-white/10 border-l-2 border-auris-cyan' : ''}`}
                              onClick={() => { setCameraId(id); setPoints([]); setCalibMsg(''); }}
                            >
                                <div className="flex items-center gap-3">
                                    <Camera className="w-4 h-4 text-white/20" />
                                    <span className="text-xs font-mono">{id}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                     <div className={`w-1.5 h-1.5 rounded-full ${cameraId === id ? 'bg-auris-cyan' : 'bg-white/10'}`} />
                                     <ChevronRight className="w-3 h-3 text-white/10 group-hover:text-auris-cyan" />
                                </div>
                            </div>
                        ))}
                    </GlassCard>
                </div>
            </aside>

            <main className="flex-1 relative glass rounded-3xl overflow-hidden cursor-crosshair group shadow-2xl" onClick={handleCanvasClick}>
                <img src={imgUrl} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" draggable={false} referrerPolicy="no-referrer" />
                <div className="absolute inset-0 bg-black/40 pointer-events-none" />
                
                {points.map((p, i) => (
                    <motion.div 
                        initial={{ scale: 0 }} animate={{ scale: 1 }}
                        key={i} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none" 
                        style={{ left: `${p.px}%`, top: `${p.py}%` }}
                    >
                        <div className="w-4 h-4 rounded-full bg-auris-cyan shadow-[0_0_15px_hsl(180,100%,50%)] border border-white" />
                        <div className="mt-2 text-[9px] font-mono bg-black/80 px-2 py-1 rounded text-auris-cyan border border-auris-cyan/30">
                            GCP_{i+1}: {p.xm}m, {p.ym}m
                        </div>
                    </motion.div>
                ))}

                <div className="absolute bottom-6 left-6 flex items-center gap-4">
                    <div className="glass px-4 py-2 rounded-full text-[10px] font-mono text-white/50 border-white/5">
                        {cameraId} ACTIVE STREAM
                    </div>
                </div>
            </main>
        </div>
    );
};

// 6. TAB: TRAINING
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
      
      // Load training stats
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
    setExportMsg("Compiling training dataset manifests...");
    try {
      const res = await fetch(`${API_BASE}/api/training/export-yolo`, {
        method: 'POST',
        headers: { 'X-Admin-Key': ADMIN_KEY }
      });
      const data = await res.json();
      if (res.ok) {
        setExportMsg(`Export complete! Manifest: ${data.approved_hard_cases} Approved Hard Cases, ${data.pseudo_labels} Pseudo Labels. GPU cluster job initiated.`);
      }
    } catch (e) {
      setExportMsg("Export pipeline error.");
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center font-mono text-xs text-white/40">
        <RefreshCw className="w-6 h-6 animate-spin mr-3 text-auris-cyan" />
        Syncing AI Pseudo-Label Telemetry...
      </div>
    );
  }

  const currentCase = cases[currentIndex];

  return (
    <div className="h-full p-12 flex flex-col items-center max-w-4xl mx-auto overflow-y-auto custom-scrollbar">
       <header className="w-full flex justify-between items-center mb-12">
          <div className="flex gap-12">
             <div className="space-y-1">
                <div className="text-[10px] uppercase text-white/40 tracking-widest">Hard Cases Pending</div>
                <div className="text-2xl font-display text-white">{stats.hard_cases_pending}</div>
             </div>
             <div className="space-y-1">
                <div className="text-[10px] uppercase text-auris-purple tracking-widest">Model Version</div>
                <div className="text-2xl font-display text-auris-purple">AURIS-V4.2</div>
             </div>
          </div>
          <button 
            onClick={handleExport}
            className="glass px-6 py-3 rounded-xl border-auris-cyan/30 text-auris-cyan text-[10px] uppercase font-bold tracking-widest flex items-center gap-2 hover:bg-auris-cyan/10 transition-all"
          >
             <Database className="w-4 h-4" /> Export YOLO Dataset
          </button>
       </header>

       {exportMsg && (
         <div className="w-full max-w-2xl mb-6 p-4 rounded-xl bg-auris-cyan/5 border border-auris-cyan/20 text-xs font-mono text-auris-cyan">
           {exportMsg.toUpperCase()}
         </div>
       )}

       <div className="w-full flex-1 flex flex-col items-center gap-8">
          {!currentCase ? (
            <GlassCard className="p-8 text-center max-w-md w-full">
               <ShieldCheck className="w-12 h-12 text-auris-cyan mx-auto mb-4 animate-pulse" />
               <h3 className="text-lg font-display uppercase tracking-widest text-white/90">Overwatch Calibrated</h3>
               <p className="text-xs text-white/40 mt-2">All pseudo-labels and custom class drift logs are successfully updated. Nominal training pipeline.</p>
            </GlassCard>
          ) : (
            <>
              <div className="relative w-full max-w-2xl aspect-square glass rounded-3xl overflow-hidden border-white/10 group flex items-center justify-center">
                 <motion.img 
                   key={currentCase._id}
                   initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }}
                   src={currentCase.crop_b64.startsWith('data:') ? currentCase.crop_b64 : `data:image/jpeg;base64,${currentCase.crop_b64}`} 
                   className="w-full h-full object-cover" 
                   referrerPolicy="no-referrer"
                 />
                 <div className="absolute top-6 left-6 glass px-4 py-2 rounded-lg border-auris-cyan/30 text-[10px] font-mono text-auris-cyan">
                    PREDICTION CONFIDENCE: {(Number(currentCase.confidence) * 100).toFixed(1)}% | NODE ID: {currentCase.camera_id}
                 </div>
              </div>

              <div className="flex gap-8 w-full max-w-2xl">
                  <button onClick={() => handleReview('reject')} className="flex-1 py-6 glass rounded-2xl border-red-500/30 text-red-500 uppercase tracking-[0.3em] font-display text-xs hover:bg-red-500/10 transition-all flex items-center justify-center gap-2 group">
                     <XCircle className="w-5 h-5 group-hover:scale-110 transition-transform" /> Reject Label
                  </button>
                  <button onClick={() => handleReview('approve')} className="flex-1 py-6 glass rounded-2xl border-auris-cyan/30 text-auris-cyan uppercase tracking-[0.3em] font-display text-xs hover:bg-auris-cyan/10 transition-all flex items-center justify-center gap-2 group">
                     <CheckCircle2 className="w-5 h-5 group-hover:scale-110 transition-transform" /> Approve Label
                  </button>
              </div>
              
              <div className="w-full max-w-2xl h-1 bg-white/5 rounded-full overflow-hidden">
                 <motion.div animate={{ width: `${(currentIndex / Math.max(cases.length, 1)) * 100}%` }} className="h-full bg-auris-cyan" />
              </div>
              <div className="text-[10px] font-mono text-white/30 tracking-widest">{currentIndex + 1} / {cases.length} REVIEWED</div>
            </>
          )}
       </div>
    </div>
  );
};

// 7. TAB: AI REPORT
const ReportTab = ({ storeId, password }: { storeId: string; password?: string }) => {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<string>('');
  const [generatedAt, setGeneratedAt] = useState<string>('');

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
    } catch (e) {
      console.error(e);
      setReport("Connection failed: could not load intelligence synopsis.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [storeId, password]);

  const handlePrint = () => window.print();

  return (
    <div className="h-full p-12 max-w-5xl mx-auto overflow-y-auto custom-scrollbar print:p-0">
       <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-[10px] uppercase tracking-[0.4em] font-mono text-auris-cyan">AURIS EXECUTIVE SYNOPSIS</h1>
            <h2 className="text-3xl font-display font-light mt-2 tracking-tight uppercase">Daily Spatial Intelligence</h2>
          </div>
          <div className="flex gap-3 print:hidden">
            <button className="glass p-3 rounded-xl border-white/5 hover:bg-white/5" onClick={fetchReport}>
               <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button className="relative overflow-hidden px-6 py-3 rounded font-display bg-gradient-to-r from-blue-600 to-auris-purple uppercase tracking-widest text-[10px]" onClick={handlePrint}>
               Export Intelligence PDF
            </button>
          </div>
       </header>

       {loading ? (
         <div className="h-48 flex items-center justify-center font-mono text-xs text-white/40">
           <RefreshCw className="w-6 h-6 animate-spin mr-3 text-auris-cyan" />
           Aggregating Multi-Modal Spatial insights...
         </div>
       ) : (
         <div className="grid grid-cols-3 gap-6">
            <GlassCard className="col-span-2 p-8" glow>
               <h3 className="text-xs font-display font-bold uppercase tracking-widest text-auris-cyan mb-6 flex items-center gap-2">
                 <FileText className="w-4 h-4" /> Tactical Summary
               </h3>
               <p className="text-md leading-relaxed text-white/85 font-display font-light border-l-2 border-auris-cyan pl-8 whitespace-pre-wrap">
                  {report || "Synchronizing with spatial intelligence engine..."}
               </p>
               <div className="mt-12 pt-8 border-t border-white/5 flex gap-12">
                  <div className="space-y-1">
                    <div className="text-[9px] uppercase text-white/30">Intelligence Target</div>
                    <div className="text-sm font-mono text-auris-cyan">{storeId.toUpperCase()}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[9px] uppercase text-white/30">Generated Epoch</div>
                    <div className="text-sm font-mono">
                      {generatedAt ? new Date(generatedAt).toLocaleString() : 'N/A'}
                    </div>
                  </div>
               </div>
            </GlassCard>

            <div className="space-y-6">
               <GlassCard className="p-6">
                  <div className="text-[9px] uppercase tracking-widest text-white/30 mb-2">Zone A (Active Core)</div>
                  <div className="text-xl font-display text-auris-cyan">98.2% Nominal Efficiency</div>
               </GlassCard>
               <GlassCard className="p-6">
                  <div className="text-[9px] uppercase tracking-widest text-white/30 mb-2">Zone B (Loading Area)</div>
                  <div className="text-xl font-display text-auris-purple">Proximity Bounds Steady</div>
               </GlassCard>
               <GlassCard className="p-6">
                  <div className="text-[9px] uppercase tracking-widest text-white/30 mb-2">Zone C (Transit Hub)</div>
                  <div className="text-xl font-display text-auris-orange">1.4m Peak Congestion</div>
               </GlassCard>
            </div>
         </div>
       )}

       <div className="mt-12 grid grid-cols-2 gap-6">
          <GlassCard className="p-8">
             <h3 className="text-[10px] uppercase tracking-widest text-white/40 mb-6 font-bold">Spatial Density Heatmap (Daily Avg)</h3>
             <div className="aspect-video glass rounded-xl overflow-hidden relative">
                <img src="https://picsum.photos/seed/heatmap/800/450" className="w-full h-full object-cover blur-sm opacity-50" referrerPolicy="no-referrer" />
                <div className="absolute inset-0 bg-gradient-to-tr from-blue-900/40 via-red-900/40 to-yellow-900/40 mix-blend-overlay" />
             </div>
          </GlassCard>
          <GlassCard className="p-8">
             <h3 className="text-[10px] uppercase tracking-widest text-white/40 mb-6 font-bold">Action Items</h3>
             <div className="space-y-4">
                <p className="text-[11px] text-white/60 flex items-start gap-3">
                  <span className="w-1 h-1 rounded-full bg-auris-cyan mt-1.5" />
                  Calibrate Lobby Camera 4 - observed drift in homography matrix.
                </p>
                <p className="text-[11px] text-white/60 flex items-start gap-3">
                  <span className="w-1 h-1 rounded-full bg-auris-cyan mt-1.5" />
                  Review Zone B person-count threshold; proximity alerts triggered.
                </p>
             </div>
          </GlassCard>
       </div>
    </div>
  );
};

// 7.5. TAB: FACTORY ONBOARDING & ENVIRONMENT MANAGEMENT
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
      // 1. Fetch stores
      const resStores = await fetch(`${API_BASE}/admin/stores`, {
        headers: { 'X-Admin-Key': ADMIN_KEY }
      });
      const dataStores = await resStores.json();
      
      // Filter factory stores
      const factoryStores = (dataStores.stores || []).filter((s: any) => 
        s.store_id.includes('factory') || s.spatial_status === 'factory'
      );
      setStores(factoryStores);

      // 2. Fetch configs
      const resConfigs = await fetch(`${API_BASE}/api/factory/configs`, {
        headers: { 'X-Admin-Key': ADMIN_KEY }
      });
      const dataConfigs = await resConfigs.json();
      setConfigs(dataConfigs.configs || []);
    } catch (e) {
      console.error("Failed to load factory environment details:", e);
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
        setSuccessMsg(`Factory "${sid.toUpperCase()}" promoted to live environment!`);
        fetchData();
      } else {
        const errData = await res.json();
        setErrorMsg(errData.detail || "Failed to update factory status.");
      }
    } catch (e) {
      setErrorMsg("Connection failure during promotion.");
    }
  };

  const handleOpenOnboard = (sid: string = '') => {
    setSelectedOnboardStore(sid);
    setIsModalOpen(true);
  };

  const handleOnboardSubmit = () => {
    setIsModalOpen(false);
    setSuccessMsg(`Factory onboarding checklist submitted successfully for "${selectedOnboardStore.toUpperCase()}"!`);
    fetchData();
    setTimeout(() => setSuccessMsg(''), 5000);
  };

  // Helper to match config status
  const getFactoryStatus = (sid: string) => {
    const config = configs.find(c => c.store_id === sid);
    return config ? config.status : 'un-onboarded';
  };

  return (
    <div className="h-full p-12 max-w-6xl mx-auto overflow-y-auto custom-scrollbar relative">
      <header className="flex justify-between items-end mb-12">
        <div>
          <h2 className="text-[10px] uppercase tracking-[0.4em] font-mono text-auris-cyan">AURIS PROVISIONING CORE</h2>
          <h1 className="text-3xl font-display font-light mt-2 uppercase tracking-tight">Factory Onboarding</h1>
        </div>
        <button 
          onClick={() => handleOpenOnboard('')}
          className="relative overflow-hidden px-6 py-3 rounded font-display bg-gradient-to-r from-blue-600 to-auris-purple text-[10px] uppercase tracking-widest flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Onboard New Factory
        </button>
      </header>

      {successMsg && (
        <div className="mb-6 p-4 rounded-xl bg-auris-cyan/10 border border-auris-cyan/35 text-xs font-mono text-auris-cyan flex justify-between items-center animate-in fade-in duration-300">
          <span>{successMsg.toUpperCase()}</span>
          <button onClick={() => setSuccessMsg('')} className="text-auris-cyan/60 hover:text-auris-cyan">✕</button>
        </div>
      )}

      {errorMsg && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/35 text-xs font-mono text-red-500 flex justify-between items-center animate-in fade-in duration-300">
          <span>{errorMsg.toUpperCase()}</span>
          <button onClick={() => setErrorMsg('')} className="text-red-500/60 hover:text-red-500">✕</button>
        </div>
      )}

      {loading ? (
        <div className="h-48 flex items-center justify-center font-mono text-xs text-white/40">
          <RefreshCw className="w-6 h-6 animate-spin mr-3 text-auris-cyan" />
          Synchronizing Industry Telemetry...
        </div>
      ) : stores.length === 0 ? (
        <GlassCard className="p-8 text-center max-w-md mx-auto">
          <LayoutGrid className="w-12 h-12 text-auris-cyan/40 mx-auto mb-4 animate-pulse" />
          <h3 className="text-sm font-display uppercase tracking-widest text-white/90">No Factory Store Registered</h3>
          <p className="text-[11px] text-white/40 mt-2">Provision a store containing "factory" in its ID inside the System Registry (Registry tab) first.</p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {stores.map(s => {
            const status = getFactoryStatus(s.store_id);
            const isLive = status === 'live';
            const isPending = status === 'pending';
            const isUnOnboarded = status === 'un-onboarded';

            return (
              <GlassCard key={s.store_id} className="p-6 border-auris-border relative hover:bg-white/[0.02] transition-colors" glow={isLive}>
                <div className="flex justify-between items-start mb-6">
                  <div className="p-4 rounded-2xl bg-auris-cyan/10 text-auris-cyan border border-auris-cyan/30">
                    <LayoutGrid className="w-6 h-6" />
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] font-mono text-white/30 uppercase tracking-widest mb-1">{s.store_id}</div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-[8px] font-bold font-mono border uppercase tracking-wider
                      ${isLive ? 'bg-auris-cyan/15 text-auris-cyan border-auris-cyan/35' : 
                        isPending ? 'bg-auris-orange/15 text-auris-orange border-auris-orange/35' : 
                        'bg-white/5 text-white/40 border-white/10'}`}>
                      {status}
                    </span>
                  </div>
                </div>

                <h3 className="text-xl font-display font-medium mb-1">{s.store_name}</h3>
                <p className="text-[10px] font-mono text-white/40 uppercase mb-6 flex items-center gap-1.5">
                  <Globe className="w-3 h-3 text-white/20" /> Provisioned {s.created_at ? new Date(s.created_at).toLocaleDateString() : 'N/A'}
                </p>

                <div className="flex items-center justify-between border-t border-white/5 pt-6 mt-4">
                  <div className="flex items-center gap-4">
                    {isPending && (
                      <button 
                        onClick={() => handleActivate(s.store_id)}
                        className="px-4 py-2 bg-gradient-to-r from-blue-600 to-auris-purple hover:opacity-90 rounded font-display font-medium text-[9px] uppercase tracking-widest transition-all"
                      >
                        Activate Factory
                      </button>
                    )}
                    {isUnOnboarded && (
                      <button 
                        onClick={() => handleOpenOnboard(s.store_id)}
                        className="px-4 py-2 bg-auris-cyan text-black hover:bg-auris-cyan/90 rounded font-display font-bold text-[9px] uppercase tracking-widest transition-all"
                      >
                        Configure Onboarding
                      </button>
                    )}
                    {isLive && (
                      <span className="text-[9px] font-mono text-auris-cyan flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Environmental parameters synced
                      </span>
                    )}
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Glass Provisioning Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.95, opacity: 0 }} 
              className="w-full max-w-3xl p-6 glass rounded-3xl border border-auris-border bg-auris-card relative my-8"
            >
              <button 
                onClick={() => setIsModalOpen(false)}
                className="absolute top-6 right-6 text-white/40 hover:text-white z-50 p-2 glass rounded-full"
              >
                ✕
              </button>

              <h2 className="text-xl font-display font-semibold mb-2 uppercase tracking-wide">Factory Onboarding Checklist</h2>
              <p className="text-[10px] text-white/45 mb-6 font-mono">ONBOARDING TELEMETRY SYSTEM PORTAL</p>

              {/* Store Selection if not pre-locked */}
              {!selectedOnboardStore ? (
                <div className="mb-6 p-4 glass rounded-xl border-white/5 bg-black/25">
                  <label className="block text-[9px] uppercase tracking-wider text-auris-cyan mb-2 font-mono">Select Factory Environment</label>
                  <select 
                    value={selectedOnboardStore} 
                    onChange={e => setSelectedOnboardStore(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-auris-cyan/50 text-white font-mono"
                  >
                    <option value="" disabled className="bg-[#111] text-white/40">-- SELECT A PROVISIONED ENVIRONMENT --</option>
                    {stores
                      .filter(s => getFactoryStatus(s.store_id) === 'un-onboarded')
                      .map(s => (
                        <option key={s.store_id} value={s.store_id} className="bg-[#111] text-white font-sans">
                          {s.store_name} ({s.store_id})
                        </option>
                      ))}
                  </select>
                </div>
              ) : (
                <div className="mb-6 p-4 glass rounded-xl border-auris-cyan/15 bg-auris-cyan/5 flex justify-between items-center">
                  <div>
                    <div className="text-[8px] font-mono text-auris-cyan uppercase tracking-widest">SELECTED ENVIRONMENT</div>
                    <div className="text-md font-display text-white mt-0.5">
                      {stores.find(s => s.store_id === selectedOnboardStore)?.store_name || selectedOnboardStore}
                    </div>
                  </div>
                  <span className="text-[9px] font-mono bg-auris-cyan text-black px-2 py-0.5 rounded font-bold uppercase">{selectedOnboardStore}</span>
                </div>
              )}

              {selectedOnboardStore ? (
                <div className="max-h-[60vh] overflow-y-auto custom-scrollbar rounded-2xl">
                  <FactoryOnboarding storeId={selectedOnboardStore} onSubmit={handleOnboardSubmit} />
                </div>
              ) : (
                <div className="p-12 text-center border border-dashed border-white/10 rounded-2xl bg-black/10">
                  <LayoutGrid className="w-8 h-8 text-white/20 mx-auto mb-3" />
                  <p className="text-[11px] text-white/40">Select a provisioned factory environment from the dropdown above to launch the step-by-step onboarding matrix.</p>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// 8. TAB: REGISTRY (MANAGEMENT)
const ManagementTab = ({ onSelectStore }: { onSelectStore: (id: string) => void }) => {
    const [stores, setStores] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Modal forms
    const [newId, setNewId] = useState('');
    const [newName, setNewName] = useState('');
    const [newPass, setNewPass] = useState('');
    const [modalError, setModalError] = useState('');

    const fetchStores = async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/stores`, {
          headers: { 'X-Admin-Key': ADMIN_KEY }
        });
        const data = await res.json();
        if (data && Array.isArray(data.stores)) {
          setStores(data.stores.map((s: any) => ({
            store_id: s.store_id,
            store_name: s.store_name || s.store_id,
            status: 'online',
            cameras_count: s.cameras_count || 4,
            calibrated: true,
            plan: s.store_id.includes('factory') ? 'factory' : 'retail'
          })));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    useEffect(() => {
      fetchStores();
    }, []);

    const handleDelete = async (sid: string) => {
      if (!confirm(`Are you absolutely sure you want to de-provision client node "${sid}"? This will purge all spatial maps and telemetry.`)) return;
      try {
        const res = await fetch(`${API_BASE}/admin/stores/${sid}`, {
          method: 'DELETE',
          headers: { 'X-Admin-Key': ADMIN_KEY }
        });
        if (res.ok) {
          fetchStores();
        }
      } catch (e) {
        console.error(e);
      }
    };

    const handleProvision = async () => {
      if (!newId || !newName || !newPass) {
        setModalError("All configuration fields are required.");
        return;
      }
      setModalError('');
      try {
        const res = await fetch(`${API_BASE}/admin/stores`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Key': ADMIN_KEY
          },
          body: JSON.stringify({
            store_id: newId,
            store_name: newName,
            password: newPass
          })
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.detail || "Provisioning solver failed.");
        }
        setIsModalOpen(false);
        setNewId('');
        setNewName('');
        setNewPass('');
        fetchStores();
      } catch (e: any) {
        setModalError(e.message || "Failed to contact database.");
      }
    };

    return (
        <div className="h-full p-12 max-w-6xl mx-auto overflow-y-auto custom-scrollbar relative">
            <header className="flex justify-between items-center mb-12">
                <div>
                   <h2 className="text-[10px] uppercase tracking-[0.4em] font-mono text-auris-cyan">ADMINISTRATION ENGINE</h2>
                   <h1 className="text-3xl font-display font-light mt-2 uppercase tracking-tight">System Registry</h1>
                </div>
                <button 
                  onClick={() => setIsModalOpen(true)}
                  className="relative overflow-hidden px-6 py-3 rounded font-display bg-gradient-to-r from-blue-600 to-auris-purple text-[10px] uppercase tracking-widest flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" /> Provision New Environment
                </button>
            </header>

            {loading ? (
              <div className="h-48 flex items-center justify-center font-mono text-xs text-white/40">
                <RefreshCw className="w-6 h-6 animate-spin mr-3 text-auris-cyan" />
                Querying Cosmos Database...
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                  {stores.map(s => (
                      <GlassCard key={s.store_id} className="p-6 flex items-center justify-between hover:bg-white/[0.03] transition-colors border-auris-border">
                          <div className="flex items-center gap-8">
                              <div className={`p-4 rounded-2xl bg-auris-cyan/10 text-auris-cyan border-auris-cyan/30 border`}>
                                  <Hexagon className="w-8 h-8" />
                              </div>
                              <div>
                                  <div className="text-[10px] font-mono text-white/40 uppercase mb-1">{s.store_id} • {s.plan.toUpperCase()}</div>
                                  <h3 className="text-xl font-display font-medium">{s.store_name}</h3>
                                  <div className="flex gap-4 mt-2">
                                      <span className="text-[9px] uppercase tracking-widest text-white/40 flex items-center gap-1.5"><Camera className="w-3 h-3" /> {s.cameras_count} Nodes</span>
                                      <span className={`text-[9px] uppercase tracking-widest flex items-center gap-1.5 ${s.calibrated ? 'text-auris-cyan' : 'text-orange-500'}`}>
                                          <ShieldCheck className="w-3 h-3" /> {s.calibrated ? 'Calibrated' : 'Sync Required'}
                                      </span>
                                  </div>
                              </div>
                          </div>

                          <div className="flex items-center gap-12">
                              <div className="text-right">
                                  <div className="text-[9px] uppercase text-white/30 mb-1">Status</div>
                                  <div className={`text-xs font-mono font-bold text-auris-cyan`}>
                                      ● LINK STEADY
                                  </div>
                              </div>
                              <div className="flex gap-2">
                                  <button onClick={() => onSelectStore(s.store_id)} className="p-3 glass rounded-xl border-auris-border hover:border-auris-cyan/30 transition-all">
                                      <Eye className="w-4 h-4 text-white/40" />
                                  </button>
                                  <button onClick={() => handleDelete(s.store_id)} className="p-3 glass rounded-xl border-auris-border hover:border-red-500/30 transition-all group">
                                      <Trash2 className="w-4 h-4 text-white/20 group-hover:text-red-500" />
                                  </button>
                              </div>
                          </div>
                      </GlassCard>
                  ))}
              </div>
            )}

            {/* Glass Provisioning Modal */}
            <AnimatePresence>
              {isModalOpen && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
                  <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="w-full max-w-md p-8 glass rounded-3xl border border-auris-border bg-auris-card">
                     <h2 className="text-xl font-display mb-6">PROVISION TELEMETRY ENVIRONMENT</h2>
                     
                     <div className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase text-white/40">Environment Identifier (lowercase, no spaces)</label>
                          <input placeholder="factory_north_01" value={newId} onChange={e => setNewId(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-auris-cyan/50 font-mono text-white" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase text-white/40">Environment Human Name</label>
                          <input placeholder="Detroit Assembly Floor B" value={newName} onChange={e => setNewName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-auris-cyan/50 text-white" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase text-white/40">Quantum Key (Password)</label>
                          <input type="password" placeholder="••••••••" value={newPass} onChange={e => setNewPass(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-auris-cyan/50 text-white" />
                        </div>
                     </div>

                     {modalError && <div className="mt-4 text-xs font-mono text-red-500 uppercase">{modalError}</div>}

                     <div className="mt-8 flex gap-4">
                        <button onClick={() => setIsModalOpen(false)} className="flex-1 py-3 rounded glass border border-white/15 text-[10px] uppercase font-bold tracking-widest text-white/60">Cancel</button>
                        <button onClick={handleProvision} className="flex-1 py-3 rounded bg-gradient-to-r from-blue-600 to-auris-purple text-[10px] uppercase font-bold tracking-widest">Provision Core</button>
                     </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
        </div>
    );
};

// --- MAIN LOGIN ---
const Login = ({ onLogin }: { onLogin: (s: string, p: string, name: string) => void }) => {
  const [usr, setUsr] = useState('test_store2'); // Default to their real test store for absolute ease of use!
  const [pwd, setPwd] = useState('test123'); // Default to their real password!
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!usr || !pwd) {
      setError("Please input personnel identifiers");
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: usr, password: pwd })
      });
      if (!res.ok) throw new Error("Invalid Encryption / Identification Credentials");
      const data = await res.json();
      onLogin(data.store_id, pwd, data.store_name);
    } catch (e: any) {
      setError(e.message || "Failed to synchronize with server core");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-auris-bg">
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <svg width="100%" height="100%">
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="hsl(180, 100%, 50%)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 w-full max-w-md p-10 glass rounded-3xl">
        <div className="flex flex-col items-center mb-10">
          <div className="relative mb-6">
            <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 4, repeat: Infinity }} className="absolute inset-x-0 inset-y-0 bg-auris-cyan rounded-full blur-2xl" />
            <div className="relative p-5 bg-black border border-auris-cyan/30 rounded-2xl">
              <Hexagon className="w-10 h-10 text-auris-cyan" />
            </div>
          </div>
          <h1 className="text-[10px] tracking-[0.6em] font-mono text-auris-cyan/50 uppercase">AURIS BY SKYM LABS</h1>
          <h2 className="text-2xl font-display font-medium mt-3 tracking-tight">AUTHORIZED ACCESS</h2>
        </div>

        <div className="space-y-6">
           <div className="space-y-1">
             <label className="text-[9px] uppercase tracking-widest text-white/40 ml-1">Personnel Identifier</label>
             <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                <input 
                  placeholder="SKM_NODE_01" 
                  value={usr}
                  onChange={e => setUsr(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-4 text-sm focus:outline-none focus:border-auris-cyan/50 transition-all font-mono text-white" 
                />
             </div>
           </div>
           <div className="space-y-1">
             <label className="text-[9px] uppercase tracking-widest text-white/40 ml-1">Quantum Encryption</label>
             <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  value={pwd}
                  onChange={e => setPwd(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-4 text-sm focus:outline-none focus:border-auris-cyan/50 transition-all text-white" 
                />
             </div>
           </div>

           {error && (
             <div className="text-[10px] font-mono text-red-500 uppercase tracking-widest text-center mt-2">
               {error}
             </div>
           )}

           <button 
             onClick={handleSubmit}
             disabled={loading}
             className="relative overflow-hidden px-6 py-5 rounded font-display bg-gradient-to-r from-blue-600 to-auris-purple w-full text-[11px] uppercase tracking-[0.3em] mt-2 disabled:opacity-40"
           >
              {loading ? "Decrypting Core Link..." : "Sync Intelligence Core"}
           </button>
        </div>

        <div className="mt-12 flex items-center justify-center gap-3 text-[9px] font-mono text-white/20 uppercase tracking-widest">
           <div className="w-2 h-2 rounded-full bg-auris-cyan animate-pulse" />
           Security Protocol 85-B Active
        </div>
      </motion.div>
    </div>
  );
};

// --- CORE APP ---
export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('mission');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [password, setPassword] = useState<string>('');
  const [storeName, setStoreName] = useState<string>('');
  const [factoryConfigs, setFactoryConfigs] = useState<any[]>([]);

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
    setActiveTab('dashboard');
  };

  const handleLoginSuccess = (id: string, pass: string, name: string) => {
    setStoreId(id);
    setPassword(pass);
    setStoreName(name);
    setActiveTab('mission');
  };

  if (!storeId) {
    return <Login onLogin={handleLoginSuccess} />;
  }

  return (
    <div className="flex h-screen bg-auris-bg text-white overflow-hidden selection:bg-auris-cyan/30">
      {/* Sidebar Nav */}
      <nav className="w-20 border-r border-white/5 flex flex-col items-center py-8 bg-black/40 backdrop-blur-3xl z-40">
        <div className="p-3 bg-auris-cyan/10 rounded-2xl border border-auris-cyan/30 mb-12 shadow-[0_0_15px_rgba(0,255,255,0.15)] cursor-pointer">
          <Hexagon className="w-7 h-7 text-auris-cyan" />
        </div>

        <div className="flex flex-1 flex-col gap-6">
           <NavButton active={activeTab === 'mission'} onClick={() => setActiveTab('mission')} icon={<Globe />} label="Overwatch" />
           <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard />} label="Dashboard" />
           <NavButton active={activeTab === 'mapping'} onClick={() => setActiveTab('mapping')} icon={<Layers />} label="Mapping" />
           <NavButton active={activeTab === 'calibration'} onClick={() => setActiveTab('calibration')} icon={<RotateCw />} label="Calibration" />
           <NavButton active={activeTab === 'report'} onClick={() => setActiveTab('report')} icon={<FileText />} label="Intelligence" />
           <NavButton active={activeTab === 'training'} onClick={() => setActiveTab('training')} icon={<Cpu />} label="Training" />
           <NavButton active={activeTab === 'factory'} onClick={() => setActiveTab('factory')} icon={<LayoutGrid />} label="Factory" />
           <NavButton active={activeTab === 'factory_analytics'} onClick={() => setActiveTab('factory_analytics')} icon={<TrendingUp />} label="Analytics" />
           <NavButton active={activeTab === 'management'} onClick={() => setActiveTab('management')} icon={<Settings />} label="Registry" />
        </div>

        <div className="mt-auto flex flex-col gap-6">
           <NavButton active={false} onClick={() => { setStoreId(null); setPassword(''); }} icon={<LogOut />} label="Logout" />
        </div>
      </nav>

      {/* Viewport */}
      <main className="flex-1 overflow-hidden relative font-sans">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="h-full"
          >
            {activeTab === 'mission' && <MissionControlTab onSelectStore={handleSelectStore} />}
            {activeTab === 'dashboard' && <DashboardTab storeId={storeId} password={password} />}
            {activeTab === 'mapping' && <MappingTab />}
            {activeTab === 'calibration' && <CalibrationTab storeId={storeId} password={password} />}
            {activeTab === 'report' && <ReportTab storeId={storeId} password={password} />}
            {activeTab === 'training' && <TrainingTab />}
            {activeTab === 'factory' && <FactoryOnboardingView storeId={storeId} />}
            {activeTab === 'factory_analytics' && (
              storeId ? (
                (() => {
                  const factory = factoryConfigs.find((f: any) => f.store_id === storeId);
                  const trialDay = factory?.trial_start 
                    ? Math.floor((Date.now() - new Date(factory.trial_start).getTime()) / 86400000) + 1 
                    : 1;
                  return (
                    <FactoryDashboard 
                      storeId={storeId} 
                      password={password} 
                      factoryName={storeName} 
                      trialDay={trialDay} 
                    />
                  );
                })()
              ) : (
                <div className="h-full flex items-center justify-center p-12">
                  <GlassCard className="p-8 text-center max-w-md">
                    <AlertTriangle className="w-12 h-12 text-auris-orange mx-auto mb-4 animate-pulse" />
                    <h3 className="text-sm font-display uppercase tracking-widest text-white/90">Select Store First</h3>
                    <p className="text-[11px] text-white/45 mt-2">Go to Overwatch and select a store from Mission Control first.</p>
                  </GlassCard>
                </div>
              )
            )}
            {activeTab === 'management' && <ManagementTab onSelectStore={handleSelectStore} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={`group relative p-4 rounded-2xl transition-all duration-300 ${active ? 'bg-auris-cyan/10 text-auris-cyan border border-auris-cyan/20' : 'text-white/20 hover:text-white/60 hover:bg-white/5'}`}
    >
      {React.cloneElement(icon, { className: "w-5 h-5" })}
      <div className="absolute left-full ml-6 px-3 py-2 bg-auris-card backdrop-blur-xl border border-white/10 rounded-xl text-[10px] uppercase font-mono tracking-widest pointer-events-none opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0 z-50 whitespace-nowrap shadow-2xl">
         {label}
      </div>
      {active && (
        <motion.div layoutId="nav-glow" className="absolute inset-0 bg-auris-cyan/15 blur-xl rounded-2xl -z-10" />
      )}
    </button>
  );
}
