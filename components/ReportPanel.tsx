import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ifcManager } from '../services/ifcManager';
import { ReportConfig, ReportColumn, ReportRow } from '../types';
import { 
    Play, Download, Upload, Edit, 
    FileSpreadsheet, ChevronDown, 
    X, Plus
} from 'lucide-react';

interface SearchSelectProps {
    options: string[];
    placeholder: string;
    onSelect: (val: string) => void;
    exclude?: string[];
}

const SearchSelect: React.FC<SearchSelectProps> = ({ options, placeholder, onSelect, exclude = [] }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    const filteredOptions = useMemo(() => {
        const query = search.toLowerCase().trim();
        return options.filter(opt => {
            if (exclude.includes(opt)) return false;
            return !query || opt.toLowerCase().includes(query);
        }).slice(0, 100);
    }, [options, search, exclude]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div ref={ref} style={{ position: 'relative', width: '100%' }}>
            <div style={{ position: 'relative' }}>
                <input
                    type="text"
                    placeholder={placeholder}
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setIsOpen(true); }}
                    onFocus={() => setIsOpen(true)}
                    className="input-control"
                    style={{ paddingRight: 24, fontSize: 12, width: '100%', boxSizing: 'border-box' }}
                />
                <ChevronDown 
                    size={14} 
                    style={{ 
                        position: 'absolute', right: 8, top: '50%', 
                        color: 'var(--text-muted)', cursor: 'pointer',
                        transform: isOpen ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)',
                        transition: 'transform 0.2s'
                    }}
                    onClick={() => setIsOpen(!isOpen)}
                />
            </div>
            {isOpen && filteredOptions.length > 0 && (
                <div style={{
                    position: 'absolute', left: 0, right: 0, top: '100%',
                    maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', background: 'var(--surface-1)', zIndex: 100,
                    boxShadow: 'var(--shadow-panel)', marginTop: 4
                }}>
                    {filteredOptions.map(opt => (
                        <button
                            key={opt}
                            type="button"
                            style={{
                                width: '100%', textAlign: 'left', padding: '8px 10px', fontSize: 12,
                                border: 'none', background: 'transparent', cursor: 'pointer',
                                color: 'var(--text-primary)', transition: 'background 0.1s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--brand-soft)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            onClick={() => {
                                onSelect(opt);
                                setSearch('');
                                setIsOpen(false);
                            }}
                        >
                            {opt}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

const ReportPanel: React.FC = () => {
    const [modelID, setModelID] = useState<number>(-1);
    const [availableProps, setAvailableProps] = useState<string[]>([]);
    const [view, setView] = useState<'config' | 'result'>('config');
    
    const [columns, setColumns] = useState<ReportColumn[]>([
        { id: 'col_name', name: '构件名称', fieldMatch: 'Name,构件名称' },
        { id: 'col_type', name: '类型', fieldMatch: 'type,构件类型' }
    ]);

    const [rows, setRows] = useState<ReportRow[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);

    useEffect(() => {
        const updateModelID = () => {
            const models = Array.from(ifcManager.models.keys());
            if (models.length > 0 && modelID === -1) {
                setModelID(models[0]);
            } else if (models.length === 0) {
                setModelID(-1);
            }
        };

        updateModelID();
        const interval = setInterval(updateModelID, 1500);
        return () => clearInterval(interval);
    }, [modelID]);

    useEffect(() => {
        if (modelID !== -1) {
            ifcManager.getAllPropertiesForStats(modelID).then(keys => {
                setAvailableProps(keys);
            }).catch(() => {
                setAvailableProps(['type', 'name']);
            });
        } else {
            setAvailableProps([]);
            setRows([]);
        }
    }, [modelID]);

    const addColumn = () => {
        const id = `col_${Date.now()}`;
        setColumns(prev => [...prev, { id, name: '新列', fieldMatch: '' }]);
    };

    const updateColumn = (id: string, updates: Partial<ReportColumn>) => {
        setColumns(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    };

    const removeColumn = (id: string) => {
        setColumns(prev => prev.filter(c => c.id !== id));
    };

    const generateReport = async () => {
        if (modelID === -1) return;
        setIsLoading(true);
        setRows([]);

        try {
            const config: ReportConfig = { columns };
            const result = await ifcManager.generateReport(modelID, config);
            setRows(result);
            setView('result');
        } catch (e) {
            console.error('Failed to generate report', e);
        } finally {
            setIsLoading(false);
        }
    };

    const exportCsv = () => {
        if (rows.length === 0) return;
        const header = columns.map(c => `"${c.name}"`).join(',');
        const csvRows = rows.map(r => {
            return columns.map(c => {
                let v = r[c.id];
                if (v === undefined || v === null) v = '';
                return `"${String(v).replace(/"/g, '""')}"`;
            }).join(',');
        });
        const csvContent = "\uFEFF" + header + '\n' + csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `BIM_Report_${new Date().getTime()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const exportConfig = () => {
        const configJson = JSON.stringify(columns, null, 2);
        const blob = new Blob([configJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Report_Config.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const importConfig = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = (e: any) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const parsed = JSON.parse(ev.target?.result as string);
                    if (Array.isArray(parsed)) {
                        setColumns(parsed);
                    }
                } catch (err) {
                    alert("配置文件格式不正确");
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const handleRowClick = (row: ReportRow, index: number) => {
        setSelectedRowIndex(index);
        if (row.expressID && modelID !== -1) {
            ifcManager.selectElement(modelID, row.expressID, false);
            ifcManager.highlightElement(modelID, row.expressID, undefined, false);
        }
    };

    const handleRowDoubleClick = (row: ReportRow) => {
        if (row.expressID && modelID !== -1) {
            ifcManager.focusOnElements(modelID, [row.expressID]);
        }
    };

    return (
        <div className="panel-content" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
            {/* Header Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>工程量报表</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                    {view === 'config' ? (
                        <>
                            <button onClick={importConfig} title="导入列配置" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', fontSize: 12, background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-primary)' }}>
                                <Upload size={14} /> 导入配置
                            </button>
                            <button onClick={exportConfig} title="导出当前列配置" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', fontSize: 12, background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-primary)' }}>
                                <Download size={14} /> 导出配置
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={() => setView('config')} title="编辑配置" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', fontSize: 12, background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-primary)' }}>
                                <Edit size={14} /> 修改配置
                            </button>
                            <button onClick={exportCsv} disabled={rows.length === 0} title="导出CSV电子表格" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', fontSize: 12, background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-primary)', opacity: rows.length === 0 ? 0.5 : 1 }}>
                                <FileSpreadsheet size={14} /> 导出为 CSV
                            </button>
                        </>
                    )}
                </div>
            </div>

            {view === 'config' ? (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: 'var(--surface-2)', padding: 16, borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>表格列配置</div>
                        <button 
                            onClick={addColumn} 
                            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--brand)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 12 }}
                        >
                            <Plus size={14} /> 添加列
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflow: 'auto', paddingRight: 4 }}>
                        {columns.map((col, idx) => (
                            <div key={col.id} style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--surface-1)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', width: 20 }}>{idx + 1}</div>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <input 
                                        className="input-control" 
                                        value={col.name} 
                                        onChange={e => updateColumn(col.id, { name: e.target.value })}
                                        placeholder="表头显示名称 (例如：体积)"
                                        style={{ fontSize: 12, padding: '4px 8px' }}
                                    />
                                    <SearchSelect 
                                        options={availableProps} 
                                        placeholder="匹配的 IFC 字段名 (可多写，逗号分隔)"
                                        onSelect={val => updateColumn(col.id, { fieldMatch: col.fieldMatch ? `${col.fieldMatch},${val}` : val })}
                                    />
                                </div>
                                <button onClick={() => removeColumn(col.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 4 }}>
                                    <X size={16} />
                                </button>
                            </div>
                        ))}
                        {columns.length === 0 && (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>
                                尚未添加任何表格列
                            </div>
                        )}
                    </div>

                    <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                        <button 
                            onClick={generateReport} 
                            disabled={isLoading || modelID === -1 || columns.length === 0}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--brand)', color: 'white', border: 'none', padding: '8px 24px', fontWeight: 600, borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13, opacity: (isLoading || modelID === -1 || columns.length === 0) ? 0.5 : 1 }}
                        >
                            {isLoading ? '扫描中...' : <><Play size={16} /> 生成报表</>}
                        </button>
                    </div>
                </div>
            ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>统计结果 {rows.length > 0 && `(${rows.length} 条记录)`}</span>
                    </div>

                    <div style={{ flex: 1, overflow: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-2)', zIndex: 10 }}>
                                <tr>
                                    <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', textAlign: 'left', width: 60 }}>序号</th>
                                    {columns.map(col => (
                                        <th key={col.id} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                                            {col.name}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, rIdx) => (
                                    <tr 
                                        key={rIdx}
                                        onClick={() => handleRowClick(row, rIdx)}
                                        onDoubleClick={() => handleRowDoubleClick(row)}
                                        style={{ 
                                            cursor: 'pointer',
                                            background: selectedRowIndex === rIdx ? 'var(--brand-soft)' : (rIdx % 2 === 0 ? 'var(--surface-1)' : 'transparent'),
                                            borderBottom: '1px solid var(--border-light)'
                                        }}
                                    >
                                        <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{rIdx + 1}</td>
                                        {columns.map(col => (
                                            <td key={col.id} style={{ padding: '8px 12px' }}>
                                                {row[col.id]}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                                {rows.length === 0 && !isLoading && (
                                    <tr>
                                        <td colSpan={columns.length + 1} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                                            未找到任何记录
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReportPanel;
