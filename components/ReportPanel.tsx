import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ifcManager } from '../services/ifcManager';
import { ReportConfig, ReportColumn, ReportFilter, ReportTemplate, ReportRow } from '../types';
import { 
    BarChart3, Play, Download, Upload, Plus, Trash2, 
    Search, FileSpreadsheet, Save, ChevronDown, ChevronUp, 
    Filter, HelpCircle, AlertCircle, RefreshCw, Layers
} from 'lucide-react';

// Built-in Presets
const PRESETS: ReportTemplate[] = [
    {
        id: 'tpl_count',
        title: '构件清单与数量统计',
        description: '按构件类型分组，统计各类型构件的个数',
        version: 1,
        config: {
            groupByField: 'type',
            columns: [
                { id: 'col_count', name: '构件数量', fieldMatch: '', aggregation: 'count', precision: 0, unit: '个' }
            ],
            filters: []
        }
    },
    {
        id: 'tpl_concrete',
        title: '结构混凝土工程量明细',
        description: '仅筛选结构构件，计算其总体积和总暴露面积',
        version: 1,
        config: {
            groupByField: 'type',
            columns: [
                { id: 'col_count', name: '构件数量', fieldMatch: '', aggregation: 'count', precision: 0, unit: '个' },
                { id: 'col_volume', name: '总体积', fieldMatch: 'Volume,体积,NetVolume', aggregation: 'sum', precision: 3, unit: 'm³' },
                { id: 'col_area', name: '总面积', fieldMatch: 'Area,面积,NetArea', aggregation: 'sum', precision: 2, unit: '㎡' }
            ],
            filters: [
                { id: 'f1', field: 'type', operator: 'contains', value: 'Wall,Slab,Beam,Column,Footing,柱,梁,板,墙' }
            ]
        }
    },
    {
        id: 'tpl_mep',
        title: '管线长度及规格汇总',
        description: '筛选机电管道分段，计算总长度及构件数量',
        version: 1,
        config: {
            groupByField: 'type',
            columns: [
                { id: 'col_len', name: '总长度', fieldMatch: 'Length,长度,NetLength', aggregation: 'sum', precision: 2, unit: 'm' },
                { id: 'col_count', name: '构件数量', fieldMatch: '', aggregation: 'count', precision: 0, unit: '个' }
            ],
            filters: [
                { id: 'f1', field: 'type', operator: 'contains', value: 'FlowSegment,Pipe,Duct,管,线' }
            ]
        }
    }
];

const ReportPanel: React.FC = () => {
    // Model state
    const [modelID, setModelID] = useState<number>(-1);
    const [availableProps, setAvailableProps] = useState<string[]>([]);
    
    // UI Expand states
    const [designerOpen, setDesignerOpen] = useState(true);
    const [activeTab, setActiveTab] = useState<'design' | 'templates'>('design');

    // Report Configuration states
    const [groupBy, setGroupBy] = useState('type');
    const [columns, setColumns] = useState<ReportColumn[]>([
        { id: 'c1', name: '构件数量', fieldMatch: '', aggregation: 'count', precision: 0, unit: '个' }
    ]);
    const [filters, setFilters] = useState<ReportFilter[]>([]);

    // Templates states
    const [savedTemplates, setSavedTemplates] = useState<ReportTemplate[]>([]);
    const [tplTitle, setTplTitle] = useState('');
    const [tplDesc, setTplDesc] = useState('');
    const [showSaveModal, setShowSaveModal] = useState(false);

    // Results states
    const [rows, setRows] = useState<ReportRow[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    
    // Selected row for highlighting tracking
    const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);

    // Auto-update model list
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

    // Fetch property keys for autocompletes
    useEffect(() => {
        if (modelID !== -1) {
            ifcManager.getAllPropertiesForStats(modelID).then(keys => {
                setAvailableProps(keys);
            }).catch(() => {
                setAvailableProps(['构件类型', '构件名称', '所在空间', '材质', 'Express ID']);
            });
        } else {
            setAvailableProps([]);
            setRows([]);
        }
    }, [modelID]);

    // Load templates from LocalStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('bimvision_report_templates');
        if (saved) {
            try {
                setSavedTemplates(JSON.parse(saved));
            } catch (e) {
                setSavedTemplates([]);
            }
        }
    }, []);

    const saveTemplatesToStorage = (tpls: ReportTemplate[]) => {
        setSavedTemplates(tpls);
        localStorage.setItem('bimvision_report_templates', JSON.stringify(tpls));
    };

    // Apply a configuration template
    const applyTemplate = (tpl: ReportTemplate) => {
        setGroupBy(tpl.config.groupByField);
        setColumns(tpl.config.columns.map(c => ({ ...c })));
        setFilters(tpl.config.filters ? tpl.config.filters.map(f => ({ ...f })) : []);
        setDesignerOpen(true);
        setActiveTab('design');
        setRows([]);
        setSelectedRowIndex(null);
    };

    // Columns config managers
    const addColumn = () => {
        const id = `col_${Date.now()}`;
        setColumns(prev => [...prev, { id, name: '新数据列', fieldMatch: '', aggregation: 'sum', precision: 2 }]);
    };

    const updateColumn = (id: string, key: keyof ReportColumn, val: any) => {
        setColumns(prev => prev.map(c => c.id === id ? { ...c, [key]: val } : c));
    };

    const removeColumn = (id: string) => {
        if (columns.length > 1) {
            setColumns(prev => prev.filter(c => c.id !== id));
        }
    };

    // Filters managers
    const addFilter = () => {
        const id = `f_${Date.now()}`;
        setFilters(prev => [...prev, { id, field: 'type', operator: 'contains', value: '' }]);
    };

    const updateFilter = (id: string, key: keyof ReportFilter, val: any) => {
        setFilters(prev => prev.map(f => f.id === id ? { ...f, [key]: val } : f));
    };

    const removeFilter = (id: string) => {
        setFilters(prev => prev.filter(f => f.id !== id));
    };

    // Run report calculation via Web Worker
    const runCalculation = async () => {
        if (modelID === -1) {
            setError('请先加载 BIM 模型文件！');
            return;
        }

        setIsLoading(true);
        setError(null);
        setSelectedRowIndex(null);

        const config: ReportConfig = {
            groupByField: groupBy,
            columns,
            filters
        };

        try {
            const results = await ifcManager.generateReport(modelID, config);
            setRows(results);
            setDesignerOpen(false); // Auto collapse designer on success to view table
        } catch (err: any) {
            setError(err.message || '计算报表失败，请检查配置条件或重试。');
        } finally {
            setIsLoading(false);
        }
    };

    // Template operations
    const handleSaveTemplate = (e: React.FormEvent) => {
        e.preventDefault();
        if (!tplTitle.trim()) return;

        const newTemplate: ReportTemplate = {
            id: `tpl_${Date.now()}`,
            title: tplTitle,
            description: tplDesc || undefined,
            version: 1,
            config: {
                groupByField: groupBy,
                columns,
                filters
            }
        };

        const updated = [...savedTemplates, newTemplate];
        saveTemplatesToStorage(updated);
        setTplTitle('');
        setTplDesc('');
        setShowSaveModal(false);
    };

    const handleImportTemplate = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const content = event.target?.result as string;
                const template = JSON.parse(content) as ReportTemplate;
                if (template && template.config && Array.isArray(template.config.columns)) {
                    applyTemplate(template);
                    setError(null);
                } else {
                    alert('导入失败：模板文件格式不符合规范！');
                }
            } catch (err) {
                alert('解析模板 JSON 失败！');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleExportTemplate = (tpl: ReportTemplate) => {
        const jsonStr = JSON.stringify(tpl, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ReportTemplate_${tpl.title.replace(/\s+/g, '_')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const deleteTemplate = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const updated = savedTemplates.filter(t => t.id !== id);
        saveTemplatesToStorage(updated);
    };

    // Export Table as CSV
    const exportCsv = () => {
        if (rows.length === 0) return;

        // Construct CSV header
        const headers = ['分类字段组', '构件数量', ...columns.map(c => `${c.name}${c.unit ? ` (${c.unit})` : ''}`)];
        
        // Construct CSV rows
        const csvLines = [headers.join(',')];
        rows.forEach(row => {
            const line = [
                `"${row.groupValue}"`,
                row.count,
                ...columns.map(c => row[c.id] ?? 0)
            ];
            csvLines.push(line.join(','));
        });

        const csvContent = '\uFEFF' + csvLines.join('\n'); // UTF-8 BOM for Excel Chinese support
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `QuantityTakeoff_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Handle 3D selection sync on click
    const handleRowClick = (index: number, row: ReportRow) => {
        setSelectedRowIndex(index);
        if (modelID !== -1 && row.expressIDs) {
            ifcManager.selectElementsByExpressIDs(modelID, row.expressIDs, false);
        }
    };

    const handleRowDoubleClick = (row: ReportRow) => {
        if (modelID !== -1 && row.expressIDs) {
            ifcManager.selectElementsByExpressIDs(modelID, row.expressIDs, true);
        }
    };

    // Sorting & Filtering computed rows
    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const filteredAndSortedRows = useMemo(() => {
        let list = [...rows];
        
        // Search filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter(r => String(r.groupValue).toLowerCase().includes(q));
        }

        // Sorters
        if (sortConfig) {
            list.sort((a, b) => {
                let valA: any = sortConfig.key === 'groupValue' ? a.groupValue : (a[sortConfig.key] ?? 0);
                let valB: any = sortConfig.key === 'groupValue' ? b.groupValue : (b[sortConfig.key] ?? 0);

                if (typeof valA === 'string') {
                    return sortConfig.direction === 'asc' 
                        ? String(valA).localeCompare(String(valB))
                        : String(valB).localeCompare(String(valA));
                } else {
                    return sortConfig.direction === 'asc' 
                        ? (valA as number) - (valB as number)
                        : (valB as number) - (valA as number);
                }
            });
        }

        return list;
    }, [rows, searchQuery, sortConfig]);

    if (modelID === -1) {
        return (
            <div className="h-full flex flex-col panel-content" onContextMenu={(e) => e.preventDefault()}>
                <div className="empty-state h-full">
                    <div style={{
                        width: 44, height: 44, borderRadius: 'var(--radius-lg)',
                        background: 'var(--surface-2)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', marginBottom: 12
                    }}>
                        <BarChart3 size={20} style={{ color: 'var(--text-muted)' }} />
                    </div>
                    <span className="empty-state-title">未加载 BIM 模型</span>
                    <span className="empty-state-desc">请拖入或在底栏中点击「加载」导入 IFC 模型，然后再启用报表设计器。</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full panel-content select-none" onContextMenu={(e) => e.preventDefault()}>
            
            {/* Header Tabs */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '4px 10px', borderBottom: '1px solid var(--border)', background: 'var(--surface-1)'
            }}>
                <div style={{ display: 'flex', gap: 4 }}>
                    <button 
                        type="button"
                        onClick={() => setActiveTab('design')}
                        className={`tab-btn ${activeTab === 'design' ? 'tab-btn-active' : ''}`}
                        style={{
                            padding: '6px 12px', fontSize: 11, fontWeight: 700, borderRadius: 'var(--radius-sm)',
                            border: 'none', cursor: 'pointer',
                            background: activeTab === 'design' ? 'var(--brand-soft)' : 'transparent',
                            color: activeTab === 'design' ? 'var(--brand)' : 'var(--text-secondary)'
                        }}
                    >
                        设计统计表
                    </button>
                    <button 
                        type="button"
                        onClick={() => setActiveTab('templates')}
                        className={`tab-btn ${activeTab === 'templates' ? 'tab-btn-active' : ''}`}
                        style={{
                            padding: '6px 12px', fontSize: 11, fontWeight: 700, borderRadius: 'var(--radius-sm)',
                            border: 'none', cursor: 'pointer',
                            background: activeTab === 'templates' ? 'var(--brand-soft)' : 'transparent',
                            color: activeTab === 'templates' ? 'var(--brand)' : 'var(--text-secondary)'
                        }}
                    >
                        模板库
                    </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {rows.length > 0 && (
                        <button 
                            type="button"
                            onClick={exportCsv}
                            className="icon-button text-emerald-600 dark:text-emerald-400"
                            title="导出为 CSV 表格"
                            style={{ width: 28, height: 28 }}
                        >
                            <FileSpreadsheet size={14} />
                        </button>
                    )}
                    {activeTab === 'design' && (
                        <button 
                            type="button"
                            onClick={() => setShowSaveModal(true)}
                            className="icon-button"
                            title="另存为报表模板"
                            style={{ width: 28, height: 28 }}
                        >
                            <Save size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Design & Configure Tab */}
            {activeTab === 'design' && (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    
                    {/* Collapsible Design Form */}
                    <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-0)' }}>
                        <button 
                            type="button"
                            onClick={() => setDesignerOpen(!designerOpen)}
                            style={{
                                width: '100%', padding: '8px 12px', display: 'flex', alignItems: 'center',
                                justifyContent: 'space-between', background: 'transparent', border: 'none', cursor: 'pointer'
                            }}
                        >
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Filter size={13} style={{ color: 'var(--brand)' }} />
                                设计器选项配置 {designerOpen ? '已展开' : '已收起'}
                            </span>
                            <ChevronDown size={14} style={{ 
                                color: 'var(--text-muted)', 
                                transform: designerOpen ? 'rotate(180deg)' : 'none',
                                transition: 'transform 0.2s' 
                            }} />
                        </button>
                        
                        {designerOpen && (
                            <div className="animate-fade-in-up" style={{ 
                                padding: '0 12px 12px 12px', display: 'flex', flexDirection: 'column', 
                                gap: 12, borderTop: '1px solid var(--border-soft)', maxHeight: 320, overflowY: 'auto' 
                            }}>
                                <div style={{ height: 4 }} />
                                
                                {/* Grouping */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>分组维度 (Group By)</label>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <select 
                                            value={['type', 'space', 'material'].includes(groupBy) ? groupBy : 'custom'}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                if (v !== 'custom') setGroupBy(v);
                                                else setGroupBy('Pset_WallCommon.LoadBearing');
                                            }}
                                            className="input-control"
                                            style={{ padding: '4px 8px', fontSize: 11, flex: 1 }}
                                        >
                                            <option value="type">按 构件类型 分组</option>
                                            <option value="space">按 楼层空间 分组</option>
                                            <option value="material">按 物理材质 分组</option>
                                            <option value="custom">按 自定义属性键 分组</option>
                                        </select>
                                        
                                        {!['type', 'space', 'material'].includes(groupBy) && (
                                            <input 
                                                type="text" 
                                                list="props-datalist"
                                                placeholder="自定义属性,如 Pset_WallCommon.LoadBearing"
                                                value={groupBy}
                                                onChange={(e) => setGroupBy(e.target.value)}
                                                className="input-control"
                                                style={{ padding: '4px 8px', fontSize: 11, flex: 1.2 }}
                                            />
                                        )}
                                    </div>
                                </div>

                                {/* Columns Configure */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>数据量度列 (Columns)</label>
                                        <button 
                                            type="button"
                                            onClick={addColumn}
                                            className="secondary-button"
                                            style={{ minHeight: 20, padding: '2px 8px', fontSize: 10, gap: 3 }}
                                        >
                                            <Plus size={11} /> 添加量度
                                        </button>
                                    </div>
                                    
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {columns.map((col, idx) => (
                                            <div key={col.id} style={{ 
                                                display: 'flex', gap: 4, background: 'var(--surface-1)', 
                                                padding: 6, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-soft)',
                                                alignItems: 'center' 
                                            }}>
                                                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, width: 14 }}>{idx + 1}</span>
                                                
                                                <input 
                                                    type="text" 
                                                    placeholder="列显示名"
                                                    value={col.name}
                                                    onChange={(e) => updateColumn(col.id, 'name', e.target.value)}
                                                    className="input-control"
                                                    style={{ padding: '3px 6px', fontSize: 11, width: 85 }}
                                                />
                                                
                                                <select 
                                                    value={col.aggregation}
                                                    onChange={(e) => updateColumn(col.id, 'aggregation', e.target.value)}
                                                    className="input-control"
                                                    style={{ padding: '3px 6px', fontSize: 11, width: 65 }}
                                                >
                                                    <option value="count">计数</option>
                                                    <option value="sum">求和</option>
                                                    <option value="avg">均值</option>
                                                    <option value="min">极小值</option>
                                                    <option value="max">极大值</option>
                                                </select>

                                                {col.aggregation !== 'count' && (
                                                    <input 
                                                        type="text"
                                                        list="props-datalist"
                                                        placeholder="匹配词, 如 Volume,体积"
                                                        value={col.fieldMatch}
                                                        onChange={(e) => updateColumn(col.id, 'fieldMatch', e.target.value)}
                                                        className="input-control"
                                                        style={{ padding: '3px 6px', fontSize: 11, flex: 1, minWidth: 80 }}
                                                    />
                                                )}

                                                <input 
                                                    type="text" 
                                                    placeholder="单位"
                                                    value={col.unit || ''}
                                                    onChange={(e) => updateColumn(col.id, 'unit', e.target.value)}
                                                    className="input-control"
                                                    style={{ padding: '3px 6px', fontSize: 11, width: 35 }}
                                                    title="列单位展示"
                                                />

                                                <input 
                                                    type="number" 
                                                    min={0}
                                                    max={5}
                                                    placeholder="精度"
                                                    value={col.precision}
                                                    onChange={(e) => updateColumn(col.id, 'precision', parseInt(e.target.value, 10) || 0)}
                                                    className="input-control"
                                                    style={{ padding: '3px 6px', fontSize: 11, width: 35 }}
                                                    title="保留小数位数"
                                                />

                                                <button 
                                                    type="button"
                                                    onClick={() => removeColumn(col.id)}
                                                    disabled={columns.length === 1}
                                                    className="icon-button danger-button"
                                                    style={{ width: 22, height: 22, opacity: columns.length === 1 ? 0.35 : 1 }}
                                                >
                                                    <Trash2 size={11} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Filters Configure */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>过滤器条件 (Filters - AND 逻辑)</label>
                                        <button 
                                            type="button"
                                            onClick={addFilter}
                                            className="secondary-button"
                                            style={{ minHeight: 20, padding: '2px 8px', fontSize: 10, gap: 3 }}
                                        >
                                            <Plus size={11} /> 添加过滤
                                        </button>
                                    </div>

                                    {filters.length === 0 ? (
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic', paddingLeft: 4 }}>
                                            暂无过滤条件（将扫描全量构件）
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            {filters.map(f => (
                                                <div key={f.id} style={{ 
                                                    display: 'flex', gap: 4, background: 'var(--surface-1)', 
                                                    padding: 6, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-soft)',
                                                    alignItems: 'center'
                                                }}>
                                                    <input 
                                                        type="text" 
                                                        list="props-datalist"
                                                        placeholder="过滤字段,如 type"
                                                        value={f.field}
                                                        onChange={(e) => updateFilter(f.id, 'field', e.target.value)}
                                                        className="input-control"
                                                        style={{ padding: '3px 6px', fontSize: 11, flex: 1 }}
                                                    />

                                                    <select 
                                                        value={f.operator}
                                                        onChange={(e) => updateFilter(f.id, 'operator', e.target.value)}
                                                        className="input-control"
                                                        style={{ padding: '3px 6px', fontSize: 11, width: 75 }}
                                                    >
                                                        <option value="contains">包含 (OR)</option>
                                                        <option value="equals">等于 (OR)</option>
                                                        <option value="startsWith">开始于</option>
                                                        <option value="exists">存在该属性</option>
                                                        <option value="greaterThan">&gt; 大于</option>
                                                        <option value="lessThan">&lt; 小于</option>
                                                    </select>

                                                    {f.operator !== 'exists' && (
                                                        <input 
                                                            type="text" 
                                                            placeholder="匹配值, 支持逗号"
                                                            value={f.value}
                                                            onChange={(e) => updateFilter(f.id, 'value', e.target.value)}
                                                            className="input-control"
                                                            style={{ padding: '3px 6px', fontSize: 11, flex: 1.2 }}
                                                        />
                                                    )}

                                                    <button 
                                                        type="button"
                                                        onClick={() => removeFilter(f.id)}
                                                        className="icon-button danger-button"
                                                        style={{ width: 22, height: 22 }}
                                                    >
                                                        <Trash2 size={11} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Run Button */}
                                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                    <button 
                                        type="button"
                                        onClick={runCalculation}
                                        disabled={isLoading}
                                        className="primary-button"
                                        style={{ flex: 1, minHeight: 32, gap: 6, fontSize: 12 }}
                                    >
                                        {isLoading ? (
                                            <>
                                                <RefreshCw size={13} className="animate-spin" />
                                                <span>正在分析模型计算中...</span>
                                            </>
                                        ) : (
                                            <>
                                                <Play size={13} fill="currentColor" />
                                                <span>开始生成工程量报表</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Results Table Section */}
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                        {error && (
                            <div style={{
                                margin: '10px 12px 0', padding: '8px 10px', background: 'var(--danger-soft)',
                                border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-md)',
                                display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--danger)'
                            }}>
                                <AlertCircle size={13} style={{ flexShrink: 0 }} />
                                <span>{error}</span>
                            </div>
                        )}

                        {rows.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                                {/* Search in computed rows */}
                                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-soft)', background: 'var(--surface-1)' }}>
                                    <div style={{ position: 'relative' }}>
                                        <input 
                                            type="text" 
                                            placeholder="在结果中过滤分组键..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="input-control"
                                            style={{ paddingLeft: 28, paddingTop: 4, paddingBottom: 4, fontSize: 11 }}
                                        />
                                        <Search size={12} style={{
                                            position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
                                            color: 'var(--text-muted)'
                                        }} />
                                    </div>
                                </div>

                                {/* Table Data */}
                                <div style={{ flex: 1, overflow: 'auto', background: 'var(--surface-0)' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: 'left' }}>
                                        <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-2)', zIndex: 10 }}>
                                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                                <th 
                                                    onClick={() => handleSort('groupValue')}
                                                    style={{ padding: '8px 10px', cursor: 'pointer', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}
                                                >
                                                    分组分类键
                                                </th>
                                                <th 
                                                    onClick={() => handleSort('count')}
                                                    style={{ padding: '8px 10px', cursor: 'pointer', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', textAlign: 'right' }}
                                                >
                                                    数量
                                                </th>
                                                {columns.map(col => (
                                                    <th 
                                                        key={col.id}
                                                        onClick={() => handleSort(col.id)}
                                                        style={{ padding: '8px 10px', cursor: 'pointer', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', textAlign: 'right' }}
                                                    >
                                                        {col.name}{col.unit ? ` (${col.unit})` : ''}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredAndSortedRows.map((row, idx) => (
                                                <tr 
                                                    key={idx}
                                                    onClick={() => handleRowClick(idx, row)}
                                                    onDoubleClick={() => handleRowDoubleClick(row)}
                                                    style={{ 
                                                        borderBottom: '1px solid var(--border-soft)',
                                                        cursor: 'pointer',
                                                        background: selectedRowIndex === idx ? 'var(--brand-soft)' : 'transparent',
                                                        transition: 'background 0.15s'
                                                    }}
                                                    className="hover:bg-slate-50 dark:hover:bg-slate-800"
                                                >
                                                    <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--text-primary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {row.groupValue}
                                                    </td>
                                                    <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', textAlign: 'right', fontWeight: 500 }}>
                                                        {row.count}
                                                    </td>
                                                    {columns.map(col => (
                                                        <td key={col.id} style={{ padding: '8px 10px', color: 'var(--text-secondary)', textAlign: 'right', fontWeight: 500 }}>
                                                            {row[col.id] ?? 0}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                
                                {/* Status info */}
                                <div style={{
                                    padding: '6px 12px', fontSize: 10, color: 'var(--text-muted)',
                                    borderTop: '1px solid var(--border)', background: 'var(--surface-1)',
                                    display: 'flex', justifyContent: 'space-between'
                                }}>
                                    <span>计算总行数：{rows.length} 行 (已过滤：{filteredAndSortedRows.length})</span>
                                    <span>提示：双击行可在 3D 视图中缩放聚焦</span>
                                </div>
                            </div>
                        ) : (
                            <div className="empty-state" style={{ flex: 1, paddingBottom: 40, paddingTop: 40 }}>
                                <div style={{
                                    width: 38, height: 38, borderRadius: 'var(--radius-lg)',
                                    background: 'var(--surface-2)', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', marginBottom: 10
                                }}>
                                    <Play size={16} style={{ color: 'var(--text-muted)' }} />
                                </div>
                                <span className="empty-state-title">未计算工程量</span>
                                <span className="empty-state-desc">配置上方设计器规则并点击「开始生成」进行汇总。</span>
                            </div>
                        )}
                    </div>

                </div>
            )}

            {/* Templates Library Tab */}
            {activeTab === 'templates' && (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: 12, gap: 14, overflowY: 'auto' }}>
                    
                    {/* Import from file */}
                    <div style={{ 
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                        padding: '10px 12px', background: 'var(--surface-1)', border: '1px solid var(--border)', 
                        borderRadius: 'var(--radius-md)' 
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>导入模板配置</span>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>从本地载入 `.json` 报表设计模板</span>
                        </div>
                        <label 
                            className="primary-button" 
                            style={{ padding: '4px 10px', fontSize: 11, minHeight: 26, cursor: 'pointer', gap: 4 }}
                        >
                            <Upload size={12} /> 导入模板
                            <input type="file" accept=".json" onChange={handleImportTemplate} className="hidden" />
                        </label>
                    </div>

                    {/* Standard Templates Presets */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Layers size={13} style={{ color: 'var(--brand)' }} />
                            系统内置工程量模板
                        </span>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {PRESETS.map(preset => (
                                <div 
                                    key={preset.id}
                                    onClick={() => applyTemplate(preset)}
                                    className="group"
                                    style={{
                                        padding: '10px 12px', background: 'var(--surface-0)', border: '1px solid var(--border)',
                                        borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'all 0.15s',
                                        display: 'flex', flexDirection: 'column', gap: 4
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
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{preset.title}</span>
                                        <span style={{ fontSize: 9, color: 'var(--brand)', background: 'var(--brand-soft)', border: '1px solid var(--brand-border)', borderRadius: 4, padding: '0 4px' }}>
                                            System
                                        </span>
                                    </div>
                                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{preset.description}</span>
                                    <div style={{ display: 'flex', gap: 6, fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
                                        <span>列数: {preset.config.columns.length}</span>
                                        <span>•</span>
                                        <span>过滤: {preset.config.filters.length > 0 ? '有' : '无'}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Custom Saved Templates */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
                            我的自定义模板 ({savedTemplates.length})
                        </span>
                        
                        {savedTemplates.length === 0 ? (
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic', padding: '10px 4px' }}>
                                暂无自定义模板。您可以在报表配置好后点击右上角的「另存为」保存到此处。
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {savedTemplates.map(tpl => (
                                    <div 
                                        key={tpl.id}
                                        onClick={() => applyTemplate(tpl)}
                                        style={{
                                            padding: '10px 12px', background: 'var(--surface-0)', border: '1px solid var(--border)',
                                            borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'all 0.15s',
                                            position: 'relative', display: 'flex', flexDirection: 'column', gap: 4
                                        }}
                                        onMouseEnter={e => {
                                            (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-border)';
                                        }}
                                        onMouseLeave={e => {
                                            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 60 }}>
                                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tpl.title}</span>
                                        </div>
                                        {tpl.description && (
                                            <span style={{ fontSize: 10, color: 'var(--text-secondary)', paddingRight: 60 }}>{tpl.description}</span>
                                        )}
                                        
                                        {/* Action buttons on the side */}
                                        <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 4 }}>
                                            <button 
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleExportTemplate(tpl); }}
                                                className="icon-button"
                                                title="导出模板到本地"
                                                style={{ width: 24, height: 24 }}
                                            >
                                                <Download size={11} />
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={(e) => deleteTemplate(tpl.id, e)}
                                                className="icon-button danger-button"
                                                title="删除该模板"
                                                style={{ width: 24, height: 24 }}
                                            >
                                                <Trash2 size={11} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                </div>
            )}

            {/* Save Template Modal */}
            {showSaveModal && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)',
                    backdropFilter: 'blur(2px)', zIndex: 100, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', padding: 16
                }}>
                    <form onSubmit={handleSaveTemplate} className="panel-surface animate-fade-in-up" style={{ width: '100%', maxWidth: 320, padding: 16 }}>
                        <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>另存为报表配置模板</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)' }}>模板名称 *</label>
                                <input 
                                    type="text" 
                                    required
                                    placeholder="如：二次结构工程量统计"
                                    value={tplTitle}
                                    onChange={(e) => setTplTitle(e.target.value)}
                                    className="input-control"
                                    style={{ padding: '5px 8px', fontSize: 11 }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)' }}>描述说明 (可选)</label>
                                <textarea 
                                    rows={2}
                                    placeholder="描述模板的作用或主要统计维度..."
                                    value={tplDesc}
                                    onChange={(e) => setTplDesc(e.target.value)}
                                    className="input-control"
                                    style={{ padding: '5px 8px', fontSize: 11, resize: 'none' }}
                                />
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button type="button" onClick={() => setShowSaveModal(false)} className="secondary-button" style={{ padding: '4px 10px', fontSize: 11, minHeight: 26 }}>取消</button>
                            <button type="submit" className="primary-button" style={{ padding: '4px 10px', fontSize: 11, minHeight: 26 }}>保存模板</button>
                        </div>
                    </form>
                </div>
            )}

            {/* Datalist for key suggestions */}
            <datalist id="props-datalist">
                {availableProps.map(k => (
                    <option key={k} value={k} />
                ))}
            </datalist>

        </div>
    );
};

export default ReportPanel;
