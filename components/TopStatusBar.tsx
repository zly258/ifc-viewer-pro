
import React, { useEffect, useState } from 'react';
import { ifcManager } from '../services/ifcManager';

interface TopStatusBarProps {
  fileName: string | null;
}

export const TopStatusBar = ({ fileName }: TopStatusBarProps) => {
    const [stats, setStats] = useState({ triangles: 0, geometries: 0, memory: 0 });

    useEffect(() => {
        const interval = setInterval(() => {
            const s = ifcManager.getStatistics();
            setStats(s);
        }, 1500);
        return () => clearInterval(interval);
    }, []);

    const hasModel = !!fileName;

    return (
        <div
            className="flex items-center justify-between px-5 select-none z-30 relative flex-shrink-0"
            style={{
                height: 'var(--topbar-h)',
                background: 'var(--surface-0)',
                borderBottom: '1px solid var(--border)',
            }}
        >
            {/* Left: Brand */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex items-center gap-0 leading-none">
                    <span style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        letterSpacing: '-0.02em',
                    }}>
                        BIMVision
                    </span>
                    <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'var(--brand)',
                        background: 'var(--brand-soft)',
                        border: '1px solid var(--brand-border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '1px 5px',
                        marginLeft: 6,
                        letterSpacing: '0.02em',
                    }}>
                        PRO
                    </span>
                </div>

                {/* File name pill */}
                {hasModel && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '2px 10px',
                        background: 'var(--surface-1)',
                        border: '1px solid var(--border)',
                        borderRadius: 99,
                        maxWidth: 280,
                    }}>
                        <span style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: '#22c55e',
                            flexShrink: 0,
                        }} />
                        <span style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'var(--text-secondary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}>
                            {fileName}
                        </span>
                    </div>
                )}
            </div>

            {/* Center: Tips (only when no model loaded) */}
            {!hasModel && (
                <div className="hidden lg:flex items-center justify-center gap-5 flex-1" style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                    {[
                        { key: '左键', action: '旋转' },
                        { key: '右键', action: '平移' },
                        { key: '滚轮', action: '缩放' },
                        { key: '单击', action: '选择' },
                    ].map(({ key, action }) => (
                        <div key={key} className="flex items-center gap-1.5">
                            <span style={{
                                background: 'var(--surface-1)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-sm)',
                                padding: '1px 7px',
                                fontSize: 11,
                                fontWeight: 600,
                                color: 'var(--text-secondary)',
                            }}>
                                {key}
                            </span>
                            <span>{action}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Center: Stats (only when model loaded) */}
            {hasModel && (
                <div className="hidden lg:flex items-center justify-center gap-4 flex-1">
                    {stats.triangles > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                            <span style={{ fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                                {stats.triangles >= 1000000
                                    ? `${(stats.triangles / 1000000).toFixed(2)}M`
                                    : `${(stats.triangles / 1000).toFixed(1)}k`}
                            </span>
                            {' '}三角面
                        </div>
                    )}
                    {stats.memory > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                            <span style={{ fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                                {stats.memory} MB
                            </span>
                            {' '}内存
                        </div>
                    )}
                </div>
            )}

            {/* Right: Version */}
            <div className="flex items-center justify-end flex-1 gap-3">
            </div>
        </div>
    );
};
