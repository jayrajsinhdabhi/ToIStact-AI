import React, { useState, useMemo } from 'react';
import { Info, AlertTriangle, CheckCircle, Move, RotateCcw, Ruler, BookOpen, ChevronDown } from 'lucide-react';

type AssemblyType = 'FLOATING' | 'FIXED';
type Unit = 'MM' | 'INCH';

interface PartDimension {
  nominal: number;
  tolPlus: number;
  tolMinus: number;
  tpSpec: number; // True Position Tolerance defined in drawing
}

const HOLE_SCENARIOS = [
  {
    id: 'm6_float',
    name: 'M6 Floating Fastener (Metric)',
    unit: 'MM',
    mode: 'FLOATING',
    pin: { nominal: 6.00, tolPlus: 0.00, tolMinus: 0.10, tpSpec: 0 },
    hole1: { nominal: 6.60, tolPlus: 0.20, tolMinus: 0.00, tpSpec: 0.50 },
    hole2: { nominal: 6.60, tolPlus: 0.20, tolMinus: 0.00, tpSpec: 0.50 }
  },
  {
    id: 'm8_fixed',
    name: 'M8 Fixed/Threaded (Metric)',
    unit: 'MM',
    mode: 'FIXED',
    pin: { nominal: 8.00, tolPlus: 0.00, tolMinus: 0.15, tpSpec: 0 },
    hole1: { nominal: 9.00, tolPlus: 0.25, tolMinus: 0.00, tpSpec: 0.40 },
    hole2: { nominal: 8.00, tolPlus: 0.00, tolMinus: 0.00, tpSpec: 0.40 } // Nominal thread
  },
  {
    id: 'quarter_inch',
    name: '1/4-20 Bolt (Inch)',
    unit: 'INCH',
    mode: 'FLOATING',
    pin: { nominal: 0.250, tolPlus: 0.000, tolMinus: 0.005, tpSpec: 0 },
    hole1: { nominal: 0.266, tolPlus: 0.010, tolMinus: 0.000, tpSpec: 0.015 },
    hole2: { nominal: 0.266, tolPlus: 0.010, tolMinus: 0.000, tpSpec: 0.015 }
  }
];

const DEFAULT_STATE = {
  mode: 'FLOATING' as AssemblyType,
  pin: { nominal: 6.00, tolPlus: 0.00, tolMinus: 0.1, tpSpec: 0 },
  hole1: { nominal: 6.60, tolPlus: 0.2, tolMinus: 0.0, tpSpec: 0.5 },
  hole2: { nominal: 6.60, tolPlus: 0.2, tolMinus: 0.0, tpSpec: 0.5 },
  deviation: { x: 0.1, y: 0.1 }
};

export const HoleFitCalculator: React.FC = () => {
  const [unit, setUnit] = useState<Unit>('MM');
  const [mode, setMode] = useState<AssemblyType>(DEFAULT_STATE.mode);
  
  const [pin, setPin] = useState<PartDimension>(DEFAULT_STATE.pin);
  const [hole1, setHole1] = useState<PartDimension>(DEFAULT_STATE.hole1);
  const [hole2, setHole2] = useState<PartDimension>(DEFAULT_STATE.hole2);
  
  // Misalignment Simulation
  const [deviation, setDeviation] = useState(DEFAULT_STATE.deviation);

  // --- Actions ---

  const handleReset = () => {
    setUnit('MM');
    setMode(DEFAULT_STATE.mode);
    setPin(DEFAULT_STATE.pin);
    setHole1(DEFAULT_STATE.hole1);
    setHole2(DEFAULT_STATE.hole2);
    setDeviation(DEFAULT_STATE.deviation);
  };

  const handleToggleUnit = () => {
    const newUnit = unit === 'MM' ? 'INCH' : 'MM';
    const factor = newUnit === 'MM' ? 25.4 : 1 / 25.4;
    const precision = newUnit === 'MM' ? 3 : 4;

    const cvt = (val: number) => parseFloat((val * factor).toFixed(precision));

    setPin(p => ({ nominal: cvt(p.nominal), tolPlus: cvt(p.tolPlus), tolMinus: cvt(p.tolMinus), tpSpec: cvt(p.tpSpec) }));
    setHole1(h => ({ nominal: cvt(h.nominal), tolPlus: cvt(h.tolPlus), tolMinus: cvt(h.tolMinus), tpSpec: cvt(h.tpSpec) }));
    setHole2(h => ({ nominal: cvt(h.nominal), tolPlus: cvt(h.tolPlus), tolMinus: cvt(h.tolMinus), tpSpec: cvt(h.tpSpec) }));
    setDeviation(d => ({ x: cvt(d.x), y: cvt(d.y) }));
    
    setUnit(newUnit);
  };

  const handleLoadScenario = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    const scenario = HOLE_SCENARIOS.find(s => s.id === id);
    if (!scenario) return;

    // We simply switch to the scenario's unit to avoid precision messiness
    setUnit(scenario.unit as Unit);
    setMode(scenario.mode as AssemblyType);
    setPin(scenario.pin);
    setHole1(scenario.hole1);
    setHole2(scenario.hole2);
    // Reset deviation to something safe
    setDeviation({ x: 0, y: 0 });
  };

  // --- Calculations ---
  const analysis = useMemo(() => {
    // 1. Calculate MMC (Worst case for assembly)
    // Pin MMC is Largest Pin. Hole MMC is Smallest Hole.
    const pinMMC = pin.nominal + pin.tolPlus;
    const h1MMC = hole1.nominal - hole1.tolMinus;
    const h2MMC = hole2.nominal - hole2.tolMinus;

    // 2. Virtual Conditions (The effective boundary that must not be violated)
    // For Assembly to be guaranteed: Hole Virtual Condition >= Pin Virtual Condition
    
    // Allowable Position Tolerance Budget
    // Formula: T = H_mmc - F_mmc
    
    let maxAllowableTP = 0;
    let recommendation = "";
    let status: 'SAFE' | 'RISK' | 'FAIL' = 'SAFE';
    let clearance = 0;

    // Calculate actual misalignment from X/Y
    const actualOffset = Math.sqrt(deviation.x**2 + deviation.y**2);
    const actualTP = 2 * actualOffset;

    if (mode === 'FLOATING') {
      // Floating Fastener: Bolt passes through two clearance holes.
      // H_mmc - T_spec >= F_mmc
      const clearance1 = h1MMC - pinMMC;
      const clearance2 = h2MMC - pinMMC;
      const limitingClearance = Math.min(clearance1, clearance2);
      
      maxAllowableTP = limitingClearance; 

      // Check Design Spec
      if (hole1.tpSpec > clearance1 || hole2.tpSpec > clearance2) {
        status = 'FAIL';
      }

      clearance = limitingClearance;

      recommendation = `Ideally, Position Tolerance should be ≤ ${(limitingClearance).toFixed(4)} ${unit}. \nCurrently spec is ${Math.max(hole1.tpSpec, hole2.tpSpec).toFixed(4)} ${unit}.`;

    } else {
      // Fixed Fastener: Bolt threaded into Plate 2, Clearance in Plate 1.
      // Formula: T1 + T2 = H_mmc - F_mmc
      
      const totalBudget = h1MMC - pinMMC;
      maxAllowableTP = totalBudget / 2; 

      // Check Design Spec
      const combinedSpec = hole1.tpSpec + hole2.tpSpec;
      
      if (combinedSpec > totalBudget) {
        status = 'FAIL';
      }
      
      clearance = totalBudget;
      recommendation = `For Fixed Fasteners, the total clearance is shared.\nMax recommended TP per part is ${(totalBudget/2).toFixed(4)} ${unit}.`;
    }

    // Simulation Check
    const radialClearance = (h1MMC - pinMMC) / 2;
    const isSimulationInterference = actualOffset > radialClearance;

    return {
      pinMMC,
      h1MMC,
      maxAllowableTP,
      status,
      recommendation,
      actualTP,
      isSimulationInterference,
      radialClearance,
      actualOffset
    };
  }, [mode, pin, hole1, hole2, deviation, unit]);

  const updatePin = (field: keyof PartDimension, val: number) => setPin(p => ({...p, [field]: val}));
  const updateH1 = (field: keyof PartDimension, val: number) => setHole1(h => ({...h, [field]: val}));
  const updateH2 = (field: keyof PartDimension, val: number) => setHole2(h => ({...h, [field]: val}));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Inputs Column */}
      <div className="lg:col-span-5 space-y-6">
        
        {/* Toolbar: Mode, Units, Reset, Scenarios */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
           <div className="flex justify-between items-center">
               <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Configuration</h3>
               <div className="flex items-center gap-2">
                 <button 
                    onClick={handleToggleUnit}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300 transition-colors"
                 >
                    <Ruler size={14}/> {unit}
                 </button>
                 <button 
                    onClick={handleReset}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300 transition-colors"
                    title="Reset all fields"
                 >
                    <RotateCcw size={14}/> Reset
                 </button>
               </div>
           </div>
           
           {/* Scenario Selector */}
           <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <BookOpen className="h-4 w-4" />
              </div>
              <select
                  onChange={handleLoadScenario}
                  value="default"
                  className="appearance-none w-full bg-white border border-slate-300 text-slate-700 py-2 pl-9 pr-8 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium hover:bg-slate-50 cursor-pointer"
              >
                  <option value="default" disabled>Load Example Scenario...</option>
                  {HOLE_SCENARIOS.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-slate-500">
                  <ChevronDown className="h-3 w-3" />
              </div>
           </div>

           {/* Assembly Mode Toggle */}
           <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setMode('FLOATING')}
              className={`flex-1 py-2 px-4 rounded-md text-xs font-bold transition-all ${mode === 'FLOATING' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Floating Fastener
            </button>
            <button
              onClick={() => setMode('FIXED')}
              className={`flex-1 py-2 px-4 rounded-md text-xs font-bold transition-all ${mode === 'FIXED' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Fixed Fastener
            </button>
          </div>
        </div>

        {/* Pin Dimensions */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
           <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-700">Fastener / Pin</h3>
              <div className="text-xs px-2 py-1 bg-slate-100 rounded text-slate-500">MMC: {analysis.pinMMC.toFixed(3)}</div>
           </div>
           <div className="grid grid-cols-3 gap-4">
              <div>
                 <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nominal Ø ({unit})</label>
                 <input type="number" step="0.001" value={pin.nominal} onChange={e => updatePin('nominal', parseFloat(e.target.value)||0)} className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                 <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tol (+)</label>
                 <input type="number" step="0.001" value={pin.tolPlus} onChange={e => updatePin('tolPlus', parseFloat(e.target.value)||0)} className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
               <div>
                 <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tol (-)</label>
                 <input type="number" step="0.001" value={pin.tolMinus} onChange={e => updatePin('tolMinus', parseFloat(e.target.value)||0)} className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
           </div>
        </div>

        {/* Hole 1 Dimensions */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
           <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-700">Top Plate Hole</h3>
              <div className="text-xs px-2 py-1 bg-slate-100 rounded text-slate-500">MMC: {analysis.h1MMC.toFixed(3)}</div>
           </div>
           <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                 <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nominal Ø ({unit})</label>
                 <input type="number" step="0.001" value={hole1.nominal} onChange={e => updateH1('nominal', parseFloat(e.target.value)||0)} className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
               <div>
                 <label className="block text-[10px] font-bold text-blue-400 uppercase mb-1">Position Tol (⌀)</label>
                 <input type="number" step="0.001" value={hole1.tpSpec} onChange={e => updateH1('tpSpec', parseFloat(e.target.value)||0)} className="w-full bg-white border border-blue-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold text-blue-700" />
              </div>
           </div>
           <div className="grid grid-cols-2 gap-4">
              <div>
                 <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tol (+)</label>
                 <input type="number" step="0.001" value={hole1.tolPlus} onChange={e => updateH1('tolPlus', parseFloat(e.target.value)||0)} className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
               <div>
                 <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tol (-)</label>
                 <input type="number" step="0.001" value={hole1.tolMinus} onChange={e => updateH1('tolMinus', parseFloat(e.target.value)||0)} className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
           </div>
        </div>

        {/* Hole 2 Dimensions */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
           <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-700">{mode === 'FIXED' ? 'Bottom Plate (Thread/Fixed)' : 'Bottom Plate Hole'}</h3>
              <div className="text-xs px-2 py-1 bg-slate-100 rounded text-slate-500">MMC: {(hole2.nominal - hole2.tolMinus).toFixed(3)}</div>
           </div>
           {mode === 'FIXED' && (
             <div className="mb-3 text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-100 flex items-start gap-2">
               <Info size={14} className="mt-0.5"/>
               For Fixed Fasteners, ensure Nominal Ø is the mating feature size (e.g., Major diameter or Pin diameter).
             </div>
           )}
           <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                 <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nominal Ø ({unit})</label>
                 <input type="number" step="0.001" value={hole2.nominal} onChange={e => updateH2('nominal', parseFloat(e.target.value)||0)} className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
               <div>
                 <label className="block text-[10px] font-bold text-blue-400 uppercase mb-1">Position Tol (⌀)</label>
                 <input type="number" step="0.001" value={hole2.tpSpec} onChange={e => updateH2('tpSpec', parseFloat(e.target.value)||0)} className="w-full bg-white border border-blue-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold text-blue-700" />
              </div>
           </div>
           <div className="grid grid-cols-2 gap-4">
              <div>
                 <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tol (+)</label>
                 <input type="number" step="0.001" value={hole2.tolPlus} onChange={e => updateH2('tolPlus', parseFloat(e.target.value)||0)} className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
               <div>
                 <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tol (-)</label>
                 <input type="number" step="0.001" value={hole2.tolMinus} onChange={e => updateH2('tolMinus', parseFloat(e.target.value)||0)} className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
           </div>
        </div>
      </div>

      {/* Results Column */}
      <div className="lg:col-span-7 space-y-6">

        {/* Design Status Card */}
        <div className={`p-6 rounded-xl border shadow-sm flex flex-col gap-4 ${analysis.status === 'FAIL' ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
           <div className="flex items-center gap-3">
             {analysis.status === 'FAIL' ? <AlertTriangle className="text-red-600" size={28}/> : <CheckCircle className="text-emerald-600" size={28} />}
             <div>
               <h2 className={`text-xl font-bold ${analysis.status === 'FAIL' ? 'text-red-700' : 'text-emerald-700'}`}>
                 {analysis.status === 'FAIL' ? 'Potential Assembly Failure' : 'Design Feasible'}
               </h2>
               <p className={`text-sm ${analysis.status === 'FAIL' ? 'text-red-600' : 'text-emerald-600'}`}>
                 Based on current MMC and Position Tolerance specs.
               </p>
             </div>
           </div>
           
           <div className="bg-white/80 rounded-lg p-4 border border-black/5 text-sm text-slate-700 whitespace-pre-line">
             <div className="font-bold mb-1 text-slate-900">Recommendation:</div>
             {analysis.recommendation}
           </div>
        </div>

        {/* Simulation / X-Y Check */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
           <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
             <h3 className="font-semibold text-slate-700 flex items-center gap-2">
               <Move size={18} className="text-blue-500"/> Misalignment Simulation
             </h3>
           </div>
           <div className="p-6">
              <div className="flex gap-6 mb-6">
                 <div className="flex-1">
                    <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">X Deviation ({unit})</label>
                    <input 
                      type="range" min={unit === 'MM' ? -1 : -0.05} max={unit === 'MM' ? 1 : 0.05} step={unit === 'MM' ? 0.01 : 0.001}
                      value={deviation.x} 
                      onChange={e => setDeviation(d => ({...d, x: parseFloat(e.target.value)}))}
                      className="w-full mb-2"
                    />
                    <input 
                      type="number" step={unit === 'MM' ? 0.01 : 0.001}
                      value={deviation.x}
                      onChange={e => setDeviation(d => ({...d, x: parseFloat(e.target.value)}))}
                      className="w-full text-center text-sm border border-slate-200 bg-white rounded py-1"
                    />
                 </div>
                 <div className="flex-1">
                    <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Y Deviation ({unit})</label>
                    <input 
                      type="range" min={unit === 'MM' ? -1 : -0.05} max={unit === 'MM' ? 1 : 0.05} step={unit === 'MM' ? 0.01 : 0.001}
                      value={deviation.y} 
                      onChange={e => setDeviation(d => ({...d, y: parseFloat(e.target.value)}))}
                      className="w-full mb-2"
                    />
                    <input 
                      type="number" step={unit === 'MM' ? 0.01 : 0.001}
                      value={deviation.y}
                      onChange={e => setDeviation(d => ({...d, y: parseFloat(e.target.value)}))}
                      className="w-full text-center text-sm border border-slate-200 bg-white rounded py-1"
                    />
                 </div>
              </div>

              <div className="flex items-center justify-center bg-slate-100 rounded-lg border border-slate-200 p-8 relative h-64">
                  {/* Visualization SVG */}
                  <svg viewBox="0 0 200 200" className="w-full h-full overflow-visible">
                     {/* ... SVG Content same as before but scaling adjusted logic ... */}
                     <defs>
                       <marker id="arrow" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
                         <path d="M0,0 L10,5 L0,10 z" fill="#64748b" />
                       </marker>
                     </defs>
                     
                     <circle cx="100" cy="100" r={50} fill="#e2e8f0" stroke="#94a3b8" strokeDasharray="4 2" strokeWidth="1" />
                     
                     {(() => {
                       // Visually we keep it standard sized: Hole is ~50px radius.
                       // If hole is 6mm, 50px = 6mm. Scale = 8.33.
                       // If hole is 0.25in, 50px = 0.25in. Scale = 200.
                       
                       const baseHoleSize = analysis.h1MMC;
                       const scale = baseHoleSize > 0 ? 50 / (baseHoleSize / 2) : 1; 
                       
                       const rH = (analysis.h1MMC / 2) * scale;
                       const rP = (analysis.pinMMC / 2) * scale;
                       
                       const dx = deviation.x * scale;
                       const dy = deviation.y * scale * -1;
                       
                       return (
                         <>
                           <circle cx="100" cy="100" r={rH} fill="none" stroke="#3b82f6" strokeWidth="2" />
                           <circle cx={100 + dx} cy={100 + dy} r={rP} fill={analysis.isSimulationInterference ? "#fca5a5" : "#86efac"} stroke={analysis.isSimulationInterference ? "#ef4444" : "#16a34a"} strokeWidth="2" fillOpacity="0.5" />
                           <circle cx="100" cy="100" r="2" fill="#3b82f6" />
                           <circle cx={100 + dx} cy={100 + dy} r="2" fill="#16a34a" />
                           <line x1="100" y1="100" x2={100 + dx} y2={100 + dy} stroke="#64748b" strokeWidth="1" />
                         </>
                       );
                     })()}
                  </svg>
                  
                  <div className={`absolute bottom-4 left-4 px-3 py-1 rounded-full text-xs font-bold border ${analysis.isSimulationInterference ? 'bg-red-100 text-red-700 border-red-200' : 'bg-green-100 text-green-700 border-green-200'}`}>
                    {analysis.isSimulationInterference ? "INTERFERENCE" : "CLEARANCE"}
                  </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                 <div className="p-3 bg-slate-50 rounded border border-slate-100">
                    <div className="text-xs text-slate-500 uppercase mb-1">Radial Shift</div>
                    <div className="font-mono font-bold text-slate-700">{analysis.actualOffset.toFixed(3)}</div>
                 </div>
                 <div className="p-3 bg-slate-50 rounded border border-slate-100">
                    <div className="text-xs text-slate-500 uppercase mb-1">True Position Ø</div>
                    <div className="font-mono font-bold text-blue-600">⌀ {analysis.actualTP.toFixed(3)}</div>
                 </div>
                 <div className="p-3 bg-slate-50 rounded border border-slate-100">
                    <div className="text-xs text-slate-500 uppercase mb-1">Available Clearance</div>
                    <div className="font-mono font-bold text-slate-700">{(analysis.radialClearance).toFixed(3)}</div>
                 </div>
              </div>
           </div>
        </div>

      </div>
    </div>
  );
};