import React, { useMemo } from 'react';
import { Dimension, DimensionType } from '../types';

interface StackVisualizerProps {
  dimensions: Dimension[];
  nominalGap: number;
}

export const StackVisualizer: React.FC<StackVisualizerProps> = ({ dimensions, nominalGap }) => {
  // Calculate visualization scaling
  const { increasing, decreasing, scale } = useMemo(() => {
    const itemsData = dimensions.map((d) => {
      const width = d.nominal;
      return { ...d, width };
    });

    const increasingList = itemsData.filter(d => d.type === DimensionType.INCREASING);
    const decreasingList = itemsData.filter(d => d.type === DimensionType.DECREASING);

    const totalInc = increasingList.reduce((acc, cur) => acc + cur.width, 0);
    const totalDec = decreasingList.reduce((acc, cur) => acc + cur.width, 0);
    
    // Find the max width to fit in the SVG
    const maxW = Math.max(totalInc, totalDec) * 1.2; 
    // Avoid divide by zero
    const safeMaxW = maxW === 0 ? 100 : maxW;
    
    return { 
      increasing: increasingList, 
      decreasing: decreasingList, 
      scale: 800 / safeMaxW 
    };
  }, [dimensions]);

  // SVG dimensions
  const height = 250;
  const width = 800;
  const padding = 20;
  const barHeight = 40;

  // Render Logic
  // Top Row: Increasing Dimensions (left to right)
  // Bottom Row: Decreasing Dimensions (right to left, aligned with the end of Top Row)

  let cursorX = padding;
  const increasingEls = increasing.map((d, i) => {
    const w = d.width * scale;
    const el = (
      <g key={d.id}>
        <rect 
          x={cursorX} 
          y={50} 
          width={w} 
          height={barHeight} 
          fill="#3b82f6" 
          stroke="white" 
          strokeWidth="2"
          className="hover:opacity-80 transition-opacity"
        />
        <text x={cursorX + w/2} y={50 + barHeight/2 + 5} textAnchor="middle" fill="white" fontSize="12" className="pointer-events-none truncate">
           {d.name}
        </text>
        <text x={cursorX + w/2} y={40} textAnchor="middle" fill="#64748b" fontSize="10">
           {d.nominal}
        </text>
      </g>
    );
    cursorX += w;
    return el;
  });

  const endOfIncreasingX = cursorX;

  // Bottom Row: Decreasing Dimensions
  // Start from endOfIncreasingX and go backwards
  let cursorBackX = endOfIncreasingX;
  const decreasingEls = decreasing.map((d, i) => {
    const w = d.width * scale;
    cursorBackX -= w;
    const el = (
      <g key={d.id}>
        <rect 
          x={cursorBackX} 
          y={120} 
          width={w} 
          height={barHeight} 
          fill="#ef4444" 
          stroke="white" 
          strokeWidth="2"
          className="hover:opacity-80 transition-opacity"
        />
        <text x={cursorBackX + w/2} y={120 + barHeight/2 + 5} textAnchor="middle" fill="white" fontSize="12" className="pointer-events-none">
           {d.name}
        </text>
        <text x={cursorBackX + w/2} y={175} textAnchor="middle" fill="#64748b" fontSize="10">
           {d.nominal}
        </text>
      </g>
    );
    return el;
  });

  // The Gap
  // Graphically:
  // Inc goes 0 -> A.
  // Dec goes A -> B.
  // Gap is distance from B to 0.
  
  const pointC = cursorBackX; // This is where the Decreasing chain ended (leftmost point of the bottom bar group)
  const pointA = padding;
  
  const gapPixelWidth = pointC - pointA;
  const isInterference = gapPixelWidth < 0;
  
  // Draw Gap Arrow
  const gapArrow = (
    <g>
      {/* Dashed reference lines */}
      <line x1={pointA} y1={30} x2={pointA} y2={200} stroke="#94a3b8" strokeDasharray="4" />
      <line x1={pointC} y1={110} x2={pointC} y2={200} stroke="#94a3b8" strokeDasharray="4" />
      
      {/* Gap Dimension Line */}
      <line 
        x1={pointA} 
        y1={190} 
        x2={pointC} 
        y2={190} 
        stroke={isInterference ? "#ef4444" : "#10b981"} 
        strokeWidth="2" 
        markerEnd="url(#arrowhead)"
        markerStart="url(#arrowhead)"
      />
      <rect x={(pointA + pointC)/2 - 30} y={180} width={60} height={20} fill="white" opacity="0.8" />
      <text 
        x={(pointA + pointC)/2} 
        y={194} 
        textAnchor="middle" 
        fill={isInterference ? "#ef4444" : "#10b981"} 
        fontWeight="bold"
        fontSize="12"
      >
        {isInterference ? "Interference" : "Gap"}: {Math.abs(nominalGap).toFixed(3)}
      </text>
    </g>
  );

  return (
    <div className="w-full overflow-x-auto border border-slate-200 rounded-lg bg-white p-4 shadow-sm">
       <h3 className="text-sm font-semibold text-slate-500 mb-2 uppercase tracking-wide">1D Loop Diagram</h3>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill={isInterference ? "#ef4444" : "#10b981"} />
          </marker>
        </defs>
        {increasingEls}
        {decreasingEls}
        {gapArrow}
      </svg>
      <div className="flex justify-center gap-6 mt-2 text-xs text-slate-500">
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-blue-500"></div> Increasing (+ Gap)</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-500"></div> Decreasing (- Gap)</div>
      </div>
    </div>
  );
};