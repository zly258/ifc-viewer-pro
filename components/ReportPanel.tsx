import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ifcManager } from '../services/ifcManager';
import { ReportConfig, ReportColumn, ReportRow } from '../types';
import { useLanguage } from '../locales/LanguageContext';
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
                    style={{ padding: '6px 28px 6px 10px', fontSize: 12, width: '100%', boxSizing: 'border-box' }}
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
                    borderRadius: 'var(--radius-md)', background: 'var(--surface-1)', zIndex: 100,
                    boxShadow: 'var(--shadow-panel)', marginTop: 4
                }}>
                    {filteredOptions.map(opt => (
                        <button
                            key={opt}
                            type="button"
                            style={{
                                width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: 12,
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
    const { t } = useLanguage();
    const [modelID, setModelID] = useState<number>(-1);
    const [availableProps, setAvailableProps] = useState<string[]>([]);
    const [view, setView] = useState<'config' | 'result'>('config');
    
    const [columns, setColumns] = useState<ReportColumn[]>([
        { id: 'col_name', name: t.report.elementName, fieldMatch: 'Name,构件名称' },
        { id: 'col_type', name: t.report.elementType, fieldMatch: 'type,构件类型' }
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
        setColumns(prev => [...prev, { id, name: t.report.newColumn, fieldMatch: '' }]);
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
                    alert(t.report.invalidConfig);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const handleRowClick = (row: ReportRow, index: number) => {
        setSelectedRowIndex(index);
        if (row.expressID && modelID !== -1) {
            ifcManager.selectByID(modelID, row.expressID, false);
        }
    };

    const handleRowDoubleClick = (row: ReportRow) => {
        if (row.expressID && modelID !== -1) {
            ifcManager.selectByID(modelID, row.expressID, true);
        }
    };

    return (
        <div className="panel-content report-panel-container">
            {view === 'config' ? (
                <div className="report-config-container">
                    <div className="report-section-header">
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{t.report.columnConfig}</div>
                        <button onClick={addColumn} className="btn-primary">
                            <Plus size={14} /> {t.report.addColumn}
                        </button>
                    </div>

                    <div className="report-column-list">
                        {columns.map((col, idx) => (
                            <div key={col.id} className="report-column-item">
                                <div className="report-column-index">{idx + 1}</div>
                                <div className="report-column-inputs">
                                    <input 
                                        className="input-control report-column-input-name" 
                                        value={col.name} 
                                        onChange={e => updateColumn(col.id, { name: e.target.value })}
                                        placeholder={t.report.colDisplayName}
                                    />
                                    <SearchSelect 
                                        options={availableProps} 
                                        placeholder={t.report.colFieldMatch}
                                        onSelect={val => updateColumn(col.id, { fieldMatch: col.fieldMatch ? `${col.fieldMatch},${val}` : val })}
                                    />
                                </div>
                                <button onClick={() => removeColumn(col.id)} className="report-delete-btn">
                                    <X size={16} />
                                </button>
                            </div>
                        ))}
                        {columns.length === 0 && (
                            <div className="report-table-empty" style={{ padding: 12 }}>
                                {t.report.noColumns}
                            </div>
                        )}
                    </div>

                    <div className="report-footer">
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={importConfig} title={t.report.importConfig} className="btn-secondary">
                                <Upload size={14} /> {t.report.importConfig}
                            </button>
                            <button onClick={exportConfig} title={t.report.exportConfig} className="btn-secondary">
                                <Download size={14} /> {t.report.exportConfig}
                            </button>
                        </div>
                        <button 
                            onClick={generateReport} 
                            disabled={isLoading || modelID === -1 || columns.length === 0}
                            className="btn-primary btn-large"
                        >
                            {isLoading ? t.report.scanning : <><Play size={16} /> {t.report.generateReport}</>}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="report-result-wrapper">
                    <div className="report-table-container">
                        <div className="report-table-header">
                            <span className="report-table-header-title">{t.report.tableTitle} {rows.length > 0 && `(${rows.length} ${t.report.records})`}</span>
                        </div>

                        <div className="report-table-scroll">
                            <table className="report-table">
                                <thead>
                                    <tr>
                                        <th className="col-index">{t.report.index}</th>
                                        {columns.map(col => (
                                            <th key={col.id}>{col.name}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, rIdx) => (
                                        <tr 
                                            key={rIdx}
                                            onClick={() => handleRowClick(row, rIdx)}
                                            onDoubleClick={() => handleRowDoubleClick(row)}
                                            className={selectedRowIndex === rIdx ? 'row-selected' : (rIdx % 2 === 0 ? 'row-even' : 'row-odd')}
                                        >
                                            <td className="cell-index">{rIdx + 1}</td>
                                            {columns.map(col => (
                                                <td key={col.id}>
                                                    {row[col.id]}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                    {rows.length === 0 && !isLoading && (
                                        <tr>
                                            <td colSpan={columns.length + 1} className="report-table-empty">
                                                {t.report.noRecords}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="report-footer">
                        <button onClick={() => setView('config')} title={t.report.editConfig} className="btn-secondary">
                            <Edit size={14} /> {t.report.editConfig}
                        </button>
                        <button onClick={exportCsv} disabled={rows.length === 0} title={t.report.exportCsv} className="btn-secondary">
                            <FileSpreadsheet size={14} /> {t.report.exportCsv}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReportPanel;
