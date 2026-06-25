import React, { useState, useEffect } from 'react';
import { Sun, Moon, Clock, Compass, Sparkles, Sliders } from 'lucide-react';
import { ifcManager } from '../services/ifcManager';

interface LightingSimulationPanelProps {
    onShadowQualityChange?: (quality: 'high' | 'low' | 'off') => void;
    currentShadowQuality?: 'high' | 'low' | 'off';
}

const LightingSimulationPanel: React.FC<LightingSimulationPanelProps> = ({ 
    onShadowQualityChange, 
    currentShadowQuality = 'off' 
}) => {
    // Light states (stored in local state and updated in ifcManager)
    const [timeOfDay, setTimeOfDay] = useState<number>(12); // Noon (12:00)
    const [azimuth, setAzimuth] = useState<number>(135); // SE
    const [altitude, setAltitude] = useState<number>(45); // 45 degrees
    const [shadowQuality, setShadowQuality] = useState<'high' | 'low' | 'off'>(currentShadowQuality);

    // Synchronize shadow state if parent state changes
    useEffect(() => {
        setShadowQuality(currentShadowQuality);
    }, [currentShadowQuality]);

    // Apply lighting adjustments in ifcManager
    useEffect(() => {
        ifcManager.updateLighting(timeOfDay, azimuth, altitude);
    }, [timeOfDay, azimuth, altitude]);

    // Handle Quick Presets
    const applyPreset = (preset: 'sunrise' | 'noon' | 'sunset' | 'night') => {
        switch (preset) {
            case 'sunrise':
                setTimeOfDay(7.0);
                setAzimuth(90); // East
                setAltitude(15);
                break;
            case 'noon':
                setTimeOfDay(12.0);
                setAzimuth(180); // South
                setAltitude(75);
                break;
            case 'sunset':
                setTimeOfDay(17.5);
                setAzimuth(270); // West
                setAltitude(12);
                break;
            case 'night':
                setTimeOfDay(21.0);
                setAzimuth(315); // NW
                setAltitude(40);
                break;
        }
    };

    const handleShadowToggle = (q: 'high' | 'low' | 'off') => {
        setShadowQuality(q);
        if (onShadowQualityChange) {
            onShadowQualityChange(q);
        } else {
            ifcManager.setShadowQuality(q);
        }
    };

    // Format decimal time to readable HH:MM
    const formatTime = (time: number) => {
        const hours = Math.floor(time);
        const minutes = Math.floor((time - hours) * 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    };

    return (
        <div className="h-full flex flex-col bg-white select-none">
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
                
                {/* 1. Quick Presets */}
                <div className="space-y-2">
                    <div className="text-xs font-bold text-slate-500 flex items-center gap-1.5 uppercase tracking-wider">
                        <Sparkles size={13} className="text-blue-500" /> 
                        <span>快速环境预设 (Atmospheric Presets)</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                        <button
                            type="button"
                            onClick={() => applyPreset('sunrise')}
                            className="group flex flex-col items-center justify-center p-2 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/40 text-slate-600 transition-all"
                        >
                            <span className="text-[10px] font-bold text-slate-700 group-hover:text-blue-600 transition-colors">日出</span>
                            <span className="text-[9px] text-slate-400 mt-0.5 font-mono">07:00</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => applyPreset('noon')}
                            className="group flex flex-col items-center justify-center p-2 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/40 text-slate-600 transition-all"
                        >
                            <span className="text-[10px] font-bold text-slate-700 group-hover:text-blue-600 transition-colors">正午</span>
                            <span className="text-[9px] text-slate-400 mt-0.5 font-mono">12:00</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => applyPreset('sunset')}
                            className="group flex flex-col items-center justify-center p-2 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/40 text-slate-600 transition-all"
                        >
                            <span className="text-[10px] font-bold text-slate-700 group-hover:text-blue-600 transition-colors">日落</span>
                            <span className="text-[9px] text-slate-400 mt-0.5 font-mono">17:30</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => applyPreset('night')}
                            className="group flex flex-col items-center justify-center p-2 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/40 text-slate-600 transition-all"
                        >
                            <span className="text-[10px] font-bold text-slate-700 group-hover:text-blue-600 transition-colors">月夜</span>
                            <span className="text-[9px] text-slate-400 mt-0.5 font-mono">21:00</span>
                        </button>
                    </div>
                </div>

                {/* 2. Time Slider */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <div className="text-xs font-bold text-slate-500 flex items-center gap-1.5 uppercase tracking-wider">
                            <Clock size={13} className="text-blue-500" />
                            <span>时间模拟 (Solar Time)</span>
                        </div>
                        <span className="text-sm font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                            {timeOfDay >= 6 && timeOfDay <= 18 ? <Sun size={12} className="text-amber-500 animate-spin-slow" /> : <Moon size={12} className="text-indigo-500" />}
                            {formatTime(timeOfDay)}
                        </span>
                    </div>
                    <div className="pt-1.5">
                        <input
                            type="range"
                            min="0"
                            max="23.9"
                            step="0.1"
                            value={timeOfDay}
                            onChange={(e) => setTimeOfDay(parseFloat(e.target.value))}
                            className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600 border border-slate-200/50"
                        />
                        <div className="flex justify-between text-[9px] font-bold text-slate-400 font-mono mt-1 px-0.5">
                            <span>00:00</span>
                            <span>06:00</span>
                            <span>12:00</span>
                            <span>18:00</span>
                            <span>24:00</span>
                        </div>
                    </div>
                </div>

                {/* 3. Sun Position Sliders */}
                <div className="space-y-4">
                    <div className="text-xs font-bold text-slate-500 flex items-center gap-1.5 uppercase tracking-wider">
                        <Sliders size={13} className="text-blue-500" />
                        <span>光照角度 (Sun Orientation)</span>
                    </div>
                    
                    {/* Azimuth */}
                    <div className="space-y-1 bg-slate-50 border border-slate-100/80 rounded-xl p-3">
                        <div className="flex justify-between text-xs font-bold text-slate-600">
                            <span className="flex items-center gap-1"><Compass size={12} className="text-slate-400" /> 方位角 (Azimuth)</span>
                            <span className="font-mono text-blue-600">{Math.round(azimuth)}°</span>
                        </div>
                        <p className="text-[10px] text-slate-400">控制阳光照射的罗盘方向（0° 北，90° 东，180° 南，270° 西）</p>
                        <div className="pt-1">
                            <input
                                type="range"
                                min="0"
                                max="360"
                                step="1"
                                value={azimuth}
                                onChange={(e) => setAzimuth(parseInt(e.target.value))}
                                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                        </div>
                    </div>

                    {/* Altitude */}
                    <div className="space-y-1 bg-slate-50 border border-slate-100/80 rounded-xl p-3">
                        <div className="flex justify-between text-xs font-bold text-slate-600">
                            <span>仰角 (Altitude / Elevation)</span>
                            <span className="font-mono text-blue-600">{Math.round(altitude)}°</span>
                        </div>
                        <p className="text-[10px] text-slate-400">控制太阳距离地平线的倾斜高度（0° 掠射地平，90° 直射头顶）</p>
                        <div className="pt-1">
                            <input
                                type="range"
                                min="5"
                                max="90"
                                step="1"
                                value={altitude}
                                onChange={(e) => setAltitude(parseInt(e.target.value))}
                                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                        </div>
                    </div>
                </div>

                {/* 4. Shadows Settings Overrides */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                        <span>阴影投射模式 (Shadow Cast)</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase ${shadowQuality !== 'off' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                            {shadowQuality !== 'off' ? 'Active' : 'Disabled'}
                        </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <button
                            type="button"
                            onClick={() => handleShadowToggle('high')}
                            className={`py-2 px-1 rounded-lg border text-xs font-bold transition-all ${shadowQuality === 'high' ? 'border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm' : 'border-slate-100 text-slate-500 hover:border-slate-200'}`}
                        >
                            高质量
                        </button>
                        <button
                            type="button"
                            onClick={() => handleShadowToggle('low')}
                            className={`py-2 px-1 rounded-lg border text-xs font-bold transition-all ${shadowQuality === 'low' ? 'border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm' : 'border-slate-100 text-slate-500 hover:border-slate-200'}`}
                        >
                            低质量
                        </button>
                        <button
                            type="button"
                            onClick={() => handleShadowToggle('off')}
                            className={`py-2 px-1 rounded-lg border text-xs font-bold transition-all ${shadowQuality === 'off' ? 'border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm' : 'border-slate-100 text-slate-500 hover:border-slate-200'}`}
                        >
                            无阴影
                        </button>
                    </div>
                </div>

            </div>
            
            <div className="p-3 bg-slate-50 border-t border-slate-100/80 text-[10px] text-slate-400 font-medium text-center">
                拖动滑块查看实时的日光漂移与光影阴影变化效果
            </div>
        </div>
    );
};

export default LightingSimulationPanel;
