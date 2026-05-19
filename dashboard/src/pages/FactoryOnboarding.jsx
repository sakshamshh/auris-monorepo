import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "https://auris.skymlabs.com";

const defaultShift = () => ({
  label: "",
  startTime: "",
  endTime: "",
  days: { Mon: false, Tue: false, Wed: false, Thu: false, Fri: false, Sat: false, Sun: false },
});

const defaultForm = {
  factoryName: "",
  city: "",
  numShifts: 1,
  shifts: [defaultShift()],
  totalHeadcount: "",
  operatorWage: "",
  supervisorWage: "",
  contractorWage: "",
  floorPlan: null,
  floorPlanName: "",
  whatsAppNumber: "",
};

const STEP_NAMES = [
  "Factory Details",
  "Shift Schedule",
  "Workforce & Wages",
  "Floor Plan Upload",
  "WhatsApp & Submit",
];

export default function FactoryOnboarding({ onSubmit }) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState(defaultForm);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError("");
  };

  const handleNumShiftsChange = (e) => {
    const count = parseInt(e.target.value, 10) || 1;
    setFormData((prev) => {
      const shifts = [...prev.shifts];
      while (shifts.length < count) shifts.push(defaultShift());
      shifts.splice(count);
      return { ...prev, numShifts: count, shifts };
    });
    setError("");
  };

  const handleShiftChange = (i, field, value) => {
    setFormData((prev) => {
      const shifts = prev.shifts.map((s, idx) => idx === i ? { ...s, [field]: value } : s);
      return { ...prev, shifts };
    });
    setError("");
  };

  const handleDayToggle = (i, day) => {
    setFormData((prev) => {
      const shifts = prev.shifts.map((s, idx) =>
        idx === i ? { ...s, days: { ...s.days, [day]: !s.days[day] } } : s
      );
      return { ...prev, shifts };
    });
    setError("");
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) {
      setError("Only .json files are accepted.");
      return;
    }
    setFormData((prev) => ({ ...prev, floorPlan: file, floorPlanName: file.name }));
    setError("");
  };

  const validate = () => {
    if (step === 1) {
      if (!formData.factoryName.trim()) return "Factory Name is required.";
      if (!formData.city.trim()) return "City is required.";
    }
    if (step === 2) {
      for (let i = 0; i < formData.shifts.length; i++) {
        const s = formData.shifts[i];
        if (!s.label.trim()) return `Shift ${i + 1} label is required.`;
        if (!s.startTime) return `Shift ${i + 1} start time is required.`;
        if (!s.endTime) return `Shift ${i + 1} end time is required.`;
        if (!Object.values(s.days).some(Boolean)) return `Select at least one day for Shift ${i + 1}.`;
      }
    }
    if (step === 3) {
      if (!formData.totalHeadcount || Number(formData.totalHeadcount) <= 0) return "Total headcount must be a positive number.";
      if (!formData.operatorWage || Number(formData.operatorWage) <= 0) return "Operator wage is required.";
      if (!formData.supervisorWage || Number(formData.supervisorWage) <= 0) return "Supervisor wage is required.";
      if (!formData.contractorWage || Number(formData.contractorWage) <= 0) return "Contractor wage is required.";
    }
    if (step === 4) {
      if (!formData.floorPlanName) return "Please upload your Polycam LiDAR JSON file.";
    }
    if (step === 5) {
      if (!formData.whatsAppNumber.trim()) return "WhatsApp number is required.";
    }
    return "";
  };

  const handleNext = () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError("");
    setStep((s) => s + 1);
  };

  const handleBack = () => {
    setError("");
    setStep((s) => s - 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setError("");
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/factory/onboard`, {
        method: "POST",
        headers: {
          "X-Admin-Key": "dcd62cb40e5fa0870d73c79fbd521d05",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          floorPlan: undefined,
        }),
      });
      if (!res.ok) {
        setError("Submission failed. Check connection and try again.");
        return;
      }
      if (onSubmit) onSubmit(formData);
    } catch {
      setError("Submission failed. Check connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputCls = "w-full px-4 py-3 border border-[#E5E7EB] rounded-[8px] focus:ring-2 focus:ring-[#2563EB] focus:border-[#2563EB] outline-none transition-all bg-white text-sm";
  const btnPrimary = "bg-[#1A3C5E] text-white rounded-[8px] px-6 py-3 font-medium hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed";
  const btnGhost = "border border-[#E5E7EB] text-[#374151] rounded-[8px] px-6 py-3 font-medium hover:bg-[#F9FAFB] transition-all";

  return (
    <div className="bg-[#F9FAFB] min-h-screen py-12 px-4 flex flex-col items-center" style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' }}>
      <div className="w-full max-w-2xl bg-white border border-[#E5E7EB] rounded-[12px] p-8">

        {/* Progress */}
        <div className="flex items-center justify-between mb-10 relative">
          <div className="absolute h-[2px] bg-[#E5E7EB] left-0 right-0 top-5 z-0" />
          {STEP_NAMES.map((_, idx) => {
            const n = idx + 1;
            const done = n < step;
            const active = n === step;
            return (
              <div key={n} className="flex flex-col items-center z-10">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all
                  ${done ? "bg-[#1A3C5E] text-white" : active ? "border-2 border-[#2563EB] text-[#2563EB] bg-white" : "border-2 border-[#E5E7EB] text-[#9CA3AF] bg-white"}`}>
                  {done ? "✓" : n}
                </div>
              </div>
            );
          })}
        </div>

        {/* Heading */}
        <div className="mb-6 text-center">
          <h2 className="text-xl font-bold text-[#111827]">
            Step {step} of 5: {STEP_NAMES[step - 1]}
          </h2>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-5 p-4 border border-red-200 bg-red-50 text-red-700 rounded-[8px] text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>

          {/* STEP 1 */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1">Factory Name</label>
                <input name="factoryName" type="text" value={formData.factoryName} onChange={handleInputChange}
                  placeholder="Sharma Fabrication Works" className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1">City</label>
                <input name="city" type="text" value={formData.city} onChange={handleInputChange}
                  placeholder="Faridabad, Haryana" className={inputCls} />
              </div>
              <div className="flex justify-end pt-2">
                <button type="button" onClick={handleNext} className={btnPrimary}>Next →</button>
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1">Number of Shifts</label>
                <select value={formData.numShifts} onChange={handleNumShiftsChange}
                  className={inputCls}>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </div>
              {formData.shifts.map((shift, i) => (
                <div key={i} className="border border-[#E5E7EB] rounded-[8px] p-5 bg-[#F9FAFB] space-y-4">
                  <p className="text-sm font-semibold text-[#1A3C5E]">Shift {i + 1}</p>
                  <div>
                    <label className="block text-xs font-medium text-[#6B7280] mb-1">Label</label>
                    <input type="text" value={shift.label} onChange={(e) => handleShiftChange(i, "label", e.target.value)}
                      placeholder="Morning" className={inputCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[#6B7280] mb-1">Start Time</label>
                      <input type="time" value={shift.startTime} onChange={(e) => handleShiftChange(i, "startTime", e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#6B7280] mb-1">End Time</label>
                      <input type="time" value={shift.endTime} onChange={(e) => handleShiftChange(i, "endTime", e.target.value)} className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#6B7280] mb-2">Days</label>
                    <div className="flex flex-wrap gap-3">
                      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                        <label key={day} className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" checked={shift.days[day]} onChange={() => handleDayToggle(i, day)}
                            className="w-4 h-4 rounded border-[#E5E7EB] text-[#2563EB] focus:ring-[#2563EB]" />
                          <span className="text-xs text-[#374151]">{day}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex justify-between pt-2">
                <button type="button" onClick={handleBack} className={btnGhost}>← Back</button>
                <button type="button" onClick={handleNext} className={btnPrimary}>Next →</button>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="space-y-5">
              {[
                { label: "Total Headcount", name: "totalHeadcount" },
                { label: "Operator Daily Wage (₹)", name: "operatorWage" },
                { label: "Supervisor Daily Wage (₹)", name: "supervisorWage" },
                { label: "Contractor Daily Wage (₹)", name: "contractorWage" },
              ].map(({ label, name }) => (
                <div key={name}>
                  <label className="block text-sm font-medium text-[#374151] mb-1">{label}</label>
                  <input type="number" name={name} min="0" value={formData[name]} onChange={handleInputChange} className={inputCls} />
                </div>
              ))}
              <div className="flex justify-between pt-2">
                <button type="button" onClick={handleBack} className={btnGhost}>← Back</button>
                <button type="button" onClick={handleNext} className={btnPrimary}>Next →</button>
              </div>
            </div>
          )}

          {/* STEP 4 */}
          {step === 4 && (
            <div className="space-y-5">
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-[#E5E7EB] rounded-[12px] p-10 cursor-pointer bg-[#F9FAFB] hover:bg-gray-50 transition-colors text-center">
                <input type="file" accept=".json" onChange={handleFileChange} className="hidden" />
                <svg className="w-10 h-10 text-[#9CA3AF] mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span className="text-sm font-semibold text-[#374151]">Upload Polycam LiDAR JSON</span>
                <span className="text-xs text-[#9CA3AF] mt-1">Only .json files accepted</span>
              </label>
              {formData.floorPlanName && (
                <div className="flex items-center justify-between p-4 bg-[#F9FAFB] border border-[#E5E7EB] rounded-[8px] text-sm">
                  <span className="text-[#374151] font-medium">{formData.floorPlanName}</span>
                  <button type="button" onClick={() => setFormData((p) => ({ ...p, floorPlan: null, floorPlanName: "" }))}
                    className="text-red-500 hover:text-red-700 font-medium">Remove</button>
                </div>
              )}
              <div className="flex justify-between pt-2">
                <button type="button" onClick={handleBack} className={btnGhost}>← Back</button>
                <button type="button" onClick={handleNext} className={btnPrimary}>Next →</button>
              </div>
            </div>
          )}

          {/* STEP 5 */}
          {step === 5 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1">WhatsApp Number</label>
                <input name="whatsAppNumber" type="text" value={formData.whatsAppNumber} onChange={handleInputChange}
                  placeholder="+91 98765 43210" className={inputCls} />
              </div>
              <div className="pt-2 space-y-3">
                <button type="submit" disabled={isSubmitting} className={`w-full ${btnPrimary}`}>
                  {isSubmitting ? "Submitting..." : "Submit Factory"}
                </button>
                <button type="button" onClick={handleBack} className={`w-full ${btnGhost}`}>← Back</button>
              </div>
            </div>
          )}

        </form>
      </div>
    </div>
  );
}
