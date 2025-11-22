import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { StackupResult } from '../types';

interface StatisticalChartProps {
  result: StackupResult;
}

export const StatisticalChart: React.FC<StatisticalChartProps> = ({ result }) => {
  // Generate normal distribution data based on RSS Min/Max
  // RSS Mean = Nominal Gap
  // RSS Sigma = (Nominal - RSS Min) / 3 (Assuming 3-sigma design)
  
  const mean = result.nominalGap;
  const sigma = (mean - result.rssMin) / 3; // Approximate standard deviation

  const generateBellCurveData = () => {
    const data = [];
    // Plot from -4 sigma to +4 sigma
    const start = mean - 4 * sigma;
    const end = mean + 4 * sigma;
    const steps = 50;
    const stepSize = (end - start) / steps;

    for (let i = 0; i <= steps; i++) {
      const x = start + i * stepSize;
      // Gaussian function: f(x) = (1 / (sigma * sqrt(2*pi))) * e^(-0.5 * ((x-mean)/sigma)^2)
      // We can ignore the constant scaling factor for visual shape, but let's keep it somewhat proportional
      const exponent = -0.5 * Math.pow((x - mean) / sigma, 2);
      const density = Math.exp(exponent); 
      data.push({
        val: parseFloat(x.toFixed(4)),
        density: parseFloat(density.toFixed(4)),
      });
    }
    return data;
  };

  const data = generateBellCurveData();

  // Determine colors based on interference
  // If x < 0, it's interference.
  
  // We need a gradient offset to color the interference part red and the rest green
  const gradientOffset = () => {
    if (data.length === 0) return 0;
    const minVal = data[0].val;
    const maxVal = data[data.length - 1].val;
    
    if (maxVal <= 0) return 0;
    if (minVal >= 0) return 1;
    
    return (0 - minVal) / (maxVal - minVal);
  };

  const off = gradientOffset();

  return (
    <div className="h-64 w-full bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-500 mb-2 uppercase tracking-wide">RSS Statistical Distribution</h3>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="splitColor" x1="0" y1="0" x2="1" y2="0">
              <stop offset={off} stopColor="#ef4444" stopOpacity={0.6} />
              <stop offset={off} stopColor="#10b981" stopOpacity={0.6} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis 
            dataKey="val" 
            type="number" 
            domain={['auto', 'auto']} 
            tick={{fontSize: 10}} 
            tickFormatter={(val) => val.toFixed(3)}
          />
          <YAxis hide />
          <Tooltip 
            formatter={(value: number) => [value, 'Probability Density']}
            labelFormatter={(label) => `Gap: ${label}`}
            contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}
          />
          <ReferenceLine x={0} stroke="#64748b" label={{ position: 'top', value: '0', fill: '#64748b', fontSize: 10 }} strokeDasharray="3 3" />
          <Area 
            type="monotone" 
            dataKey="density" 
            stroke="#000" 
            strokeWidth={0}
            fill="url(#splitColor)" 
            animationDuration={500}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
