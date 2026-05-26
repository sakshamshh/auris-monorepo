import { useState, useEffect } from "react";

const IS_DEV = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const API_BASE = import.meta.env.VITE_API_URL || (IS_DEV ? 'http://localhost:8000' : 'https://auris.skymlabs.com');

const safeFetchJson = async (url, options, defaultFallback) => {
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      console.warn(`safeFetchJson: ${url} returned status ${res.status}`);
      return defaultFallback;
    }
    const text = await res.text();
    if (!text || text.trim() === "") {
      return defaultFallback;
    }
    const data = JSON.parse(text);
    return data || defaultFallback;
  } catch (err) {
    console.error(`safeFetchJson error for ${url}:`, err);
    return defaultFallback;
  }
};

const fmt = (n) => n?.toLocaleString("en-IN") ?? "—";
const fmtRs = (n) => n != null ? `₹${fmt(Math.round(n))}` : "—";
const fmtHrs = (n) => n != null ? `${parseFloat(n).toFixed(1)} hrs` : "—";

const TABS = ["Dead Time", "Bottleneck", "Patterns"];

const Badge = ({ children, color }) => {
  const colors = {
    red:    "bg-red-50 text-red-600 border-red-200",
    blue:   "bg-blue-50 text-blue-600 border-blue-200",
    green:  "bg-green-50 text-green-600 border-green-200",
    amber:  "bg-amber-50 text-amber-600 border-amber-200",
    gray:   "bg-gray-50 text-gray-500 border-gray-200",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[color] || colors.gray}`}>
      {children}
    </span>
  );
};

const StatCard = ({ label, value, sub, valueColor }) => (
  <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-5">
    <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wide mb-2">{label}</p>
    <p className={`text-3xl font-semibold ${valueColor || "text-[#111827]"}`}>{value}</p>
    {sub && <p className="text-xs text-[#9CA3AF] mt-1">{sub}</p>}
  </div>
);

const Narrative = ({ text }) => {
  if (!text) return null;
  return (
    <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[12px] p-5 mt-4">
      <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-2">AI Summary</p>
      <p className="text-sm text-[#374151] leading-relaxed">{text}</p>
    </div>
  );
};

const EmptyState = () => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="w-12 h-12 rounded-full bg-[#F3F4F6] flex items-center justify-center mb-4">
      <span className="text-2xl">📊</span>
    </div>
    <p className="text-sm font-semibold text-[#374151]">No data yet — check back after Day 3</p>
  </div>
);

const Loading = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-6 h-6 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin" />
  </div>
);

// ── DEAD TIME TAB ──────────────────────────────────────────────────────────
function DeadTimeView({ storeId, password, trialDay }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const resData = await safeFetchJson(
        `${API_BASE}/api/factory/deadtime`,
        { headers: { "X-Store-ID": storeId, "X-Password": password } },
        { summary: null, by_zone: [], worst_zone: "", worst_day: "", narrative: "" }
      );
      setData(resData);
      setLoading(false);
    })();
  }, [storeId, password]);

  if (loading) return <Loading />;
  if (!data || !data.summary) return <EmptyState days={trialDay} />;

  const { summary, by_zone = [], worst_zone, worst_day, narrative } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Paid Hours"        value={fmtHrs(summary.expected_hours_total)}   />
        <StatCard label="Productive Hours"  value={fmtHrs(summary.productive_hours_total)} valueColor="text-[#16A34A]" />
        <StatCard label="Dead Hours"        value={fmtHrs(summary.dead_hours_total)}       valueColor="text-[#DC2626]" />
        <StatCard label="Cost This Month"   value={fmtRs(summary.dead_cost_inr)}           valueColor="text-[#DC2626]" sub="money lost" />
      </div>

      {worst_zone && (
        <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wide mb-1">Worst Zone</p>
            <p className="text-base font-semibold text-[#111827]">{worst_zone}</p>
            {worst_day && <p className="text-xs text-[#9CA3AF] mt-0.5">Worst day: {worst_day}</p>}
          </div>
          <Badge color="red">Most Dead Time</Badge>
        </div>
      )}

      {by_zone.length > 0 && (
        <div className="bg-white border border-[#E5E7EB] rounded-[12px] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E7EB]">
            <p className="text-sm font-semibold text-[#111827]">By Zone</p>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
                {["Zone", "Dead Hours", "Productive Hours", "Cost"].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium text-[#6B7280] uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {by_zone.map((z, i) => (
                <tr key={z.zone_id} className={i % 2 === 0 ? "bg-white" : "bg-[#F9FAFB]"}>
                  <td className="px-5 py-3 text-sm font-medium text-[#111827]">{z.zone_label || z.zone_id}</td>
                  <td className="px-5 py-3 text-sm text-[#DC2626]">{fmtHrs(z.dead_hours)}</td>
                  <td className="px-5 py-3 text-sm text-[#16A34A]">{fmtHrs(z.productive_hours)}</td>
                  <td className="px-5 py-3 text-sm text-[#DC2626] font-medium">{fmtRs(z.dead_cost_inr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Narrative text={narrative} />
    </div>
  );
}

// ── BOTTLENECK TAB ─────────────────────────────────────────────────────────
function BottleneckView({ storeId, password, trialDay }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const resData = await safeFetchJson(
        `${API_BASE}/api/factory/bottleneck`,
        { headers: { "X-Store-ID": storeId, "X-Password": password } },
        { ranked_stations: [], narrative: "" }
      );
      setData(resData);
      setLoading(false);
    })();
  }, [storeId, password]);

  if (loading) return <Loading />;

  if (!data || data.cached === false) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-12 h-12 rounded-full bg-[#FEF9C3] flex items-center justify-center mb-4">
        <span className="text-2xl">⏳</span>
      </div>
      <p className="text-sm font-medium text-[#374151]">Cache building</p>
      <p className="text-xs text-[#9CA3AF] mt-1">Bottleneck data available after first nightly run</p>
    </div>
  );

  const { ranked_stations = [], narrative } = data;

  if (ranked_stations.length === 0) return <EmptyState days={trialDay} />;

  const top = ranked_stations[0];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard label="Top Bottleneck"   value={top.zone_label || top.zone_id}         />
        <StatCard label="Total Cost"        value={fmtRs(top.total_cost_inr)}             valueColor="text-[#DC2626]" />
        <StatCard label="Fix This → Gain"   value={`+${top.projected_gain_pct ?? 0}%`}   valueColor="text-[#16A34A]" sub="output increase" />
      </div>

      <div className="bg-white border border-[#E5E7EB] rounded-[12px] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E5E7EB]">
          <p className="text-sm font-semibold text-[#111827]">Ranked Stations</p>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
              {["Station", "Events", "Avg Duration", "Cascade Idle", "Cost", "Gain"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#6B7280] uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ranked_stations.map((s, i) => (
              <tr key={s.zone_id} className={i % 2 === 0 ? "bg-white" : "bg-[#F9FAFB]"}>
                <td className="px-4 py-3 text-sm font-medium text-[#111827]">
                  {i === 0 && <span className="mr-1.5">🔴</span>}
                  {s.zone_label || s.zone_id}
                </td>
                <td className="px-4 py-3 text-sm text-[#374151]">{s.event_count}</td>
                <td className="px-4 py-3 text-sm text-[#374151]">{s.avg_duration_minutes?.toFixed(0)} min</td>
                <td className="px-4 py-3 text-sm text-[#374151]">{fmtHrs(s.total_cascade_idle_hours)}</td>
                <td className="px-4 py-3 text-sm text-[#DC2626] font-medium">{fmtRs(s.total_cost_inr)}</td>
                <td className="px-4 py-3 text-sm text-[#16A34A] font-medium">
                  {s.projected_gain_pct ? `+${s.projected_gain_pct}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Narrative text={narrative} />
    </div>
  );
}

// ── PATTERNS TAB ───────────────────────────────────────────────────────────
function PatternsView({ storeId, password, trialDay }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const resData = await safeFetchJson(
        `${API_BASE}/api/factory/patterns`,
        { headers: { "X-Store-ID": storeId, "X-Password": password } },
        { patterns: [], narrative: "" }
      );
      setData(resData);
      setLoading(false);
    })();
  }, [storeId, password]);

  if (loading) return <Loading />;
  if (!data || !data.patterns?.length) return <EmptyState days={trialDay} />;

  const { patterns = [], narrative } = data;
  const totalCost = patterns.reduce((s, p) => s + (p.monthly_cost_inr || 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard label="Patterns Found"     value={patterns.length}      />
        <StatCard label="Total Monthly Cost"  value={fmtRs(totalCost)}    valueColor="text-[#DC2626]" />
        <StatCard label="Most Expensive"      value={fmtRs(patterns[0]?.monthly_cost_inr)} valueColor="text-[#DC2626]" sub={patterns[0]?.zone_label} />
      </div>

      <div className="space-y-3">
        {patterns.map((p, i) => (
          <div key={`${p.zone_id}-${p.hour_slot}`} className="bg-white border border-[#E5E7EB] rounded-[12px] p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold text-[#111827]">{p.zone_label || p.zone_id}</p>
                  {i === 0 && <Badge color="red">Highest Cost</Badge>}
                </div>
                <p className="text-xs text-[#6B7280]">
                  Every day {p.hour_label} · {p.recurrence_count} of last 30 days
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-lg font-semibold text-[#DC2626]">{fmtRs(p.monthly_cost_inr)}</p>
                <p className="text-xs text-[#9CA3AF]">per month</p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-[#E5E7EB] flex gap-6">
              <div>
                <p className="text-xs text-[#9CA3AF]">Avg lost</p>
                <p className="text-sm font-medium text-[#374151]">{fmtHrs(p.avg_lost_hours)} / day</p>
              </div>
              <div>
                <p className="text-xs text-[#9CA3AF]">Confidence</p>
                <p className="text-sm font-medium text-[#374151]">{Math.round((p.confidence || 0) * 100)}%</p>
              </div>
              <div>
                <p className="text-xs text-[#9CA3AF]">First seen</p>
                <p className="text-sm font-medium text-[#374151]">{p.first_seen ? new Date(p.first_seen).toLocaleDateString("en-IN") : "—"}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Narrative text={narrative} />
    </div>
  );
}

// ── MAIN DASHBOARD ─────────────────────────────────────────────────────────
export default function FactoryDashboard({ storeId, password, factoryName, trialDay = 1 }) {
  const [activeTab, setActiveTab] = useState(0);

  const trialPct = Math.min((trialDay / 30) * 100, 100);

  return (
    <div className="bg-[#F9FAFB] min-h-screen" style={{ fontFamily: 'system-ui,-apple-system,"Segoe UI",sans-serif' }}>

      {/* Top bar */}
      <div className="bg-white border-b border-[#E5E7EB] px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold text-[#111827]">{factoryName || "Factory Dashboard"}</h1>
            <p className="text-xs text-[#6B7280] mt-0.5">Trial Day {trialDay} of 30</p>
          </div>
          <Badge color={trialDay >= 7 ? "green" : "amber"}>
            {trialDay >= 7 ? "● Live Data" : `Day ${trialDay} — Building`}
          </Badge>
        </div>
        {/* Trial progress bar */}
        <div className="w-full bg-[#F3F4F6] rounded-full h-1.5">
          <div className="bg-[#1A3C5E] h-1.5 rounded-full transition-all" style={{ width: `${trialPct}%` }} />
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-[#E5E7EB] px-6">
        <div className="flex gap-0">
          {TABS.map((tab, i) => (
            <button key={tab} onClick={() => setActiveTab(i)}
              className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-all
                ${activeTab === i
                  ? "border-[#1A3C5E] text-[#1A3C5E]"
                  : "border-transparent text-[#6B7280] hover:text-[#374151]"}`}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === 0 && <DeadTimeView  storeId={storeId} password={password} trialDay={trialDay} />}
        {activeTab === 1 && <BottleneckView storeId={storeId} password={password} trialDay={trialDay} />}
        {activeTab === 2 && <PatternsView  storeId={storeId} password={password} trialDay={trialDay} />}
      </div>

    </div>
  );
}
