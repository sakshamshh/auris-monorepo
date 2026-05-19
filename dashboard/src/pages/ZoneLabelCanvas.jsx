import { useState, useRef, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "https://auris.skymlabs.com";

const ZONE_TYPES = ["WORK_STATION", "TRANSIT", "IDLE_ZONE"];
const WORKER_CATEGORIES = ["Operator", "Supervisor", "Contractor"];
const ZONE_COLORS = {
  WORK_STATION: "#2563EB",
  TRANSIT:      "#CA8A04",
  IDLE_ZONE:    "#9CA3AF",
  UNLABELED:    "#E5E7EB",
};

const defaultModal = {
  open: false, zoneId: null, label: "", type: "WORK_STATION",
  shiftId: "shift_1", expectedHeadcount: "", workerCategory: "Operator", downstreamZoneId: "",
};

export default function ZoneLabelCanvas({ storeId, floorPlanSvg, zones: initialZones = [], shifts = [] }) {
  const [zones, setZones]         = useState(initialZones);
  const [modal, setModal]         = useState(defaultModal);
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState("");
  const [markingLive, setMarkingLive]   = useState(false);
  const [liveError, setLiveError]       = useState("");
  const [liveSuccess, setLiveSuccess]   = useState(false);
  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current) return;
    const els = svgRef.current.querySelectorAll("[data-zone-id]");
    els.forEach((el) => {
      el.style.cursor = "pointer";
      const zid = el.getAttribute("data-zone-id");
      const ex  = zones.find((z) => z.zone_id === zid);
      el.style.fill        = ex ? ZONE_COLORS[ex.zone_type] : ZONE_COLORS.UNLABELED;
      el.style.fillOpacity = "0.35";
      el.style.stroke      = ex ? ZONE_COLORS[ex.zone_type] : "#D1D5DB";
      el.style.strokeWidth = "2";
      el.onclick = () => {
        const existing = zones.find((z) => z.zone_id === zid);
        setModal({
          open: true, zoneId: zid,
          label:             existing?.zone_label      || "",
          type:              existing?.zone_type       || "WORK_STATION",
          shiftId:           existing?.shift_id        || (shifts[0]?.shift_id || "shift_1"),
          expectedHeadcount: existing?.expected_headcount || "",
          workerCategory:    existing?.worker_category || "Operator",
          downstreamZoneId:  existing?.downstream_zone_id || "",
        });
      };
    });
  }, [zones, floorPlanSvg]);

  const closeModal = () => { setModal(defaultModal); setSaveError(""); };

  const validateModal = () => {
    if (!modal.label.trim()) return "Zone name is required.";
    if (modal.type === "WORK_STATION" && (!modal.expectedHeadcount || Number(modal.expectedHeadcount) <= 0))
      return "Expected headcount is required for work stations.";
    return "";
  };

  const handleSaveZone = async () => {
    const err = validateModal();
    if (err) { setSaveError(err); return; }
    setSaving(true); setSaveError("");
    const payload = {
      store_id: storeId, zone_id: modal.zoneId, zone_label: modal.label,
      zone_type: modal.type, shift_id: modal.shiftId,
      expected_headcount: modal.type === "WORK_STATION" ? Number(modal.expectedHeadcount) : 0,
      worker_category: modal.workerCategory,
      downstream_zone_id: modal.downstreamZoneId || null, active: true,
    };
    try {
      const res = await fetch(`${API_BASE}/api/factory/zones`, {
        method: "POST",
        headers: { "X-Admin-Key": "dcd62cb40e5fa0870d73c79fbd521d05", "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { setSaveError("Failed to save zone. Try again."); return; }
      setZones((prev) => {
        const i = prev.findIndex((z) => z.zone_id === modal.zoneId);
        if (i >= 0) { const u = [...prev]; u[i] = payload; return u; }
        return [...prev, payload];
      });
      closeModal();
    } catch { setSaveError("Failed to save zone. Check connection."); }
    finally { setSaving(false); }
  };

  const canGoLive = () => {
    const ws = zones.filter((z) => z.zone_type === "WORK_STATION");
    return ws.length > 0 && ws.every((z) => z.expected_headcount > 0);
  };

  const handleMarkLive = async () => {
    if (!canGoLive()) { setLiveError("All work stations need a headcount before going live."); return; }
    setMarkingLive(true); setLiveError("");
    try {
      const res = await fetch(`${API_BASE}/api/factory/config`, {
        method: "PATCH",
        headers: { "X-Admin-Key": "dcd62cb40e5fa0870d73c79fbd521d05", "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: storeId, status: "live" }),
      });
      if (!res.ok) { setLiveError("Failed to mark factory live. Try again."); return; }
      setLiveSuccess(true);
    } catch { setLiveError("Failed to mark factory live. Check connection."); }
    finally { setMarkingLive(false); }
  };

  const ws = zones.filter((z) => z.zone_type === "WORK_STATION");
  const tr = zones.filter((z) => z.zone_type === "TRANSIT");
  const iz = zones.filter((z) => z.zone_type === "IDLE_ZONE");

  const inputCls = "w-full px-3 py-2.5 border border-[#E5E7EB] rounded-[8px] focus:ring-2 focus:ring-[#2563EB] focus:border-[#2563EB] outline-none transition-all bg-white text-sm";
  const labelCls = "block text-sm font-medium text-[#374151] mb-1";

  return (
    <div className="bg-[#F9FAFB] min-h-screen" style={{ fontFamily: 'system-ui,-apple-system,"Segoe UI",sans-serif' }}>

      <div className="bg-white border-b border-[#E5E7EB] px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[#111827]">Zone Label Canvas</h1>
          <p className="text-sm text-[#6B7280] mt-0.5">Click any zone on the floor plan to label it</p>
        </div>
        {liveSuccess ? (
          <span className="px-4 py-2 rounded-[8px] bg-[#DCFCE7] text-[#16A34A] text-sm font-semibold">● Factory is LIVE</span>
        ) : (
          <button onClick={handleMarkLive} disabled={markingLive || !canGoLive()}
            className="bg-[#1A3C5E] text-white px-5 py-2.5 rounded-[8px] text-sm font-medium hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            {markingLive ? "Going live..." : "Mark Factory LIVE ▶"}
          </button>
        )}
      </div>

      {liveError && <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-[8px] text-sm">{liveError}</div>}

      <div className="flex gap-6 p-6">

        <div className="flex-1 bg-white border border-[#E5E7EB] rounded-[12px] overflow-hidden">
          {floorPlanSvg ? (
            <div ref={svgRef} className="w-full h-full" dangerouslySetInnerHTML={{ __html: floorPlanSvg }} />
          ) : (
            <div className="relative w-full" style={{ minHeight: 480 }}>
              <svg ref={svgRef} viewBox="0 0 800 500" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <rect width="800" height="500" fill="#F9FAFB" />
                <rect data-zone-id="zone_assembly_1" x="40"  y="40"  width="160" height="120" rx="6" />
                <text x="120" y="107" textAnchor="middle" fontSize="12" fill="#6B7280" pointerEvents="none">Assembly 1</text>
                <rect data-zone-id="zone_assembly_2" x="220" y="40"  width="160" height="120" rx="6" />
                <text x="300" y="107" textAnchor="middle" fontSize="12" fill="#6B7280" pointerEvents="none">Assembly 2</text>
                <rect data-zone-id="zone_welding_4"  x="400" y="40"  width="160" height="120" rx="6" />
                <text x="480" y="107" textAnchor="middle" fontSize="12" fill="#6B7280" pointerEvents="none">Welding St. 4</text>
                <rect data-zone-id="zone_painting"   x="580" y="40"  width="180" height="120" rx="6" />
                <text x="670" y="107" textAnchor="middle" fontSize="12" fill="#6B7280" pointerEvents="none">Painting Zone</text>
                <rect data-zone-id="zone_transit"    x="40"  y="200" width="720" height="80"  rx="6" />
                <text x="400" y="248" textAnchor="middle" fontSize="12" fill="#6B7280" pointerEvents="none">Transit Corridor</text>
                <rect data-zone-id="zone_break"      x="40"  y="320" width="340" height="140" rx="6" />
                <text x="210" y="398" textAnchor="middle" fontSize="12" fill="#6B7280" pointerEvents="none">Break Room</text>
                <rect data-zone-id="zone_storage"    x="420" y="320" width="340" height="140" rx="6" />
                <text x="590" y="398" textAnchor="middle" fontSize="12" fill="#6B7280" pointerEvents="none">Storage Area</text>
              </svg>
              <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-[#9CA3AF]">Demo floor plan — click any zone to label it</p>
            </div>
          )}
        </div>

        <div className="w-60 flex-shrink-0 space-y-4">
          <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-4">
            <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-3">Legend</p>
            {[["WORK_STATION","#2563EB"],["TRANSIT","#CA8A04"],["IDLE_ZONE","#9CA3AF"],["UNLABELED","#E5E7EB"]].map(([t,c]) => (
              <div key={t} className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full flex-shrink-0 border border-[#E5E7EB]" style={{ background: c }} />
                <span className="text-xs text-[#374151]">{t.replace("_"," ")}</span>
              </div>
            ))}
          </div>

          <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-4 space-y-3">
            <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">Zones</p>
            {[["Work Stations",ws.length,"#2563EB"],["Transit",tr.length,"#CA8A04"],["Idle Zones",iz.length,"#9CA3AF"]].map(([l,c,col]) => (
              <div key={l} className="flex items-center justify-between">
                <span className="text-sm text-[#374151]">{l}</span>
                <span className="text-sm font-semibold" style={{ color: col }}>{c}</span>
              </div>
            ))}
          </div>

          {zones.length > 0 && (
            <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-4">
              <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-3">Labeled</p>
              <div className="space-y-2">
                {zones.map((z) => (
                  <div key={z.zone_id} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ZONE_COLORS[z.zone_type] }} />
                    <span className="text-xs text-[#374151] truncate">{z.zone_label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {modal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[12px] border border-[#E5E7EB] w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-[#111827]">Label Zone</h2>
              <button onClick={closeModal} className="text-[#9CA3AF] hover:text-[#374151] text-xl">✕</button>
            </div>

            {saveError && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-[8px] text-sm">{saveError}</div>}

            <div className="space-y-4">
              <div>
                <label className={labelCls}>Zone Name</label>
                <input type="text" value={modal.label} onChange={(e) => setModal((m) => ({ ...m, label: e.target.value }))}
                  placeholder="Assembly Line 1" className={inputCls} />
              </div>

              <div>
                <label className={labelCls}>Zone Type</label>
                <div className="flex gap-2 flex-wrap">
                  {ZONE_TYPES.map((t) => (
                    <button key={t} type="button" onClick={() => setModal((m) => ({ ...m, type: t }))}
                      className={`px-3 py-1.5 rounded-[6px] text-xs font-medium border transition-all
                        ${modal.type === t ? "border-[#2563EB] bg-[#DBEAFE] text-[#2563EB]" : "border-[#E5E7EB] text-[#6B7280] hover:border-[#9CA3AF]"}`}>
                      {t.replace("_"," ")}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelCls}>Shift</label>
                <select value={modal.shiftId} onChange={(e) => setModal((m) => ({ ...m, shiftId: e.target.value }))} className={inputCls}>
                  {shifts.length > 0
                    ? shifts.map((s) => <option key={s.shift_id} value={s.shift_id}>{s.label}</option>)
                    : <option value="shift_1">Shift 1</option>}
                </select>
              </div>

              {modal.type === "WORK_STATION" && (
                <>
                  <div>
                    <label className={labelCls}>Expected Headcount</label>
                    <input type="number" min="1" value={modal.expectedHeadcount}
                      onChange={(e) => setModal((m) => ({ ...m, expectedHeadcount: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Worker Category</label>
                    <select value={modal.workerCategory} onChange={(e) => setModal((m) => ({ ...m, workerCategory: e.target.value }))} className={inputCls}>
                      {WORKER_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Downstream Zone <span className="text-[#9CA3AF] font-normal">(optional)</span></label>
                    <select value={modal.downstreamZoneId} onChange={(e) => setModal((m) => ({ ...m, downstreamZoneId: e.target.value }))} className={inputCls}>
                      <option value="">— None —</option>
                      {zones.filter((z) => z.zone_id !== modal.zoneId && z.zone_type === "WORK_STATION").map((z) => (
                        <option key={z.zone_id} value={z.zone_id}>{z.zone_label}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={closeModal} className="flex-1 border border-[#E5E7EB] text-[#374151] rounded-[8px] py-2.5 text-sm font-medium hover:bg-[#F9FAFB] transition-all">
                Cancel
              </button>
              <button onClick={handleSaveZone} disabled={saving}
                className="flex-1 bg-[#1A3C5E] text-white rounded-[8px] py-2.5 text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? "Saving..." : "Save Zone"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
