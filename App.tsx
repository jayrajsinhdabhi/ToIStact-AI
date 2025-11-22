import React, { useState, useMemo, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid'; 
import { Trash2, Plus, RefreshCw, AlertTriangle, CheckCircle, ChevronRight, BrainCircuit, HelpCircle, Info, FileDown, BookOpen, ChevronDown, Layers, CircleDashed, RotateCcw } from 'lucide-react';
import { Dimension, DimensionType, StackupResult, AIAnalysisResult } from './types';
import { StackVisualizer } from './components/StackVisualizer';
import { StatisticalChart } from './components/StatisticalChart';
import { HoleFitCalculator } from './components/HoleFitCalculator';
import { analyzeStackupWithGemini } from './services/geminiService';
import { generateExcelFile } from './utils/excelGenerator';

const generateId = () => Math.random().toString(36).substr(2, 9);

const INITIAL_DIMENSIONS: Dimension[] = [
  { id: '1', name: 'Housing Cavity Depth', description: 'Main enclosure depth', nominal: 20.00, tolerancePlus: 0.2, toleranceMinus: 0.2, type: DimensionType.INCREASING },
  { id: '2', name: 'PCB Thickness', description: 'FR4 Board', nominal: 1.60, tolerancePlus: 0.1, toleranceMinus: 0.1, type: DimensionType.DECREASING },
  { id: '3', name: 'Standoff Height', description: 'Metal standoff', nominal: 5.00, tolerancePlus: 0.05, toleranceMinus: 0.05, type: DimensionType.DECREASING },
  { id: '4', name: 'Battery Thickness', description: 'LiPo Pouch cell', nominal: 12.50, tolerancePlus: 0.3, toleranceMinus: 0.1, type: DimensionType.DECREASING },
];

const SAMPLE_SCENARIOS = [
  {
    id: 'enclosure',
    name: 'Enclosure Assembly',
    dimensions: [
      { name: 'Housing Cavity', description: 'Machined Aluminum Case', nominal: 25.00, tolerancePlus: 0.15, toleranceMinus: 0.15, type: DimensionType.INCREASING },
      { name: 'PCB Stack', description: 'Mainboard + Daughterboard', nominal: 3.20, tolerancePlus: 0.2, toleranceMinus: 0.2, type: DimensionType.DECREASING },
      { name: 'Spacer', description: 'Nylon Spacer', nominal: 8.00, tolerancePlus: 0.1, toleranceMinus: 0.1, type: DimensionType.DECREASING },
      { name: 'Heatsink', description: 'Extruded Aluminum', nominal: 12.50, tolerancePlus: 0.3, toleranceMinus: 0.1, type: DimensionType.DECREASING },
      { name: 'Thermal Pad', description: 'Gap Filler (Compressed)', nominal: 1.00, tolerancePlus: 0.2, toleranceMinus: 0.1, type: DimensionType.DECREASING },
    ]
  },
  {
    id: 'oring',
    name: 'O-Ring Compression',
    dimensions: [
      { name: 'Groove Depth', description: 'Piston groove depth', nominal: 3.40, tolerancePlus: 0.05, toleranceMinus: 0.05, type: DimensionType.INCREASING },
      { name: 'O-Ring Cross Section', description: 'Standard size -126', nominal: 4.00, tolerancePlus: 0.10, toleranceMinus: 0.10, type: DimensionType.DECREASING },
      // Note: In this case, "Interference" is actually "Squeeze", which is desired.
    ]
  },
  {
    id: 'button',
    name: 'Button Tactile Travel',
    dimensions: [
      { name: 'Housing Face to PCB', description: 'Distance from PCB mount to front face', nominal: 8.50, tolerancePlus: 0.15, toleranceMinus: 0.15, type: DimensionType.INCREASING },
      { name: 'Switch Height', description: 'Tact switch unpressed height', nominal: 3.50, tolerancePlus: 0.1, toleranceMinus: 0.1, type: DimensionType.DECREASING },
      { name: 'Button Actuator', description: 'Plastic button rib length', nominal: 4.80, tolerancePlus: 0.05, toleranceMinus: 0.05, type: DimensionType.DECREASING },
    ]
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'LINEAR' | 'HOLE'>('LINEAR');
  const [dimensions, setDimensions] = useState<Dimension[]>(INITIAL_DIMENSIONS);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult>({ text: '', isLoading: false, error: null });
  
  // --- Calculations (Linear) ---
  const results: StackupResult = useMemo(() => {
    let nominalGap = 0;
    let wcMax = 0;
    let wcMin = 0;
    let rssSumSquares = 0;

    let sumIncNom = 0;
    let sumDecNom = 0;
    let sumIncMax = 0;
    let sumIncMin = 0;
    let sumDecMax = 0;
    let sumDecMin = 0;

    dimensions.forEach(d => {
      if (d.type === DimensionType.INCREASING) {
        sumIncNom += d.nominal;
        sumIncMax += d.nominal + d.tolerancePlus;
        sumIncMin += d.nominal - d.toleranceMinus;
      } else {
        sumDecNom += d.nominal;
        sumDecMax += d.nominal + d.tolerancePlus;
        sumDecMin += d.nominal - d.toleranceMinus;
      }

      const avgTol = (d.tolerancePlus + d.toleranceMinus) / 2;
      rssSumSquares += Math.pow(avgTol, 2);
    });

    nominalGap = sumIncNom - sumDecNom;
    
    // Worst Case
    wcMax = sumIncMax - sumDecMin; 
    wcMin = sumIncMin - sumDecMax; 

    // RSS
    const rssTol = Math.sqrt(dimensions.reduce((acc, d) => {
       const t = (d.tolerancePlus + d.toleranceMinus)/2; 
       return acc + t*t;
    }, 0));

    // Probability
    const sigma = rssTol / 3; 
    const zScore = (0 - nominalGap) / (sigma || 0.001); 
    
    let prob = 0;
    if (sigma > 0) {
         // Approximation of cumulative normal distribution
         const t = 1 / (1 + 0.2316419 * Math.abs(zScore));
         const d = 0.3989423 * Math.exp(-zScore * zScore / 2);
         let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
         if (zScore > 0) p = 1 - p;
         prob = p * 100;
    }
    
    return {
      nominalGap,
      worstCaseMin: wcMin,
      worstCaseMax: wcMax,
      rssMin: nominalGap - rssTol,
      rssMax: nominalGap + rssTol,
      contributors: dimensions.length,
      interferenceProb: prob
    };
  }, [dimensions]);

  // --- Handlers ---
  const addDimension = () => {
    const newDim: Dimension = {
      id: generateId(),
      name: `New Component ${dimensions.length + 1}`,
      nominal: 10.0,
      tolerancePlus: 0.1,
      toleranceMinus: 0.1,
      type: DimensionType.INCREASING
    };
    setDimensions([...dimensions, newDim]);
  };

  const updateDimension = (id: string, field: keyof Dimension, value: any) => {
    setDimensions(dimensions.map(d => {
      if (d.id !== id) return d;
      return { ...d, [field]: value };
    }));
  };

  const removeDimension = (id: string) => {
    setDimensions(dimensions.filter(d => d.id !== id));
  };

  const handleReset = () => {
    if (confirm("Are you sure you want to reset the current stackup to default values?")) {
      setDimensions(INITIAL_DIMENSIONS);
      setAiAnalysis({ text: '', isLoading: false, error: null });
    }
  };

  const handleRunAI = async () => {
    setAiAnalysis(prev => ({ ...prev, isLoading: true, error: null }));
    try {
        const text = await analyzeStackupWithGemini(dimensions, results);
        setAiAnalysis({ text, isLoading: false, error: null });
    } catch (e) {
        setAiAnalysis({ text: '', isLoading: false, error: "Analysis failed" });
    }
  };

  const handleExportExcel = () => {
    generateExcelFile(dimensions);
  };

  const handleLoadScenario = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const scenarioId = e.target.value;
    const scenario = SAMPLE_SCENARIOS.find(s => s.id === scenarioId);
    if (scenario) {
      const newDims: Dimension[] = scenario.dimensions.map(d => ({
        id: generateId(),
        name: d.name,
        description: d.description,
        nominal: d.nominal,
        tolerancePlus: d.tolerancePlus,
        toleranceMinus: d.toleranceMinus,
        type: d.type
      }));
      setDimensions(newDims);
      setAiAnalysis({ text: '', isLoading: false, error: null });
    }
  };

  // --- Render Helpers ---
  const renderStatus = () => {
    if (results.worstCaseMin < 0) {
      return (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-2 rounded-md border border-red-200">
          <AlertTriangle size={20} />
          <span className="font-semibold">Interference Detected (Worst Case)</span>
        </div>
      );
    }
    if (results.rssMin < 0) {
       return (
        <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-2 rounded-md border border-amber-200">
          <AlertTriangle size={20} />
          <span className="font-semibold">Statistical Interference Risk ({results.interferenceProb.toFixed(1)}%)</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-4 py-2 rounded-md border border-emerald-200">
        <CheckCircle size={20} />
        <span className="font-semibold">Assembly Safe (Clearance Guaranteed)</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-blue-500">
              TolStack AI
            </h1>
          </div>
          <div className="flex items-center gap-3">
             {/* Tab Switcher Mobile/Desktop */}
             <div className="flex bg-slate-100 p-1 rounded-lg mr-2">
               <button 
                 onClick={() => setActiveTab('LINEAR')}
                 className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'LINEAR' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
               >
                 <Layers size={16} />
                 <span className="hidden sm:inline">Linear Stack</span>
               </button>
               <button 
                 onClick={() => setActiveTab('HOLE')}
                 className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'HOLE' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
               >
                 <CircleDashed size={16} />
                 <span className="hidden sm:inline">Hole Pattern</span>
               </button>
             </div>

             {activeTab === 'LINEAR' && (
               <>
                {/* Scenario Selector */}
                <div className="relative hidden md:block">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-600">
                      <BookOpen className="h-4 w-4" />
                  </div>
                  <select
                      onChange={handleLoadScenario}
                      value="default"
                      className="appearance-none bg-white border border-slate-300 text-slate-700 py-2 pl-9 pr-8 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium hover:bg-slate-50 cursor-pointer transition-all"
                  >
                      <option value="default" disabled>Load Example...</option>
                      {SAMPLE_SCENARIOS.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-slate-600">
                      <ChevronDown className="h-3 w-3" />
                  </div>
                </div>

                <button 
                  onClick={handleReset}
                  className="p-2 hover:bg-slate-100 text-slate-500 rounded-md transition-colors"
                  title="Reset Stackup"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>

                <button 
                  onClick={handleExportExcel}
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-md shadow-sm transition-all font-medium text-sm"
                  title="Download Excel with Formulas"
                >
                  <FileDown className="w-4 h-4" />
                  <span className="hidden sm:inline">Export Excel</span>
                </button>
                <button 
                  onClick={handleRunAI}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md shadow-sm transition-all font-medium text-sm"
                  disabled={aiAnalysis.isLoading}
                >
                  {aiAnalysis.isLoading ? <RefreshCw className="animate-spin w-4 h-4"/> : <BrainCircuit className="w-4 h-4" />}
                  <span>{aiAnalysis.isLoading ? "Thinking..." : "AI Audit"}</span>
                </button>
               </>
             )}
          </div>
        </div>
      </header>

      <main className="flex-grow p-6 max-w-7xl mx-auto w-full">
        
        {activeTab === 'LINEAR' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* LEFT COLUMN: Inputs */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Input Card */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <h2 className="font-semibold text-slate-700">Stackup Definition</h2>
                  <button 
                    onClick={addDimension}
                    className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-full transition-colors"
                    title="Add Dimension"
                  >
                    <Plus size={20} />
                  </button>
                </div>
                
                <div className="p-0 overflow-y-auto max-h-[600px]">
                  {dimensions.length === 0 && (
                      <div className="p-8 text-center text-slate-400 italic">
                          No dimensions added. Click + to start.
                      </div>
                  )}
                  <div className="divide-y divide-slate-100">
                    {dimensions.map((dim) => (
                      <div key={dim.id} className="p-4 hover:bg-slate-50 transition-colors group">
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex-1 mr-3">
                                <input 
                                  type="text" 
                                  placeholder="Component Name"
                                  value={dim.name}
                                  onChange={(e) => updateDimension(dim.id, 'name', e.target.value)}
                                  className="font-medium text-slate-700 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none w-full px-1"
                                />
                                <input 
                                  type="text" 
                                  placeholder="Description (e.g., Material, Notes)"
                                  value={dim.description || ''}
                                  onChange={(e) => updateDimension(dim.id, 'description', e.target.value)}
                                  className="text-xs text-slate-500 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none w-full px-1 mt-1"
                                />
                            </div>
                            <button onClick={() => removeDimension(dim.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                              <Trash2 size={16} />
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">Nominal</label>
                                <div className="relative">
                                    <input 
                                        type="number" 
                                        step="0.01"
                                        value={dim.nominal}
                                        onChange={(e) => updateDimension(dim.id, 'nominal', parseFloat(e.target.value) || 0)}
                                        className="w-full text-sm border border-slate-200 rounded px-2 py-1 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">Tolerance (±)</label>
                                <div className="flex items-center gap-1">
                                    <span className="text-slate-400 text-xs">+</span>
                                    <input 
                                        type="number" 
                                        step="0.01"
                                        value={dim.tolerancePlus}
                                        onChange={(e) => updateDimension(dim.id, 'tolerancePlus', parseFloat(e.target.value) || 0)}
                                        className="w-full text-xs border border-slate-200 rounded px-1 py-1 bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div className="flex items-center gap-1 mt-1">
                                    <span className="text-slate-400 text-xs">-</span>
                                    <input 
                                        type="number" 
                                        step="0.01"
                                        value={dim.toleranceMinus}
                                        onChange={(e) => updateDimension(dim.id, 'toleranceMinus', parseFloat(e.target.value) || 0)}
                                        className="w-full text-xs border border-slate-200 rounded px-1 py-1 bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">Direction</label>
                                <select 
                                    value={dim.type}
                                    onChange={(e) => updateDimension(dim.id, 'type', e.target.value)}
                                    className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                >
                                    <option value={DimensionType.INCREASING}>Increasing (+)</option>
                                    <option value={DimensionType.DECREASING}>Decreasing (-)</option>
                                </select>
                            </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* AI Results Card (Conditional) */}
              {aiAnalysis.text && (
                  <div className="bg-indigo-50 rounded-xl p-6 border border-indigo-100 shadow-inner">
                      <h3 className="flex items-center gap-2 text-indigo-900 font-bold mb-3">
                          <BrainCircuit size={18} /> AI Engineer Analysis
                      </h3>
                      <div className="prose prose-sm text-indigo-800 max-w-none whitespace-pre-line">
                          {aiAnalysis.text}
                      </div>
                  </div>
              )}

            </div>

            {/* RIGHT COLUMN: Visuals & Data */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Status Banner */}
              {renderStatus()}

              {/* Results Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Nominal Gap Card */}
                <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between">
                            <div className="text-slate-500 text-xs font-bold uppercase tracking-wider">Nominal Gap</div>
                            <Info size={14} className="text-slate-300" />
                        </div>
                        <div className={`text-3xl font-bold mt-2 ${results.nominalGap < 0 ? 'text-red-500' : 'text-slate-800'}`}>
                            {results.nominalGap.toFixed(3)}
                        </div>
                    </div>
                    <div className="mt-3 text-xs text-slate-500 leading-relaxed border-t border-slate-100 pt-2">
                        The theoretical clearance if every component is manufactured exactly at its nominal dimension.
                    </div>
                </div>

                {/* Worst Case Min Card */}
                <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between">
                            <div className="text-slate-500 text-xs font-bold uppercase tracking-wider">Worst Case Min</div>
                            <AlertTriangle size={14} className="text-slate-300" />
                        </div>
                        <div className={`text-3xl font-bold mt-2 ${results.worstCaseMin < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                            {results.worstCaseMin.toFixed(3)}
                        </div>
                    </div>
                    <div className="mt-3 text-xs text-slate-500 leading-relaxed border-t border-slate-100 pt-2">
                        The smallest possible gap if all parts are at their worst-case tolerance limits. If negative, physical interference is possible.
                    </div>
                </div>

                {/* RSS Min Card */}
                <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between">
                            <div className="text-slate-500 text-xs font-bold uppercase tracking-wider">RSS Min (3σ)</div>
                            <Info size={14} className="text-slate-300" />
                        </div>
                        <div className={`text-3xl font-bold mt-2 ${results.rssMin < 0 ? 'text-amber-600' : 'text-slate-800'}`}>
                            {results.rssMin.toFixed(3)}
                        </div>
                    </div>
                    <div className="mt-3 text-xs text-slate-500 leading-relaxed border-t border-slate-100 pt-2">
                        This represents the statistical minimum gap (99.73% yield).
                        <div className="mt-2 space-y-1 font-medium">
                            <p className="text-emerald-600 flex items-start gap-1.5">
                                <span className="mt-0.5">•</span> 
                                <span>If <strong>Positive</strong> (&gt;0): Good. Design is robust for mass production.</span>
                            </p>
                            <p className="text-red-500 flex items-start gap-1.5">
                                <span className="mt-0.5">•</span> 
                                <span>If <strong>Negative</strong> (&lt;0): High failure rate (interference) is likely. Tolerances need tightening.</span>
                            </p>
                        </div>
                    </div>
                </div>

                {/* Total Tolerance Card */}
                <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between">
                            <div className="text-slate-500 text-xs font-bold uppercase tracking-wider">Total Tolerance</div>
                            <Info size={14} className="text-slate-300" />
                        </div>
                        <div className="text-3xl font-bold mt-2 text-slate-800">
                            {(results.worstCaseMax - results.worstCaseMin).toFixed(3)}
                        </div>
                    </div>
                    <div className="mt-3 text-xs text-slate-500 leading-relaxed border-t border-slate-100 pt-2">
                        The total range of variation (Max Gap - Min Gap). Indicates how loose or tight the overall assembly stack is.
                    </div>
                </div>
              </div>

              {/* Visualization Component */}
              <StackVisualizer dimensions={dimensions} nominalGap={results.nominalGap} />

              {/* Statistical Chart */}
              <StatisticalChart result={results} />

              {/* Hints */}
              <div className="bg-slate-100 rounded-lg p-4 text-xs text-slate-500 flex gap-3 items-start">
                <HelpCircle className="w-5 h-5 flex-shrink-0 text-slate-400" />
                <div>
                    <p className="font-bold mb-1">How to use:</p>
                    <ul className="list-disc pl-4 space-y-1">
                        <li>Add dimensions in the loop. <strong>Increasing</strong> adds to the stack, <strong>Decreasing</strong> subtracts (consumes space).</li>
                        <li>The <strong>Gap</strong> is the remaining space. Negative Gap means Interference.</li>
                        <li>Use <strong>AI Audit</strong> to get recommendations on how to fix interference by adjusting specific tolerances.</li>
                    </ul>
                </div>
              </div>

            </div>
          </div>
        ) : (
          // HOLE FIT ANALYSIS TAB
          <HoleFitCalculator />
        )}
      </main>
    </div>
  );
}