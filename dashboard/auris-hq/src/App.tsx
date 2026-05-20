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
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto custom-scrollbar">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 md:mb-12 gap-6 md:gap-4">
        <div>
          <h2 className="text-[10px] uppercase tracking-[0.4em] font-mono text-auris-cyan">AURIS GLOBAL OVERWATCH</h2>
          <h1 className="text-4xl font-display font-light mt-2 tracking-tight uppercase">Mission Control</h1>
        </div>
        <div className="flex flex-col md:flex-row gap-4 md:gap-6 w-full md:w-auto">
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
    <div className="h-full p-4 md:p-12 max-w-6xl mx-auto overflow-y-auto custom-scrollbar relative">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 md:mb-12 gap-4">
        <div>
          <h2 className="text-[10px] uppercase tracking-[0.4em] font-mono text-auris-cyan">AURIS PROVISIONING CORE</h2>
          <h1 className="text-3xl font-display font-light mt-2 uppercase tracking-tight">Factory Onboarding</h1>
        </div>
        <button 
          onClick={() => handleOpenOnboard('')}
          className="relative overflow-hidden px-6 py-3 rounded font-display bg-gradient-to-r from-blue-600 to-auris-purple text-[10px] uppercase tracking-widest flex items-center gap-2 w-full md:w-auto justify-center"
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


// --- CLIENT MANAGEMENT (REGISTRY) TAB ---
const ManagementTab = ({ onSelectStore }: { onSelectStore: (id: string) => void }) => {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [clientTab, setClientTab] = useState<'overview' | 'system' | 'zones' | 'analytics' | 'logs'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [addStep, setAddStep] = useState<1 | 2 | 3 | 4>(1);
  const [addForm, setAddForm] = useState({
    store_id: '',
    store_name: '',
    city: '',
    plan: 'FACTORY', // 'FACTORY' | 'RETAIL' | 'PILOT'
    password: '',
    numShifts: 2,
    shifts: [
      { label: 'Day Shift', startTime: '09:00', endTime: '17:00', days: { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: true, Sun: false } },
      { label: 'Night Shift', startTime: '17:00', endTime: '01:00', days: { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: true, Sun: false } }
    ],
    operatorWage: 120,
    supervisorWage: 250,
    contractorWage: 180,
    whatsAppNumber: ''
  });
  
  const [createdCredentials, setCreatedCredentials] = useState<any>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Tab detailed states
  const [detailedStore, setDetailedStore] = useState<any>(null);
  const [deadTimeLoss, setDeadTimeLoss] = useState<any>(null);
  const [zones, setZones] = useState<any[]>([]);
  const [whatsappLogs, setWhatsappLogs] = useState<any[]>([]);
  const [retailFootfall, setRetailFootfall] = useState<any>(null);
  const [revealKey, setRevealKey] = useState(false);
  
  // Password reset state
  const [newPassword, setNewPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

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

  useEffect(() => {
    if (!selectedClient) {
      setDetailedStore(null);
      setDeadTimeLoss(null);
      setZones([]);
      setWhatsappLogs([]);
      setRetailFootfall(null);
      setRevealKey(false);
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
    
    const client = clients.find(c => c.store_id === selectedClient);
    if (!client) return;
    
    if (client.plan === 'FACTORY') {
      const fetchDeadTime = async () => {
        try {
          const res = await fetch(`${API_BASE}/api/factory/deadtime`, {
            headers: {
              'X-Store-ID': selectedClient,
              'X-Password': 'auris123'
            }
          });
          if (res.ok) {
            const data = await res.json();
            setDeadTimeLoss(data);
          }
        } catch (err) {
          console.error("Failed to load dead time metrics", err);
        }
      };
      
      const fetchZonesList = async () => {
        try {
          const res = await fetch(`${API_BASE}/api/factory/zones?store_id=${selectedClient}`, {
            headers: { 'X-Admin-Key': ADMIN_KEY }
          });
          if (res.ok) {
            const data = await res.json();
            setZones(data.zones || []);
          }
        } catch (err) {
          console.error("Failed to load factory zones", err);
        }
      };
      
      fetchDeadTime();
      fetchZonesList();
    } else if (client.plan === 'RETAIL') {
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
    
    const fetchLogs = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/whatsapp/logs?store_id=${selectedClient}`, {
          headers: { 'X-Admin-Key': ADMIN_KEY }
        });
        if (res.ok) {
          const data = await res.json();
          setWhatsappLogs(data.logs || []);
        }
      } catch (err) {
        console.error("Failed to load WhatsApp logs", err);
      }
    };
    fetchLogs();
    
  }, [selectedClient, clients]);

  const handleResetPassword = async () => {
    if (!newPassword) {
      showToast("Please enter a new password", 'error');
      return;
    }
    setResettingPassword(true);
    try {
      const res = await fetch(`${API_BASE}/admin/stores/${selectedClient}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': ADMIN_KEY
        },
        body: JSON.stringify({ password: newPassword })
      });
      if (!res.ok) throw new Error("Failed to reset password");
      showToast("Password updated successfully!", 'success');
      setNewPassword('');
    } catch (err: any) {
      showToast(err.message || "Failed to reset password", 'error');
    } finally {
      setResettingPassword(false);
    }
  };

  const handleToggleSuspend = async () => {
    const client = clients.find(c => c.store_id === selectedClient);
    if (!client) return;
    
    const newStatus = client.status === 'suspended' ? 'live' : 'suspended';
    
    try {
      if (client.plan === 'FACTORY') {
        const res = await fetch(`${API_BASE}/api/factory/config`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Key': ADMIN_KEY
          },
          body: JSON.stringify({
            store_id: selectedClient,
            status: newStatus
          })
        });
        if (!res.ok) throw new Error("Failed to update status");
      }
      
      setClients(prev => prev.map(c => c.store_id === selectedClient ? { ...c, status: newStatus } : c));
      showToast(`Client ${newStatus === 'suspended' ? 'suspended' : 'activated'} successfully!`, 'success');
    } catch (err: any) {
      showToast(err.message || "Failed to update client status", 'error');
    }
  };

  const handleMarkLive = async () => {
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
      if (!res.ok) throw new Error("Failed to mark factory LIVE");
      
      setClients(prev => prev.map(c => c.store_id === selectedClient ? { ...c, status: 'live' } : c));
      showToast("Factory is now LIVE!", 'success');
    } catch (err: any) {
      showToast(err.message || "Failed to mark live", 'error');
    }
  };

  const handleDeleteClient = async () => {
    if (!window.confirm(`Are you absolutely sure you want to delete ${selectedClient}? This will permanently delete all associated edge streams, camera keys, and historical spatial intelligence.`)) {
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

  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.store_id || !addForm.store_name || !addForm.password) {
      showToast("Please fill in all mandatory fields", 'error');
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
        throw new Error(errData.detail || "Failed to provision store");
      }
      
      const data = await res.json();
      setCreatedCredentials({
        store_id: cleanId,
        store_name: addForm.store_name.trim(),
        password: addForm.password,
        api_key: data.api_key,
        plan: addForm.plan
      });
      
      showToast("Store provisioned in core index!", 'success');
      
      if (addForm.plan === 'FACTORY') {
        setAddStep(2);
      } else {
        setAddStep(4);
        fetchClients();
      }
    } catch (err: any) {
      showToast(err.message || "Failed to provision store", 'error');
    }
  };

  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.whatsAppNumber) {
      showToast("WhatsApp alert target number is required", 'error');
      return;
    }
    
    try {
      const onboardPayload = {
        store_id: createdCredentials.store_id,
        factory_name: createdCredentials.store_name,
        city: addForm.city || 'Chennai',
        numShifts: Number(addForm.numShifts),
        shifts: addForm.shifts.slice(0, Number(addForm.numShifts)),
        totalHeadcount: 10,
        operatorWage: Number(addForm.operatorWage),
        supervisorWage: Number(addForm.supervisorWage),
        contractorWage: Number(addForm.contractorWage),
        whatsAppNumber: addForm.whatsAppNumber
      };
      
      const res = await fetch(`${API_BASE}/api/factory/onboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': ADMIN_KEY
        },
        body: JSON.stringify(onboardPayload)
      });
      
      if (!res.ok) throw new Error("Failed to onboard factory configuration");
      
      showToast("Factory configuration onboarded!", 'success');
      setAddStep(3);
    } catch (err: any) {
      showToast(err.message || "Failed to onboard factory", 'error');
    }
  };

  const handleFloorplanUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const json = JSON.parse(evt.target?.result as string);
        const res = await fetch(`${API_BASE}/admin/stores/${createdCredentials.store_id}/config`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Key': ADMIN_KEY
          },
          body: JSON.stringify({
            zone_config: json.zone_config || {},
            floors: json.floors || []
          })
        });
        if (!res.ok) throw new Error("Failed to upload configuration map");
        showToast("Floorplan matrix uploaded successfully!", 'success');
        setAddStep(4);
        fetchClients();
      } catch (err: any) {
        showToast("Invalid JSON schema or failed to upload: " + err.message, 'error');
      }
    };
    reader.readAsText(file);
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    showToast(`${field} copied to clipboard`, 'success');
  };

  // Filter clients based on search query
  const filteredClients = clients.filter(c => 
    c.store_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.store_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedClientData = clients.find(c => c.store_id === selectedClient);

  return (
    <div className="relative min-h-[calc(100vh-12rem)] text-white p-4 md:p-6 select-none font-sans">
      
      {/* Toast Notifications */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="fixed top-6 right-6 z-50 pointer-events-none"
          >
            <div className={`p-4 rounded-xl border backdrop-blur-xl shadow-2xl flex items-center gap-3 w-80 bg-black/80 ${
              toast.type === 'success' 
                ? 'border-auris-cyan/40 shadow-auris-cyan/10 text-auris-cyan' 
                : 'border-auris-orange/40 shadow-auris-orange/10 text-auris-orange'
            }`}>
              <div className={`w-2 h-2 rounded-full ${toast.type === 'success' ? 'bg-auris-cyan animate-pulse' : 'bg-auris-orange'}`} />
              <span className="text-[11px] font-mono tracking-wider font-medium text-white/95">{toast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
        
        {/* Left Panel: Client Registry Index */}
        <div className={`md:col-span-1 flex flex-col gap-4 ${selectedClient ? 'hidden md:flex' : 'flex'}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-display font-light uppercase tracking-widest text-white/70 flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-auris-cyan" /> Registry Index
            </h2>
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
                    { label: 'Night Shift', startTime: '17:00', endTime: '01:00', days: { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: true, Sun: false } }
                  ],
                  operatorWage: 120,
                  supervisorWage: 250,
                  contractorWage: 180,
                  whatsAppNumber: ''
                });
                setAddStep(1);
                setShowAddModal(true);
              }}
              className="px-3 py-1.5 rounded-lg border border-auris-cyan/30 bg-auris-cyan/5 text-auris-cyan text-[10px] font-mono tracking-wider uppercase font-bold hover:bg-auris-cyan/15 transition-all flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Onboard New
            </button>
          </div>

          <GlassCard className="p-4 flex flex-col gap-4 flex-1 min-h-[500px]">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/35" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="FILTER SYSTEM ID / NAME..."
                className="w-full bg-black/40 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-xs font-mono uppercase tracking-wider text-white placeholder-white/30 focus:border-auris-cyan/40 focus:outline-none transition-colors"
              />
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto max-h-[480px] pr-1 space-y-2.5 custom-scrollbar">
              {loading ? (
                <div className="h-40 flex items-center justify-center text-white/40 text-[10px] font-mono tracking-widest">
                  LOADING REGISTRY INDEX...
                </div>
              ) : filteredClients.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-white/35 text-[10px] font-mono tracking-widest text-center px-4">
                  NO CLIENTS FOUND IN CORE DATASTORE
                </div>
              ) : (
                filteredClients.map((client) => {
                  const isSelected = selectedClient === client.store_id;
                  return (
                    <div
                      key={client.store_id}
                      onClick={() => {
                        setSelectedClient(client.store_id);
                        setClientTab('overview');
                      }}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col gap-2 relative ${
                        isSelected 
                          ? 'bg-white/[0.04] border-auris-cyan/40 shadow-[0_0_15px_rgba(0,255,255,0.06)]' 
                          : 'bg-black/20 border-white/5 hover:border-white/15'
                      }`}
                    >
                      {/* Laser pointer accent on selected */}
                      {isSelected && (
                        <div className="absolute left-0 top-3 bottom-3 w-0.5 bg-auris-cyan rounded-r" />
                      )}

                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-xs font-display uppercase tracking-wider font-light text-white/90">
                            {client.store_name}
                          </h3>
                          <span className="text-[9px] font-mono opacity-40 uppercase tracking-widest block mt-0.5">
                            {client.store_id}
                          </span>
                        </div>
                        <span className={`text-[8px] font-mono px-2 py-0.5 rounded font-bold ${
                          client.plan === 'FACTORY' 
                            ? 'bg-blue-500/10 border border-blue-500/30 text-blue-400' 
                            : client.plan === 'RETAIL' 
                              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                              : 'bg-white/5 border border-white/20 text-white/50'
                        }`}>
                          {client.plan}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[8px] font-mono tracking-widest text-white/40 mt-1">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-auris-cyan animate-pulse" />
                          <span>EDGE ACTIVE</span>
                        </div>
                        <span className={`px-1.5 py-0.2 rounded border uppercase font-medium ${
                          client.status === 'live'
                            ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5'
                            : client.status === 'pending'
                              ? 'border-auris-orange/30 text-auris-orange bg-auris-orange/5'
                              : 'border-red-500/30 text-red-500 bg-red-500/5'
                        }`}>
                          {client.status}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </GlassCard>
        </div>

        {/* Right Panel: Selected Client Portal */}
        <div className={`md:col-span-2 flex flex-col gap-4 ${!selectedClient ? 'hidden md:flex' : 'flex'}`}>
          <div className="flex items-center gap-3">
            {selectedClient && (
              <button 
                onClick={() => setSelectedClient(null)}
                className="md:hidden p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white/60 text-xs flex items-center cursor-pointer"
              >
                ← Back
              </button>
            )}
            <h2 className="text-xs font-display font-light uppercase tracking-widest text-white/70 flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-auris-cyan" /> Core Portal
            </h2>
          </div>

          {!selectedClient ? (
            <GlassCard className="flex-1 flex flex-col items-center justify-center p-12 text-center min-h-[560px]">
              <div className="w-12 h-12 rounded-full border border-dashed border-white/15 bg-white/5 flex items-center justify-center text-white/30 mb-4 animate-pulse">
                <Radar className="w-5 h-5" />
              </div>
              <h3 className="text-xs font-display uppercase tracking-widest text-white/70">Registry Hub Idle</h3>
              <p className="text-[10px] text-white/35 max-w-sm mt-2 leading-relaxed">
                Select a live client from the registry database in Overwatch index to interface with their edge feeds, active zones, live footfall, and WhatsApp brief transaction logs.
              </p>
            </GlassCard>
          ) : (
            <GlassCard className="flex-1 p-5 flex flex-col gap-5 min-h-[560px]">
              {/* Client Portal Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/5 pb-4 gap-3">
                <div>
                  <h3 className="text-sm font-display uppercase tracking-widest font-light text-white/95 flex items-center gap-2">
                    {selectedClientData?.store_name}
                  </h3>
                  <span className="text-[10px] font-mono text-white/40 block mt-1 uppercase tracking-widest">
                    SYSTEM ID: {selectedClient} — PLAN: <span className="text-auris-cyan font-bold">{selectedClientData?.plan}</span>
                  </span>
                </div>
                
                {/* Sub Tab Navigation */}
                <div className="flex items-center gap-1 bg-black/40 border border-white/5 p-1 rounded-xl w-max max-w-full overflow-x-auto">
                  {(['overview', 'system', selectedClientData?.plan === 'FACTORY' && 'zones', 'analytics', 'logs'].filter(Boolean) as any[]).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setClientTab(tab)}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-mono tracking-wider uppercase font-bold transition-all cursor-pointer ${
                        clientTab === tab 
                          ? 'bg-auris-cyan text-black shadow-lg shadow-auris-cyan/15' 
                          : 'text-white/40 hover:text-white/70 hover:bg-white/[0.03]'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sub Tab Content Area */}
              <div className="flex-1">
                
                {/* 1. OVERVIEW SUB TAB */}
                {clientTab === 'overview' && (
                  <div className="space-y-6">
                    {/* Top Stats Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="p-3.5 border border-white/5 bg-black/10 rounded-2xl flex flex-col">
                        <span className="text-[8px] font-mono uppercase tracking-widest text-white/35">Store Name</span>
                        <span className="text-xs text-white/90 font-medium truncate mt-1">{selectedClientData?.store_name}</span>
                      </div>
                      <div className="p-3.5 border border-white/5 bg-black/10 rounded-2xl flex flex-col">
                        <span className="text-[8px] font-mono uppercase tracking-widest text-white/35">Plan Tier</span>
                        <span className="text-xs text-auris-cyan font-mono font-bold mt-1 tracking-wider">{selectedClientData?.plan}</span>
                      </div>
                      <div className="p-3.5 border border-white/5 bg-black/10 rounded-2xl flex flex-col">
                        <span className="text-[8px] font-mono uppercase tracking-widest text-white/35">Current Status</span>
                        <span className="text-xs text-white/90 mt-1 flex items-center gap-1.5 uppercase font-mono tracking-wider font-bold">
                          <span className={`w-2 h-2 rounded-full ${
                            selectedClientData?.status === 'live' 
                              ? 'bg-emerald-500 animate-pulse' 
                              : selectedClientData?.status === 'pending'
                                ? 'bg-auris-orange'
                                : 'bg-red-500'
                          }`} />
                          {selectedClientData?.status}
                        </span>
                      </div>
                      <div className="p-3.5 border border-white/5 bg-black/10 rounded-2xl flex flex-col">
                        <span className="text-[8px] font-mono uppercase tracking-widest text-white/35">Onboard Location</span>
                        <span className="text-xs text-white/90 font-medium mt-1">{selectedClientData?.factoryConfig?.city || 'Chennai, India'}</span>
                      </div>
                    </div>

                    {/* Lower grid: Metadata info & Actions */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                      
                      {/* Left: Store metadata details */}
                      <div className="flex flex-col gap-4">
                        <h4 className="text-[9px] font-mono uppercase tracking-widest text-white/40 border-b border-white/5 pb-2">
                          Personnel & Spatial Metadata
                        </h4>
                        
                        <div className="space-y-3 text-[10px] font-mono">
                          <div className="flex justify-between">
                            <span className="text-white/40">CREATION EPOCH</span>
                            <span className="text-white/80">{selectedClientData?.created_at ? new Date(selectedClientData.created_at).toLocaleString() : 'N/A'}</span>
                          </div>
                          {selectedClientData?.plan === 'FACTORY' && (
                            <>
                              <div className="flex justify-between">
                                <span className="text-white/40">TOTAL SHIFTS</span>
                                <span className="text-white/80">{selectedClientData?.factoryConfig?.shifts?.length || 2} Active Shifts</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-white/40">WHATSAPP BRIEF TARGET</span>
                                <span className="text-white/80 text-auris-cyan">{selectedClientData?.factoryConfig?.whatsAppNumber || 'None Set'}</span>
                              </div>
                            </>
                          )}
                          <div className="flex justify-between">
                            <span className="text-white/40">SPATIAL CALIBRATION</span>
                            <span className="text-emerald-400">ENABLED & ACTIVE</span>
                          </div>
                        </div>

                        {/* Dead Time Cost (Factory only) */}
                        {selectedClientData?.plan === 'FACTORY' && (
                          <div className="mt-4 p-4 border border-red-500/15 bg-red-500/5 rounded-2xl">
                            <div className="flex justify-between items-start">
                              <div>
                                <h5 className="text-[8px] font-mono uppercase tracking-widest text-red-400/70">DEAD TIME LOSS (30 DAYS)</h5>
                                <div className="text-xl font-display font-light text-red-400 mt-1">
                                  ₹{deadTimeLoss?.summary?.dead_cost_inr ? Math.round(deadTimeLoss.summary.dead_cost_inr).toLocaleString('en-IN') : '2,34,500'}
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="text-[8px] font-mono uppercase tracking-widest text-white/35 block">DEAD TIME HOURS</span>
                                <span className="text-xs font-mono font-bold text-white/80 mt-1 block">
                                  {deadTimeLoss?.summary?.dead_hours_total ? deadTimeLoss.summary.dead_hours_total.toFixed(1) : '18.4'} hrs
                                </span>
                              </div>
                            </div>
                            <p className="text-[9px] text-white/45 font-sans mt-2.5 leading-relaxed">
                              {deadTimeLoss?.narrative || 'Analysis: Unproductive work station bottlenecks detected in assembly sectors during night shift intervals. Recommend restructuring floor plan routing.'}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Right: Quick actions */}
                      <div className="flex flex-col gap-4">
                        <h4 className="text-[9px] font-mono uppercase tracking-widest text-white/40 border-b border-white/5 pb-2">
                          Quick Management Actions
                        </h4>

                        <div className="flex flex-col gap-3">
                          {/* View dashboard */}
                          <button
                            onClick={() => onSelectStore(selectedClient)}
                            className="w-full py-2.5 rounded-xl border border-auris-cyan/30 bg-auris-cyan/5 hover:bg-auris-cyan/15 text-auris-cyan text-[10px] font-mono uppercase font-bold tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-2"
                          >
                            <LayoutDashboard className="w-3.5 h-3.5" /> View Overwatch Dashboard
                          </button>

                          {/* Suspend Toggle */}
                          <button
                            onClick={handleToggleSuspend}
                            className={`w-full py-2.5 rounded-xl border text-[10px] font-mono uppercase font-bold tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                              selectedClientData?.status === 'suspended'
                                ? 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/15 text-emerald-400'
                                : 'border-auris-orange/30 bg-auris-orange/5 hover:bg-auris-orange/15 text-auris-orange'
                            }`}
                          >
                            <AlertTriangle className="w-3.5 h-3.5" /> 
                            {selectedClientData?.status === 'suspended' ? 'Activate Client Stream' : 'Suspend Client Stream'}
                          </button>

                          {/* Delete */}
                          <button
                            onClick={handleDeleteClient}
                            className="w-full py-2.5 rounded-xl border border-red-500/30 bg-red-500/5 hover:bg-red-500/15 text-red-500 text-[10px] font-mono uppercase font-bold tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-2"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete Client
                          </button>

                          {/* Password reset form */}
                          <div className="mt-2 border-t border-white/5 pt-4 flex flex-col gap-2">
                            <span className="text-[8px] font-mono uppercase tracking-widest text-white/30 block mb-1">
                              RESET CLIENT ACCESS PASSWORD
                            </span>
                            <div className="flex gap-2">
                              <input
                                type="password"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                placeholder="ENTER NEW SYSTEM PASSWORD..."
                                className="flex-1 bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-[10px] font-mono text-white placeholder-white/20 focus:border-auris-cyan/40 focus:outline-none transition-colors"
                              />
                              <button
                                onClick={handleResetPassword}
                                disabled={resettingPassword}
                                className="px-4 py-2 rounded-xl border border-white/15 hover:border-auris-cyan bg-white/5 text-white hover:text-auris-cyan text-[10px] font-mono uppercase font-bold tracking-wider transition-all cursor-pointer disabled:opacity-50"
                              >
                                {resettingPassword ? 'UPDATING...' : 'RESET'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                )}

                {/* 2. SYSTEM SUB TAB */}
                {clientTab === 'system' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* Left side: Edge device & API Keys */}
                      <div className="space-y-5">
                        <h4 className="text-[9px] font-mono uppercase tracking-widest text-white/40 border-b border-white/5 pb-2">
                          Edge Stream Diagnostics
                        </h4>

                        <div className="p-4 border border-white/5 bg-black/10 rounded-2xl space-y-4">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-mono text-white/45">HEARTBEAT LINK</span>
                            <span className="px-2 py-0.5 bg-auris-cyan text-black text-[8px] font-mono font-bold rounded">
                              ONLINE
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] font-mono">
                            <span className="text-white/45">LAST FRAME PROCESSED</span>
                            <span className="text-white/80">2s ago</span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] font-mono">
                            <span className="text-white/45">FPS METRIC BOUNDS</span>
                            <span className="text-white/80">30.4 fps (Nominal)</span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] font-mono">
                            <span className="text-white/45">ACTIVE INTEL SENSORS</span>
                            <span className="text-white/80">4 Cameras Configured</span>
                          </div>
                        </div>

                        {/* Secret API Key */}
                        <div className="p-4 border border-white/5 bg-black/10 rounded-2xl space-y-3">
                          <span className="text-[8px] font-mono uppercase tracking-widest text-white/40 block">
                            SYSTEM CLOUD API KEY
                          </span>
                          
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono select-text truncate">
                              {revealKey 
                                ? (detailedStore?.api_key || 'sk_dev_api_key_not_fetched') 
                                : '••••••••••••••••••••••••••••••••••••••••••••••••'}
                            </div>
                            <button
                              onClick={() => setRevealKey(!revealKey)}
                              className="p-2 border border-white/10 bg-white/5 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition-all cursor-pointer"
                              title={revealKey ? "Hide API Key" : "Reveal API Key"}
                            >
                              {revealKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => handleCopy(detailedStore?.api_key || '', 'API Key')}
                              className="p-2 border border-white/10 bg-white/5 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition-all cursor-pointer"
                              title="Copy API Key"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <p className="text-[8px] text-white/35 leading-relaxed font-sans">
                            Use this key to authenticate edge streams calling `POST /api/blobs` and local camera heartbeat sensors. Keep it secure.
                          </p>
                        </div>
                      </div>

                      {/* Right side: Shifts Configuration (Factory Only) */}
                      {selectedClientData?.plan === 'FACTORY' && (
                        <div className="space-y-4">
                          <h4 className="text-[9px] font-mono uppercase tracking-widest text-white/40 border-b border-white/5 pb-2">
                            Shifts & Operational Wage Schedules
                          </h4>

                          <div className="space-y-3">
                            <span className="text-[8px] font-mono uppercase tracking-widest text-white/30 block mb-1">
                              ACTIVE SHIFT ROSTER
                            </span>

                            {(selectedClientData?.factoryConfig?.shifts || []).map((shift: any, idx: number) => (
                              <div key={idx} className="p-3 bg-black/20 border border-white/5 rounded-xl flex items-center justify-between text-[10px] font-mono">
                                <div>
                                  <span className="font-bold text-white/80">{shift.label}</span>
                                  <span className="text-white/35 block text-[8px] mt-0.5">
                                    {Object.keys(shift.days || {}).filter(d => shift.days[d]).join(', ')}
                                  </span>
                                </div>
                                <div className="text-right">
                                  <span className="text-auris-cyan font-bold">{shift.startTime} - {shift.endTime}</span>
                                  <span className="text-white/35 block text-[8px] mt-0.5">Duration: 8.0 hrs</span>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="grid grid-cols-3 gap-3 mt-4">
                            <div className="p-3 bg-black/10 border border-white/5 rounded-xl text-center">
                              <span className="text-[7px] font-mono text-white/35 block uppercase tracking-wider">OPERATOR RATE</span>
                              <span className="text-xs font-mono font-bold text-white/80 mt-1 block">₹{selectedClientData?.factoryConfig?.operatorWage || 120}/hr</span>
                            </div>
                            <div className="p-3 bg-black/10 border border-white/5 rounded-xl text-center">
                              <span className="text-[7px] font-mono text-white/35 block uppercase tracking-wider">SUPERVISOR RATE</span>
                              <span className="text-xs font-mono font-bold text-white/80 mt-1 block">₹{selectedClientData?.factoryConfig?.supervisorWage || 250}/hr</span>
                            </div>
                            <div className="p-3 bg-black/10 border border-white/5 rounded-xl text-center">
                              <span className="text-[7px] font-mono text-white/35 block uppercase tracking-wider">CONTRACTOR RATE</span>
                              <span className="text-xs font-mono font-bold text-white/80 mt-1 block">₹{selectedClientData?.factoryConfig?.contractorWage || 180}/hr</span>
                            </div>
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                )}

                {/* 3. ZONES SUB TAB */}
                {clientTab === 'zones' && selectedClientData?.plan === 'FACTORY' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <h4 className="text-[9px] font-mono uppercase tracking-widest text-white/40">
                        Operational Manufacturing Zone Vectors
                      </h4>
                      {selectedClientData?.status === 'pending' && (
                        <button
                          onClick={handleMarkLive}
                          className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold tracking-wider uppercase rounded-lg hover:bg-emerald-500/20 transition-all cursor-pointer flex items-center gap-1.5 animate-pulse"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Mark Factory LIVE
                        </button>
                      )}
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-[10px] font-mono">
                        <thead>
                          <tr className="border-b border-white/10 text-white/40 uppercase tracking-widest text-[8px]">
                            <th className="py-2.5 px-3">ZONE ID</th>
                            <th className="py-2.5 px-3">ZONE LABEL</th>
                            <th className="py-2.5 px-3">ZONE TYPE</th>
                            <th className="py-2.5 px-3">EXPECTED HEADCOUNT</th>
                            <th className="py-2.5 px-3">DOWNSTREAM DEST</th>
                            <th className="py-2.5 px-3 text-right">WAGE CAT</th>
                          </tr>
                        </thead>
                        <tbody>
                          {zones.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-10 text-center text-white/35 text-[9px] uppercase tracking-widest">
                                NO FLOORS OR WORKSTATION VECTORS CONFIG FIND IN SPATIAL MAPS
                              </td>
                            </tr>
                          ) : (
                            zones.map((zone, i) => (
                              <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors text-white/80">
                                <td className="py-3 px-3 font-bold text-auris-cyan">{zone.zone_id}</td>
                                <td className="py-3 px-3">{zone.zone_label || zone.label || 'Assembly Line'}</td>
                                <td className="py-3 px-3">
                                  <span className={`px-2 py-0.5 rounded text-[8px] uppercase tracking-wide font-medium ${
                                    zone.zone_type === 'WORK_STATION'
                                      ? 'border border-blue-500/20 text-blue-400 bg-blue-500/5'
                                      : 'border border-white/10 text-white/40'
                                  }`}>
                                    {zone.zone_type}
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-center">{zone.expected_headcount || 2} operators</td>
                                <td className="py-3 px-3 text-white/45">{zone.downstream_zone || 'None'}</td>
                                <td className="py-3 px-3 text-right text-auris-cyan uppercase">{zone.worker_category || 'OPERATOR'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 4. ANALYTICS SUB TAB */}
                {clientTab === 'analytics' && (
                  <div className="space-y-6">
                    {selectedClientData?.plan === 'FACTORY' ? (
                      <div className="h-[460px] overflow-y-auto pr-1 space-y-4 custom-scrollbar">
                        <h4 className="text-[9px] font-mono uppercase tracking-widest text-white/40 border-b border-white/5 pb-2 flex items-center gap-2">
                          <TrendingUp className="w-3.5 h-3.5 text-auris-cyan animate-pulse" /> Live Factory Spatial Analytics Dashboard
                        </h4>
                        
                        <div className="border border-white/5 rounded-2xl bg-black/10 overflow-hidden">
                          <FactoryDashboard 
                            storeId={selectedClient} 
                            password="auris123" 
                            factoryName={selectedClientData?.store_name || selectedClient} 
                            trialDay={30} 
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        <h4 className="text-[9px] font-mono uppercase tracking-widest text-white/40 border-b border-white/5 pb-2">
                          Retail Space Footfall Analytics
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <GlassCard className="p-4">
                            <span className="text-[8px] font-mono uppercase tracking-widest text-white/35 block">TODAY TOTAL INFLOW</span>
                            <div className="text-2xl font-display font-light text-auris-cyan mt-1">
                              {retailFootfall?.today_total ? retailFootfall.today_total.toLocaleString() : '842'}
                            </div>
                            <span className="text-[8px] font-mono text-emerald-400 mt-1 block tracking-wider font-bold">
                              +14.2% SINCE LAST EPOCH
                            </span>
                          </GlassCard>
                          <GlassCard className="p-4">
                            <span className="text-[8px] font-mono uppercase tracking-widest text-white/35 block">PEAK DEMAND HOUR</span>
                            <div className="text-2xl font-display font-light text-white mt-1">
                              {retailFootfall?.peak_hour || '04:00 PM'}
                            </div>
                            <span className="text-[8px] font-mono text-white/30 mt-1 block">
                              MAX CONCURRENT LOADS
                            </span>
                          </GlassCard>
                          <GlassCard className="p-4">
                            <span className="text-[8px] font-mono uppercase tracking-widest text-white/35 block">AVERAGE DWELL TIME</span>
                            <div className="text-2xl font-display font-light text-white mt-1">
                              {retailFootfall?.avg_dwell_minutes || '14.5'}
                            </div>
                            <span className="text-[8px] font-mono text-white/30 mt-1 block">
                              ESTIMATED DWELL MINS
                            </span>
                          </GlassCard>
                        </div>

                        <div className="p-4 border border-white/5 bg-black/10 rounded-2xl">
                          <span className="text-[8px] font-mono uppercase tracking-widest text-white/35 block mb-3">
                            Hourly Inflow Load Distribution (IST)
                          </span>
                          
                          <div className="h-44 flex items-end gap-2 px-2 border-b border-white/10 pb-1">
                            {(retailFootfall?.by_hour || [
                              { hour: 9, in: 24 }, { hour: 10, in: 45 }, { hour: 11, in: 52 }, 
                              { hour: 12, in: 78 }, { hour: 13, in: 34 }, { hour: 14, in: 61 }, 
                              { hour: 15, in: 95 }, { hour: 16, in: 124 }, { hour: 17, in: 110 }
                            ]).map((item: any, i: number) => {
                              const maxVal = Math.max(...(retailFootfall?.by_hour || [{ in: 124 }]).map((x: any) => x.in), 124);
                              const heightPct = (item.in / maxVal) * 100;
                              return (
                                <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group cursor-help">
                                  <div className="text-[7px] font-mono text-auris-cyan opacity-0 group-hover:opacity-100 transition-opacity">
                                    {item.in}
                                  </div>
                                  <div 
                                    style={{ height: `${heightPct}%` }} 
                                    className="w-full bg-auris-cyan/20 border-t-2 border-auris-cyan/60 rounded-t group-hover:bg-auris-cyan/40 transition-colors"
                                  />
                                  <span className="text-[7px] font-mono text-white/35 mt-1 block">
                                    {item.hour}:05
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 5. LOGS SUB TAB */}
                {clientTab === 'logs' && (
                  <div className="space-y-6">
                    <h4 className="text-[9px] font-mono uppercase tracking-widest text-white/40 border-b border-white/5 pb-2">
                      WhatsApp transaction Alert & Daily Brief Logs
                    </h4>

                    <div className="overflow-x-auto max-h-[380px] custom-scrollbar pr-1">
                      <table className="w-full text-left border-collapse text-[10px] font-mono">
                        <thead>
                          <tr className="border-b border-white/10 text-white/40 uppercase tracking-widest text-[8px]">
                            <th className="py-2 px-3">SENT AT</th>
                            <th className="py-2 px-3">MESSAGE TYPE</th>
                            <th className="py-2 px-3">RECIPIENT NUMBER</th>
                            <th className="py-2 px-3">MESSAGE PREVIEW</th>
                            <th className="py-2 px-3 text-right">STATUS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {whatsappLogs.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-10 text-center text-white/35 text-[9px] uppercase tracking-widest">
                                NO TRANSACTION LOGS RECORD IN TWILIO DB BUFFER
                              </td>
                            </tr>
                          ) : (
                            whatsappLogs.map((log, i) => (
                              <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors text-white/80">
                                <td className="py-3 px-3 text-white/45">
                                  {log.sent_at ? new Date(log.sent_at).toLocaleString() : 'N/A'}
                                </td>
                                <td className="py-3 px-3 font-bold text-white/90 uppercase">{log.message_type || 'DAILY_BRIEF'}</td>
                                <td className="py-3 px-3 text-auris-cyan">{log.to_number || log.recipient}</td>
                                <td className="py-3 px-3 max-w-xs truncate text-white/60" title={log.message_preview}>
                                  {log.message_preview}
                                </td>
                                <td className="py-3 px-3 text-right">
                                  <span className={`px-2 py-0.5 rounded text-[8px] uppercase font-bold ${
                                    log.status === 'delivered' || log.status === 'sent'
                                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                                      : 'bg-red-500/10 border border-red-500/30 text-red-400 animate-pulse'
                                  }`}>
                                    {log.status}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              </div>
            </GlassCard>
          )}
        </div>

      </div>

      {/* 4-STEP ONBOARDING WIZARD MODAL */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (addStep !== 4 && !window.confirm("Abandon onboarding wizard? The provision record will remain unconfigured.")) {
                  return;
                }
                setShowAddModal(false);
              }}
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              className="relative w-full max-w-lg border border-auris-border bg-auris-card rounded-2xl overflow-hidden shadow-2xl p-6"
            >
              <div className="scanline" />

              {/* Wizard Steps indicator */}
              <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-5">
                <div>
                  <h3 className="text-xs font-display uppercase tracking-widest text-white/90">AURIS System Onboarding</h3>
                  <span className="text-[9px] font-mono text-white/35 block mt-0.5">Provisioning spatial streams in the core cluster.</span>
                </div>
                
                {/* Steps pills */}
                <div className="flex items-center gap-1 font-mono text-[9px]">
                  {[1, 2, 3, 4].map((step) => {
                    const isPassed = addStep > step;
                    const isActive = addStep === step;
                    return (
                      <div
                        key={step}
                        className={`w-5 h-5 rounded-full flex items-center justify-center font-bold transition-all ${
                          isPassed 
                            ? 'bg-emerald-500 text-black' 
                            : isActive 
                              ? 'bg-auris-cyan text-black shadow-lg shadow-auris-cyan/20' 
                              : 'bg-white/5 border border-white/10 text-white/30'
                        }`}
                      >
                        {isPassed ? '✓' : step}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* STEP 1 FORM: Store Provisioning */}
              {addStep === 1 && (
                <form onSubmit={handleStep1Submit} className="space-y-4">
                  <h4 className="text-[10px] font-mono text-auris-cyan uppercase tracking-widest mb-3">
                    STEP 1: IDENTITY & LICENSING PROVISIONING
                  </h4>
                  
                  <div className="space-y-3.5">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[8px] font-mono uppercase tracking-widest text-white/40">SYSTEM ID (No Spaces, lowercase)</label>
                      <input
                        type="text"
                        required
                        value={addForm.store_id}
                        onChange={e => setAddForm({ ...addForm, store_id: e.target.value })}
                        placeholder="e.g. factory_chennai_01 or retail_hub_delhi..."
                        className="bg-black/50 border border-white/10 rounded-xl py-2.5 px-3.5 text-xs font-mono text-white placeholder-white/25 focus:border-auris-cyan/40 focus:outline-none transition-colors"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[8px] font-mono uppercase tracking-widest text-white/40">STORE / FACTORY DISPLAY NAME</label>
                      <input
                        type="text"
                        required
                        value={addForm.store_name}
                        onChange={e => setAddForm({ ...addForm, store_name: e.target.value })}
                        placeholder="e.g. Chennai Assembly Plant #1..."
                        className="bg-black/50 border border-white/10 rounded-xl py-2.5 px-3.5 text-xs text-white placeholder-white/25 focus:border-auris-cyan/40 focus:outline-none transition-colors"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[8px] font-mono uppercase tracking-widest text-white/40">LOCATION CITY</label>
                      <input
                        type="text"
                        value={addForm.city}
                        onChange={e => setAddForm({ ...addForm, city: e.target.value })}
                        placeholder="e.g. Chennai..."
                        className="bg-black/50 border border-white/10 rounded-xl py-2.5 px-3.5 text-xs text-white placeholder-white/25 focus:border-auris-cyan/40 focus:outline-none transition-colors"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[8px] font-mono uppercase tracking-widest text-white/40">PLAN ROUTING SELECT</label>
                        <div className="flex bg-black/40 border border-white/10 p-0.5 rounded-xl">
                          {(['FACTORY', 'RETAIL', 'PILOT'] as const).map((plan) => (
                            <button
                              key={plan}
                              type="button"
                              onClick={() => setAddForm({ ...addForm, plan })}
                              className={`flex-1 py-2 text-[8px] font-mono tracking-wider font-bold rounded-lg uppercase transition-all cursor-pointer ${
                                addForm.plan === plan
                                  ? 'bg-auris-cyan text-black shadow'
                                  : 'text-white/40 hover:text-white'
                              }`}
                            >
                              {plan}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[8px] font-mono uppercase tracking-widest text-white/40">ENCRYPTION / ACCESS KEY</label>
                        <input
                          type="password"
                          required
                          value={addForm.password}
                          onChange={e => setAddForm({ ...addForm, password: e.target.value })}
                          placeholder="PASSWORD IDENTIFIER..."
                          className="bg-black/50 border border-white/10 rounded-xl py-2.5 px-3.5 text-xs font-mono text-white placeholder-white/25 focus:border-auris-cyan/40 focus:outline-none transition-colors"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-5 border-t border-white/5 mt-5">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-2 border border-white/10 hover:border-white/20 bg-white/5 rounded-xl text-white/60 hover:text-white text-[10px] font-mono uppercase font-bold tracking-wider cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 border border-auris-cyan/35 bg-auris-cyan/10 hover:bg-auris-cyan/20 text-auris-cyan rounded-xl text-[10px] font-mono uppercase font-bold tracking-wider cursor-pointer"
                    >
                      Provision Client
                    </button>
                  </div>
                </form>
              )}

              {/* STEP 2 FORM: Factory Configuration (Only Factory Plan) */}
              {addStep === 2 && (
                <form onSubmit={handleStep2Submit} className="space-y-4">
                  <h4 className="text-[10px] font-mono text-auris-cyan uppercase tracking-widest mb-3">
                    STEP 2: OPERATIONS & SHIFTS CONFIG MATRIX
                  </h4>

                  <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[8px] font-mono uppercase tracking-widest text-white/40">NUMBER OF OPERATIONAL SHIFTS</label>
                        <select
                          value={addForm.numShifts}
                          onChange={e => setAddForm({ ...addForm, numShifts: Number(e.target.value) })}
                          className="bg-black/50 border border-white/10 rounded-xl py-2 px-3 text-xs font-mono text-white focus:border-auris-cyan/40 focus:outline-none"
                        >
                          <option value={1} className="bg-black">1 SHIFT SCHEDULE</option>
                          <option value={2} className="bg-black">2 SHIFTS SCHEDULE</option>
                          <option value={3} className="bg-black">3 SHIFTS SCHEDULE</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[8px] font-mono uppercase tracking-widest text-white/40">WHATSAPP TARGET NUMBER</label>
                        <input
                          type="text"
                          required
                          value={addForm.whatsAppNumber}
                          onChange={e => setAddForm({ ...addForm, whatsAppNumber: e.target.value })}
                          placeholder="e.g. +91XXXXXXXXXX..."
                          className="bg-black/50 border border-white/10 rounded-xl py-2.5 px-3.5 text-xs font-mono text-white placeholder-white/25 focus:border-auris-cyan/40 focus:outline-none transition-colors"
                        />
                      </div>
                    </div>

                    {/* Shifts Details Fields dynamically */}
                    <div className="space-y-2">
                      <span className="text-[8px] font-mono uppercase tracking-widest text-white/30 block mb-1">
                        SHIFT DETAILS (TIME INTERVALS)
                      </span>
                      {[...Array(Number(addForm.numShifts))].map((_, i) => (
                        <div key={i} className="p-3 border border-white/5 bg-black/25 rounded-xl grid grid-cols-3 gap-3">
                          <div className="flex flex-col gap-1">
                            <span className="text-[7px] font-mono text-white/40 uppercase">LABEL</span>
                            <input
                              type="text"
                              value={addForm.shifts[i]?.label || `Shift #${i+1}`}
                              onChange={e => {
                                const copy = [...addForm.shifts];
                                if (!copy[i]) copy[i] = { label: '', startTime: '09:00', endTime: '17:00', days: { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: true, Sun: false } };
                                copy[i].label = e.target.value;
                                setAddForm({ ...addForm, shifts: copy });
                              }}
                              className="bg-black border border-white/10 rounded py-1 px-2 text-[10px] text-white focus:outline-none"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[7px] font-mono text-white/40 uppercase">START TIME</span>
                            <input
                              type="text"
                              value={addForm.shifts[i]?.startTime || '09:00'}
                              onChange={e => {
                                const copy = [...addForm.shifts];
                                if (!copy[i]) copy[i] = { label: `Shift #${i+1}`, startTime: '', endTime: '17:00', days: { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: true, Sun: false } };
                                copy[i].startTime = e.target.value;
                                setAddForm({ ...addForm, shifts: copy });
                              }}
                              className="bg-black border border-white/10 rounded py-1 px-2 text-[10px] font-mono text-white focus:outline-none"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[7px] font-mono text-white/40 uppercase">END TIME</span>
                            <input
                              type="text"
                              value={addForm.shifts[i]?.endTime || '17:00'}
                              onChange={e => {
                                const copy = [...addForm.shifts];
                                if (!copy[i]) copy[i] = { label: `Shift #${i+1}`, startTime: '09:00', endTime: '', days: { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: true, Sun: false } };
                                copy[i].endTime = e.target.value;
                                setAddForm({ ...addForm, shifts: copy });
                              }}
                              className="bg-black border border-white/10 rounded py-1 px-2 text-[10px] font-mono text-white focus:outline-none"
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Hourly wages */}
                    <div className="space-y-2">
                      <span className="text-[8px] font-mono uppercase tracking-widest text-white/30 block">
                        HOURLY OPERATION WAGES SCHEDULE (INR)
                      </span>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-[7px] font-mono text-white/45 uppercase">OPERATOR RATE</span>
                          <input
                            type="number"
                            value={addForm.operatorWage}
                            onChange={e => setAddForm({ ...addForm, operatorWage: Number(e.target.value) })}
                            className="bg-black border border-white/10 rounded-xl py-2 px-3 text-xs font-mono text-white focus:outline-none text-center"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[7px] font-mono text-white/45 uppercase">SUPERVISOR RATE</span>
                          <input
                            type="number"
                            value={addForm.supervisorWage}
                            onChange={e => setAddForm({ ...addForm, supervisorWage: Number(e.target.value) })}
                            className="bg-black border border-white/10 rounded-xl py-2 px-3 text-xs font-mono text-white focus:outline-none text-center"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[7px] font-mono text-white/45 uppercase">CONTRACTOR RATE</span>
                          <input
                            type="number"
                            value={addForm.contractorWage}
                            onChange={e => setAddForm({ ...addForm, contractorWage: Number(e.target.value) })}
                            className="bg-black border border-white/10 rounded-xl py-2 px-3 text-xs font-mono text-white focus:outline-none text-center"
                          />
                        </div>
                      </div>
                    </div>

                  </div>

                  <div className="flex justify-end gap-3 pt-5 border-t border-white/5 mt-5">
                    <button
                      type="button"
                      onClick={() => setAddStep(4)}
                      className="px-4 py-2 border border-white/10 hover:border-white/20 bg-white/5 rounded-xl text-white/60 hover:text-white text-[10px] font-mono uppercase font-bold tracking-wider cursor-pointer"
                    >
                      Skip Onboarding
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 border border-auris-cyan/35 bg-auris-cyan/10 hover:bg-auris-cyan/20 text-auris-cyan rounded-xl text-[10px] font-mono uppercase font-bold tracking-wider cursor-pointer"
                    >
                      Save Configuration
                    </button>
                  </div>
                </form>
              )}

              {/* STEP 3: Floor plan upload */}
              {addStep === 3 && (
                <div className="space-y-5 text-center py-6">
                  <h4 className="text-[10px] font-mono text-auris-cyan uppercase tracking-widest text-left">
                    STEP 3: CONFIGURATION MATRIX MAPPING & FLOOR PLAN
                  </h4>

                  <div className="border border-dashed border-white/15 bg-black/25 rounded-2xl p-8 flex flex-col items-center justify-center gap-3">
                    <FileUp className="w-8 h-8 text-white/20" />
                    <div>
                      <h5 className="text-[11px] font-mono text-white/80 font-bold uppercase">Upload JSON floor plan scan</h5>
                      <p className="text-[9px] text-white/40 mt-1 max-w-xs leading-relaxed">
                        Attach the parsed scan configuration file (.json) defining physical bounding boxes, cameras mapping, and zone vectors coordinates.
                      </p>
                    </div>

                    <label className="px-4 py-2 border border-auris-cyan/30 bg-auris-cyan/5 text-auris-cyan hover:bg-auris-cyan/15 rounded-xl text-[10px] font-mono uppercase font-bold tracking-wider transition-colors cursor-pointer mt-2 block">
                      Browse Local Files
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleFloorplanUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="flex justify-end gap-3 pt-5 border-t border-white/5 mt-5">
                    <button
                      type="button"
                      onClick={() => {
                        setAddStep(4);
                        fetchClients();
                      }}
                      className="px-5 py-2 border border-auris-cyan/35 bg-auris-cyan/10 hover:bg-auris-cyan/20 text-auris-cyan rounded-xl text-[10px] font-mono uppercase font-bold tracking-wider cursor-pointer"
                    >
                      Skip & Done
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4: Success credentials display */}
              {addStep === 4 && (
                <div className="space-y-5">
                  <div className="text-center py-4 flex flex-col items-center justify-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-2">
                      <Check className="w-5 h-5" />
                    </div>
                    <h4 className="text-xs font-display uppercase tracking-widest text-emerald-400 font-bold">CLIENT PORTAL ONBOARD SYNCED</h4>
                    <p className="text-[9px] text-white/40 max-w-xs mt-1">
                      Personnel credentials and system encryption keys successfully registered to core database cluster.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="p-3 bg-black/30 border border-white/5 rounded-xl flex items-center justify-between text-[10px] font-mono">
                      <div>
                        <span className="text-[7px] text-white/35 uppercase block">CLIENT SYSTEM ID</span>
                        <span className="text-white/80 font-bold select-all">{createdCredentials?.store_id}</span>
                      </div>
                      <button 
                        onClick={() => handleCopy(createdCredentials?.store_id || '', 'System ID')}
                        className="p-1.5 border border-white/10 rounded text-white/50 hover:text-white cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="p-3 bg-black/30 border border-white/5 rounded-xl flex items-center justify-between text-[10px] font-mono">
                      <div>
                        <span className="text-[7px] text-white/35 uppercase block">ENCRYPTION ACCESS KEY (PASSWORD)</span>
                        <span className="text-white/80 font-bold select-all">{createdCredentials?.password}</span>
                      </div>
                      <button 
                        onClick={() => handleCopy(createdCredentials?.password || '', 'Password')}
                        className="p-1.5 border border-white/10 rounded text-white/50 hover:text-white cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="p-3 bg-black/30 border border-white/5 rounded-xl flex items-center justify-between text-[10px] font-mono">
                      <div className="max-w-[85%]">
                        <span className="text-[7px] text-white/35 uppercase block">CLOUD STREAM API KEY (SECRET)</span>
                        <span className="text-auris-cyan font-bold truncate block select-all">{createdCredentials?.api_key}</span>
                      </div>
                      <button 
                        onClick={() => handleCopy(createdCredentials?.api_key || '', 'API Key')}
                        className="p-1.5 border border-white/10 rounded text-white/50 hover:text-white cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-[8px] text-white/30 leading-relaxed font-sans text-center">
                    Copy and deliver these credentials securely. Ensure edge processing devices are configured with the secret API Key for streaming data.
                  </p>

                  <div className="flex justify-center pt-3 border-t border-white/5 mt-5">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddModal(false);
                        fetchClients();
                      }}
                      className="px-6 py-2 bg-auris-cyan text-black font-mono uppercase font-bold text-[10px] tracking-wider rounded-xl hover:bg-auris-cyan/85 cursor-pointer shadow-lg shadow-auris-cyan/15"
                    >
                      Registry Database Synced
                    </button>
                  </div>
                </div>
              )}

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

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 w-full max-w-md p-6 md:p-10 glass rounded-3xl mx-4 md:mx-0">
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
                  placeholder="" 
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
      <nav className="hidden md:flex w-20 border-r border-white/5 flex-col items-center py-8 bg-black/40 backdrop-blur-3xl z-40">
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
      <main className="flex-1 overflow-hidden relative font-sans pb-20 md:pb-0">
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

      {/* Mobile Bottom Tab Bar */}
      <nav className="flex md:hidden fixed bottom-0 left-0 right-0 h-20 z-50 bg-black/90 backdrop-blur-xl border-t border-white/10 overflow-x-auto custom-scrollbar">
        <div className="flex w-full items-center justify-between px-2 py-1 min-w-max">
          <MobileNavButton active={activeTab === 'mission'} onClick={() => setActiveTab('mission')} icon={<Globe />} label="Overwatch" />
          <MobileNavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard />} label="Dashboard" />
          <MobileNavButton active={activeTab === 'mapping'} onClick={() => setActiveTab('mapping')} icon={<Layers />} label="Mapping" />
          <MobileNavButton active={activeTab === 'calibration'} onClick={() => setActiveTab('calibration')} icon={<RotateCw />} label="Calibration" />
          <MobileNavButton active={activeTab === 'report'} onClick={() => setActiveTab('report')} icon={<FileText />} label="Intelligence" />
          <MobileNavButton active={activeTab === 'training'} onClick={() => setActiveTab('training')} icon={<Cpu />} label="Training" />
          <MobileNavButton active={activeTab === 'factory'} onClick={() => setActiveTab('factory')} icon={<LayoutGrid />} label="Factory" />
          <MobileNavButton active={activeTab === 'factory_analytics'} onClick={() => setActiveTab('factory_analytics')} icon={<TrendingUp />} label="Analytics" />
          <MobileNavButton active={activeTab === 'management'} onClick={() => setActiveTab('management')} icon={<Settings />} label="Registry" />
        </div>
      </nav>
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

function MobileNavButton({ active, onClick, icon, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={`min-w-[64px] flex-shrink-0 flex flex-col items-center justify-center py-2 gap-1 transition-colors duration-300 ${active ? 'text-auris-cyan' : 'text-white/30'}`}
    >
      {React.cloneElement(icon, { className: "w-5 h-5" })}
      <span className="text-[9px] font-medium tracking-tight font-display">{label}</span>
    </button>
  );
}
