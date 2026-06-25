
import React, { useEffect, useState } from 'react';
import { ifcManager } from '../services/ifcManager';
import { Box, Layers, Cpu } from 'lucide-react';

export const TopStatusBar = ({ fileName }: { fileName: string | null }) => {
    const [stats, setStats] = useState({ triangles: 0, geometries: 0, memory: 0 });

    useEffect(() => {
        const interval = setInterval(() => {
            const s = ifcManager.getStatistics();
            setStats(s);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="h-12 bg-white/80 backdrop-blur-md border-b border-slate-200/50 flex items-center justify-between px-5 select-none z-30 relative shadow-sm flex-shrink-0">
            {/* Left: Branding */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="font-bold text-slate-800 text-base tracking-tight flex items-center gap-2">
                    <Box size={20} className="text-blue-600" /> BIMVision
                </span>
            </div>

            {/* Center: Operation Tips (Enlarged) */}
            <div className="flex items-center justify-center gap-6 text-[13px] text-slate-500 font-semibold tracking-wide flex-[2.5]">
                 <div className="flex items-center gap-2">
                    <span className="bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded text-slate-600 shadow-sm font-bold text-[11.5px]">左键</span>
                    <span>旋转</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <span className="bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded text-slate-600 shadow-sm font-bold text-[11.5px]">右键</span>
                    <span>平移</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <span className="bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded text-slate-600 shadow-sm font-bold text-[11.5px]">滚轮</span>
                    <span>缩放</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <span className="bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded text-slate-600 shadow-sm font-bold text-[11.5px]">双击</span>
                    <span>选择属性</span>
                 </div>
            </div>

            {/* Right: Stats (Enlarged and Vertically Aligned Perfectly) */}
            <div className="flex items-center justify-end gap-5 flex-1 text-sm text-slate-600 font-mono font-bold">
                <div className="flex items-center gap-1.5" title="三角面数量">
                    <Layers size={16} className="text-slate-400 shrink-0" />
                    <span className="select-none leading-none">{(stats.triangles / 1000).toFixed(1)}k</span>
                </div>
                <div className="flex items-center gap-1.5" title="真实内存占用">
                    <Cpu size={16} className="text-slate-400 shrink-0" />
                    <span className="select-none leading-none">{stats.memory > 0 ? `${stats.memory} MB` : '-'}</span>
                </div>
            </div>
        </div>
    )
}
