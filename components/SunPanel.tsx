import React, { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import { ifcManager } from '../services/ifcManager';

interface SunPanelProps {
    onShadowQualityChange?: (quality: 'high' | 'low' | 'off') => void;
    currentShadowQuality?: 'high' | 'low' | 'off';
}

const SectionLabel = ({ label }: { label: string }) => (
    <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--text-secondary)',
        letterSpacing: '0.03em',
        textTransform: 'uppercase' as const,
        marginBottom: 8,
    }}>
        {label}
    </div>
);

const SunPanel: React.FC<SunPanelProps> = ({
    onShadowQualityChange,
    currentShadowQuality = 'off',
}) => {
    const [timeOfDay, setTimeOfDay] = useState<number>(12);
    const [azimuth, setAzimuth] = useState<number>(135);
    const [altitude, setAltitude] = useState<number>(45);
    const [shadowQuality, setShadowQuality] = useState<'high' | 'low' | 'off'>(currentShadowQuality);
    const [ambientIntensity, setAmbientIntensity] = useState<number>(ifcManager.ambientIntensity);
    const [sunIntensity, setSunIntensity] = useState<number>(ifcManager.sunIntensity);

    useEffect(() => {
        setShadowQuality(currentShadowQuality);
    }, [currentShadowQuality]);

    useEffect(() => {
        ifcManager.updateLighting(timeOfDay, azimuth, altitude);
    }, [timeOfDay, azimuth, altitude]);

    useEffect(() => {
        ifcManager.setAmbientIntensity(ambientIntensity);
    }, [ambientIntensity]);

    useEffect(() => {
        ifcManager.setSunIntensity(sunIntensity);
    }, [sunIntensity]);

    const applyPreset = (preset: 'sunrise' | 'noon' | 'sunset' | 'night') => {
        switch (preset) {
            case 'sunrise': setTimeOfDay(7.0);  setAzimuth(90);  setAltitude(15); break;
            case 'noon':    setTimeOfDay(12.0); setAzimuth(180); setAltitude(75); break;
            case 'sunset':  setTimeOfDay(17.5); setAzimuth(270); setAltitude(12); break;
            case 'night':   setTimeOfDay(21.0); setAzimuth(315); setAltitude(40); break;
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

    const formatTime = (time: number) => {
        const hours = Math.floor(time);
        const minutes = Math.floor((time - hours) * 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    };

    const isDay = timeOfDay >= 6 && timeOfDay <= 18;

    // Range slider style
    const rangeStyle: React.CSSProperties = {
        width: '100%',
        height: 4,
        borderRadius: 99,
        appearance: 'none' as any,
        cursor: 'pointer',
        background: 'var(--surface-2)',
        outline: 'none',
        accentColor: 'var(--brand)',
    };

    return (
        <div className="h-full flex flex-col panel-content select-none">
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* 1. Quick Presets */}
                <div>
                    <SectionLabel label="环境预设" />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                        {[
                            { id: 'sunrise', label: '日出', time: '07:00' },
                            { id: 'noon',    label: '正午', time: '12:00' },
                            { id: 'sunset',  label: '日落', time: '17:30' },
                            { id: 'night',   label: '月夜', time: '21:00' },
                        ].map(({ id, label, time }) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => applyPreset(id as any)}
                                className="option-button"
                                style={{ minHeight: 46, padding: '6px 4px', gap: 2 }}
                            >
                                <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{time}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* 2. Time Slider */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <SectionLabel label="时间模拟" />
                        <span style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 12,
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            color: 'var(--brand)',
                            background: 'var(--brand-soft)',
                            border: '1px solid var(--brand-border)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '2px 8px',
                        }}>
                            {isDay ? <Sun size={12} /> : <Moon size={12} />}
                            {formatTime(timeOfDay)}
                        </span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="23.9"
                        step="0.1"
                        value={timeOfDay}
                        onChange={(e) => setTimeOfDay(parseFloat(e.target.value))}
                        style={rangeStyle}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 4 }}>
                        <span>00:00</span>
                        <span>06:00</span>
                        <span>12:00</span>
                        <span>18:00</span>
                        <span>24:00</span>
                    </div>
                </div>

                {/* 3. Sun Position */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <SectionLabel label="光照角度" />

                    {/* Azimuth */}
                    <div className="control-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>方位角</span>
                            <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: 'var(--brand)' }}>{Math.round(azimuth)}°</span>
                        </div>
                        <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>0° 北 · 90° 东 · 180° 南 · 270° 西</p>
                        <input
                            type="range" min="0" max="360" step="1"
                            value={azimuth}
                            onChange={(e) => setAzimuth(parseInt(e.target.value))}
                            style={rangeStyle}
                        />
                    </div>

                    {/* Altitude */}
                    <div className="control-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>仰角</span>
                            <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: 'var(--brand)' }}>{Math.round(altitude)}°</span>
                        </div>
                        <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>0° 地平 · 90° 头顶</p>
                        <input
                            type="range" min="5" max="90" step="1"
                            value={altitude}
                            onChange={(e) => setAltitude(parseInt(e.target.value))}
                            style={rangeStyle}
                        />
                    </div>
                </div>

                {/* 4. Shadow Quality */}
                <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <SectionLabel label="阴影投射" />
                        <span className={`status-badge ${shadowQuality !== 'off' ? 'status-badge-on' : 'status-badge-off'}`}>
                            {shadowQuality !== 'off' ? '已开启' : '已关闭'}
                        </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                        {[
                            { key: 'high', label: '高质量' },
                            { key: 'low',  label: '低质量' },
                            { key: 'off',  label: '无阴影' },
                        ].map(({ key, label }) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => handleShadowToggle(key as any)}
                                className={`option-button ${shadowQuality === key ? 'option-button-active' : ''}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 5. Light Intensity */}
                <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <SectionLabel label="亮度调节" />
                    
                    {/* Ambient Intensity */}
                    <div className="control-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>环境光亮度</span>
                            <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: 'var(--brand)' }}>{ambientIntensity.toFixed(1)}</span>
                        </div>
                        <input
                            type="range" min="0" max="2" step="0.1"
                            value={ambientIntensity}
                            onChange={(e) => setAmbientIntensity(parseFloat(e.target.value))}
                            style={rangeStyle}
                        />
                    </div>

                    {/* Sunlight Intensity */}
                    <div className="control-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>太阳光强度</span>
                            <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: 'var(--brand)' }}>{sunIntensity.toFixed(1)}</span>
                        </div>
                        <input
                            type="range" min="0" max="3" step="0.1"
                            value={sunIntensity}
                            onChange={(e) => setSunIntensity(parseFloat(e.target.value))}
                            style={rangeStyle}
                        />
                    </div>
                </div>
            </div>

            <div style={{
                padding: '8px 14px',
                borderTop: '1px solid var(--border-soft)',
                background: 'var(--surface-1)',
                fontSize: 10,
                color: 'var(--text-muted)',
                textAlign: 'center',
            }}>
                拖动滑块实时预览日光漂移与阴影变化
            </div>
        </div>
    );
};

export default SunPanel;
