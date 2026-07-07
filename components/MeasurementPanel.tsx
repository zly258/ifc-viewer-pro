
import React from 'react';
import { MeasurementResult } from '../types';
import { Trash2, Ruler, DraftingCompass, MapPin, Square, Download } from 'lucide-react';
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

    const handleExportReport = () => {
        if (measurements.length === 0) return;
        
        let screenshotDataUrl = '';
        try {
            ifcManager.renderScene();
            screenshotDataUrl = ifcManager.renderer.domElement.toDataURL('image/png');
        } catch (e) {
            console.error('Failed to capture screenshot for report:', e);
        }

        const modelName = ifcManager.models.size === 1 ? Array.from(ifcManager.models.values())[0].name : '合并模型场景';
        const dateStr = new Date().toLocaleString();
        
        const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>BIMVision Pro - 测量报告</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #1e293b; line-height: 1.5; padding: 35px; background: #f8fafc; }
        .card { background: #ffffff; border-radius: 14px; box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.05), 0 4px 6px -4px rgb(0 0 0 / 0.05); padding: 32px; max-width: 800px; margin: 0 auto; border: 1px solid #e2e8f0; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #3b82f6; padding-bottom: 18px; margin-bottom: 26px; }
        .title { font-size: 22px; font-weight: 800; color: #1e3a8a; margin: 0; letter-spacing: -0.02em; }
        .meta-info { font-size: 12px; color: #64748b; text-align: right; line-height: 1.6; }
        .section-title { font-size: 14px; font-weight: 700; color: #334155; margin-top: 28px; margin-bottom: 14px; display: flex; align-items: center; gap: 6px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 28px; font-size: 13px; }
        th, td { padding: 12px 14px; text-align: left; border-bottom: 1px solid #e2e8f0; }
        th { background: #f8fafc; color: #475569; font-weight: 700; border-top: 1px solid #e2e8f0; }
        .value-text {  font-weight: 700; color: #0f172a; }
        .screenshot-container { width: 100%; border-radius: 10px; overflow: hidden; border: 1px solid #cbd5e1; background: #0f172a; margin-top: 14px; text-align: center; box-shadow: inset 0 2px 4px rgba(0,0,0,0.1); }
        .screenshot { max-width: 100%; max-height: 420px; display: block; margin: 0 auto; }
        .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; }
        .print-btn { padding: 9px 18px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 12px; box-shadow: 0 4px 6px -1px rgba(59,130,246,0.25); transition: all 0.15s ease; }
        .print-btn:hover { background: #2563eb; transform: translateY(-1px); }
        @media print {
            body { background: #ffffff; padding: 0; }
            .card { box-shadow: none; border: none; padding: 0; max-width: 100%; }
            .print-btn { display: none; }
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <div>
                <h1 class="title">BIMVision Pro 测量与分析报告</h1>
                <div style="font-size: 13px; color: #64748b; margin-top: 4px; font-weight: 500;">文件名称: ${modelName}</div>
            </div>
            <div class="meta-info">
                <div>导出时间: ${dateStr}</div>
                <div>报告编号: BIM-${Date.now().toString().slice(-6)}</div>
            </div>
        </div>

        <div class="section-title">📊 测量记录列表</div>
        <table>
            <thead>
                <tr>
                    <th style="width: 80px;">序号</th>
                    <th>测量类型</th>
                    <th>测量值</th>
                </tr>
            </thead>
            <tbody>
                ${measurements.map((m, idx) => `
                <tr>
                    <td>${idx + 1}</td>
                    <td style="font-weight: 600;">${getLabel(m.type)}</td>
                    <td class="value-text">${m.value.replace(/\n/g, '<br/>')}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>

        ${screenshotDataUrl ? `
        <div class="section-title">🖼️ 视点快照</div>
        <div class="screenshot-container">
            <img class="screenshot" src="${screenshotDataUrl}" alt="BIM Snapshot" />
        </div>
        ` : ''}

        <div style="margin-top: 28px; text-align: right;">
            <button class="print-btn" onclick="window.print()">🖨️ 打印报告 / 导出 PDF</button>
        </div>

        <div class="footer">
            此报告由 BIMVision Pro 平台自动生成。版权所有 © 2026.
        </div>
    </div>
</body>
</html>
        `;

        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `BIM-Measurement-Report-${Date.now().toString().slice(-5)}.html`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
                <button
                    onClick={handleExportReport}
                    className="icon-button"
                    title="导出 HTML 报告 (含三维快照)"
                    style={{ width: 24, height: 24 }}
                >
                    <Download size={12} />
                </button>
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
