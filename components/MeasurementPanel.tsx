
import React from 'react';
import { MeasurementResult } from '../types';
import { Trash2, Ruler, DraftingCompass, MapPin, Square } from 'lucide-react';
import { ifcManager } from '../services/ifcManager';

interface MeasurementPanelProps {
    measurements: MeasurementResult[];
    onClear?: () => void;
}

const MeasurementPanel: React.FC<MeasurementPanelProps> = ({ measurements, onClear }) => {
    
    const handleDelete = (id: string) => {
        ifcManager.measurementManager?.deleteMeasurement(id);
        ifcManager.renderScene();
    };

    const handleClearAll = () => {
        if (ifcManager.measurementManager) {
            ifcManager.measurementManager.clear();
            ifcManager.renderScene();
            if (onClear) onClear();
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'DISTANCE': return <Ruler size={14} />;
            case 'ANGLE': return <DraftingCompass size={14} />;
            case 'COORDINATE': return <MapPin size={14} />;
            case 'AREA': return <Square size={14} />;
            default: return <Ruler size={14} />;
        }
    };

    const getLabel = (type: string) => {
        switch (type) {
            case 'DISTANCE': return '距离测距';
            case 'ANGLE': return '角度测量';
            case 'COORDINATE': return '坐标拾取';
            case 'AREA': return '面积测量';
            default: return type;
        }
    };

    if (measurements.length === 0) {
        return (
            <div className="h-full flex flex-col panel-content">
                <div className="empty-state h-full">
                    <div style={{
                        width: 40,
                        height: 40,
                        borderRadius: 'var(--radius-lg)',
                        background: 'var(--surface-2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 8,
                    }}>
                        <Ruler size={18} style={{ color: 'var(--text-muted)' }} />
                    </div>
                    <span className="empty-state-title">暂无测量记录</span>
                    <span className="empty-state-desc">在下方工具栏中选择测量工具，并在模型表面单击取点进行测量。</span>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col panel-content select-none">
            {/* Header / Summary */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderBottom: '1px solid var(--border-soft)',
                background: 'var(--surface-1)',
            }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
                    测量结果列表
                </span>
                <span style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--brand)',
                    background: 'var(--brand-soft)',
                    border: '1px solid var(--brand-border)',
                    borderRadius: 99,
                    padding: '0 6px',
                    lineHeight: '18px',
                }}>
                    {measurements.length}
                </span>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {measurements.map(m => (
                    <div
                        key={m.id}
                        style={{
                            display: 'flex',
                            gap: 10,
                            padding: '10px 12px',
                            background: 'var(--surface-0)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-md)',
                            position: 'relative',
                            transition: 'border-color 0.15s, box-shadow 0.15s',
                        }}
                        onMouseEnter={e => {
                            (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-border)';
                            (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
                        }}
                        onMouseLeave={e => {
                            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                            (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                        }}
                    >
                        {/* Icon */}
                        <div style={{
                            width: 28,
                            height: 28,
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--brand-soft)',
                            border: '1px solid var(--brand-border)',
                            color: 'var(--brand)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            {getIcon(m.type)}
                        </div>

                        {/* Text */}
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
                                {getLabel(m.type)}
                            </span>
                            <span style={{
                                fontSize: 13,
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                color: 'var(--text-primary)',
                                whiteSpace: 'pre-wrap',
                            }}>
                                {m.value}
                            </span>
                        </div>

                        {/* Delete btn */}
                        <button
                            onClick={() => handleDelete(m.id)}
                            className="icon-button danger-button"
                            title="删除单条测量"
                            style={{
                                alignSelf: 'center',
                                width: 24,
                                height: 24,
                            }}
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Footer Clear btn */}
            <div style={{
                padding: '10px 12px',
                borderTop: '1px solid var(--border)',
                background: 'var(--surface-1)',
            }}>
                 <button
                    onClick={handleClearAll}
                    className="danger-primary-button"
                    style={{
                        width: '100%',
                        minHeight: 30,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        fontSize: 11,
                    }}
                 >
                     <Trash2 size={13} />
                     <span>清空所有测量记录</span>
                 </button>
            </div>
        </div>
    );
};

export default MeasurementPanel;
