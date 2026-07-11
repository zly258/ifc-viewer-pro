import React, { useState, useEffect, useMemo } from 'react';
import { ifcManager } from '../services/ifcManager';
import { ReportConfig, ReportColumn, ReportFilter, ReportTemplate, ReportRow } from '../types';
import { 
    BarChart3, Play, Download, Upload, Trash2, 
    Search, FileSpreadsheet, Save, ChevronDown, 
    Filter, Layers, Settings, X, AlertCircle, RefreshCw
} from 'lucide-react';

// Built-in templates
const PRESETS: ReportTemplate[] = [
    {
        id: 'tpl_count',
        title: '构件清单与数量统计',
        description: '按构件类型分组，统计各类型构件的个数',
        version: 2,
        config: {
            mode: 'summary',
            groupByFields: ['type'],
            columns: [
                { id: 'col_count', name: '数量', fieldMatch: 'type', aggregation: 'count', precision: 0, unit: '个' }
            ],
            filters: []
        }
    },
    {
        id: 'tpl_concrete',
        title: '结构混凝土工程量汇总',
        description: '先按空间再按类型分组，统计结构物体的体积与面积',
        version: 2,
        config: {
            mode: 'summary',
            groupByFields: ['space', 'type'],
            columns: [
                { id: 'col_volume', name: '体积', fieldMatch: 'Volume,体积,NetVolume', aggregation: 'sum', precision: 3, unit: 'm³' },
                { id: 'col_area', name: '暴露面积', fieldMatch: 'Area,面积,NetArea', aggregation: 'sum', precision: 2, unit: '㎡' }
            ],
            filters: [
                { id: 'f1', field: 'type', operator: 'contains', value: 'Wall,Slab,Beam,Column,Footing,柱,梁,板,墙' }
            ]
        }
    },
    {
        id: 'tpl_detail_list',
        title: '全部墙体清单明细',
        description: '详细列出所有墙体构件的个体体积与长度，直接追溯 3D 构件',
        version: 2,
        config: {
            mode: 'detail',
            groupByFields: [],
            columns: [
                { id: 'col_type', name: '类型', fieldMatch: 'type', aggregation: 'none', precision: 0 },
                { id: 'col_vol', name: '设计体积', fieldMatch: 'Volume,体积', aggregation: 'none', precision: 3, unit: 'm³' },
                { id: 'col_len', name: '设计长度', fieldMatch: 'Length,长度', aggregation: 'none', precision: 2, unit: 'm' }
            ],
            filters: [
                { id: 'f1', field: 'type', operator: 'contains', value: 'Wall,墙' }
            ]
        }
    }
];

const ReportPanel: React.FC = () => {
    // Current Model ID
    const [modelID, setModelID] = useState<number>(-1);
    const [availableProps, setAvailableProps] = useState<string[]>([]);
    
    // UI Expand / Navigation states
    const [designerOpen, setDesignerOpen] = useState(true);
    const [activeTab, setActiveTab] = useState<'design' | 'templates'>('design');

    // Report configuration states
    const [mode, setMode] = useState<'detail' | 'summary'>('summary');
    const [groupByFields, setGroupByFields] = useState<string[]>(['space', 'type']);
    const [columns, setColumns] = useState<ReportColumn[]>([
        { id: 'col_vol', name: '总体积', fieldMatch: 'Volume,体积,NetVolume', aggregation: 'sum', precision: 3, unit: 'm³' }
    ]);
    const [filters, setFilters] = useState<ReportFilter[]>([]);

    // Column Config Popup / Drawer state
    const [editingColumnId, setEditingColumnId] = useState<string | null>(null);

    // Templates LocalStorage states
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
    
    // Property checklist search filter
    const [propSearch, setPropSearch] = useState('');
    const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);

    // Auto-detect loaded model
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

    // Retrieve property names list
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

    // Apply template configuration
    const applyTemplate = (tpl: ReportTemplate) => {
        setMode(tpl.config.mode || 'summary');
        setGroupByFields(tpl.config.groupByFields || []);
        setColumns(tpl.config.columns.map(c => ({ ...c })));
        setFilters(tpl.config.filters ? tpl.config.filters.map(f => ({ ...f })) : []);
        setDesignerOpen(true);
        setActiveTab('design');
        setRows([]);
        setSelectedRowIndex(null);
    };

    // Checkbox togglers for Group By Fields
    const toggleGroupByField = (field: string) => {
        setGroupByFields(prev => {
            if (prev.includes(field)) {
                return prev.filter(f => f !== field);
            } else {
                return [...prev, field];
            }
        });
    };

    // Auto Column Generation on checking properties
    const handleToggleColumnProperty = (propName: string, isChecked: boolean) => {
        if (isChecked) {
            // Add column configuration
            const id = `col_${propName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
            // Set default aggregation: count for Express ID / type / name, otherwise sum for numbers in summary mode
            let defaultAgg: 'sum' | 'count' | 'avg' | 'none' = 'sum';
            if (mode === 'detail') {
                defaultAgg = 'none';
            } else if (['type', 'name', 'space', 'material', '构件类型', '构件名称', '所在空间', '材质', 'Express ID'].includes(propName)) {
                defaultAgg = 'count';
            }

            // Detect unit
            let defaultUnit = '';
            if (propName.toLowerCase().includes('volume') || propName.includes('体积')) defaultUnit = 'm³';
            else if (propName.toLowerCase().includes('area') || propName.includes('面积')) defaultUnit = '㎡';
            else if (propName.toLowerCase().includes('length') || propName.includes('长度') || propName.includes('高度') || propName.includes('height')) defaultUnit = 'm';

            const newCol: ReportColumn = {
                id,
                name: propName,
                fieldMatch: propName,
                aggregation: defaultAgg,
                precision: ['volume', '体积', 'area', '面积'].some(k => propName.toLowerCase().includes(k)) ? 3 : 2,
                unit: defaultUnit || undefined
            };
            setColumns(prev => [...prev, newCol]);
        } else {
            // Remove column config matching the fieldMatch
            setColumns(prev => prev.filter(c => c.fieldMatch !== propName));
            if (editingColumnId && columns.find(c => c.fieldMatch === propName)?.id === editingColumnId) {
                setEditingColumnId(null);
            }
        }
    };

    // Column Config Modifier
    const updateColumn = (id: string, key: keyof ReportColumn, val: any) => {
        setColumns(prev => prev.map(c => c.id === id ? { ...c, [key]: val } : c));
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

    // Run report analysis on Worker
    const runCalculation = async () => {
        if (modelID === -1) {
            setError('请加载 BIM 模型后再试！');
            return;
        }

        setIsLoading(true);
        setError(null);
        setSelectedRowIndex(null);

        const config: ReportConfig = {
            mode,
            groupByFields,
            columns,
            filters
        };

        try {
            const results = await ifcManager.generateReport(modelID, config);
            setRows(results);
            setDesignerOpen(false); // Auto collapse designer on success
        } catch (err: any) {
            setError(err.message || '计算报表失败，请检查配置。');
        } finally {
            setIsLoading(false);
        }
    };

    // Save configuration template
    const handleSaveTemplate = (e: React.FormEvent) => {
        e.preventDefault();
        if (!tplTitle.trim()) return;

        const newTemplate: ReportTemplate = {
            id: `tpl_${Date.now()}`,
            title: tplTitle,
            description: tplDesc || undefined,
            version: 2,
            config: {
                mode,
                groupByFields,
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
                    alert('导入失败：不是合法的 BIM 报表模板！');
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
        a.download = `TakeoffTemplate_${tpl.title.replace(/\s+/g, '_')}.json`;
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

        // Header builder
        const firstColName = mode === 'detail' ? '构件详细名称' : '嵌套分组级次 (' + groupByFields.join(' > ') + ')';
        const headers = [firstColName, ...(mode === 'summary' ? ['数量'] : []), ...columns.map(c => `${c.name}${c.unit ? ` (${c.unit})` : ''}`)];
        
        // Lines builder
        const csvLines = [headers.join(',')];
        rows.forEach(row => {
            const line = [
                `"${row.groupValue}"`,
                ...(mode === 'summary' ? [row.count] : []),
                ...columns.map(c => row[c.id] ?? '-')
            ];
            csvLines.push(line.join(','));
        });

        const csvContent = '\uFEFF' + csvLines.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `BIMTakeoff_${mode === 'detail' ? 'Detail' : 'Summary'}_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Sync elements click selection with 3D scene
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

    // Sort computed rows
    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    // Search and Sort Rows Memo
    const filteredAndSortedRows = useMemo(() => {
        let list = [...rows];
        
        // Search
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter(r => String(r.groupValue).toLowerCase().includes(q));
        }

        // Sort
        if (sortConfig) {
            list.sort((a, b) => {
                let valA: any = sortConfig.key === 'groupValue' ? a.groupValue : (a[sortConfig.key] ?? 0);
                let valB: any = sortConfig.key === 'groupValue' ? b.groupValue : (b[sortConfig.key] ?? 0);

                if (typeof valA === 'string') {
                    return sortConfig.direction === 'asc' 
                        ? String(valA).localeCompare(String(valB))
                        : String(valB).localeCompare(String(valA));
                } else {
                    const numA = typeof valA === 'number' ? valA : parseFloat(String(valA).replace(/[^\d.-]/g, '')) || 0;
                    const numB = typeof valB === 'number' ? valB : parseFloat(String(valB).replace(/[^\d.-]/g, '')) || 0;
                    return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
                }
            });
        }

        return list;
    }, [rows, searchQuery, sortConfig]);

    // Compute column totals row
    const totalRow = useMemo(() => {
        if (filteredAndSortedRows.length === 0) return null;

        const total: Record<string, any> = {
            groupValue: '合计 (Total)',
            count: filteredAndSortedRows.reduce((acc, r) => acc + (r.count || 0), 0)
        };

        columns.forEach(col => {
            const vals = filteredAndSortedRows
                .map(r => r[col.id])
                .filter(v => typeof v === 'number' && !isNaN(v)) as number[];

            if (vals.length > 0) {
                if (col.aggregation === 'avg') {
                    const sum = vals.reduce((a, b) => a + b, 0);
                    total[col.id] = parseFloat((sum / vals.length).toFixed(col.precision));
                } else if (col.aggregation === 'min') {
                    total[col.id] = Math.min(...vals);
                } else if (col.aggregation === 'max') {
                    total[col.id] = Math.max(...vals);
                } else if (col.aggregation === 'count') {
                    total[col.id] = vals.length;
                } else {
                    // Default to sum
                    const sum = vals.reduce((a, b) => a + b, 0);
                    total[col.id] = parseFloat(sum.toFixed(col.precision));
                }
            } else {
                total[col.id] = '-';
            }
        });

        return total;
    }, [filteredAndSortedRows, columns]);

    // Categorized properties for checklist selection
    const categorizedProps = useMemo(() => {
        const result = {
            common: [] as string[],
            custom: [] as string[]
        };

        const commonKeys = ['volume', '体积', 'area', '面积', 'length', '长度', 'height', '高度', 'width', '宽度', 'thickness', '厚度', 'type', 'space', 'material', '构件类型', '构件名称', '所在空间', '材质', 'Express ID'];
        
        availableProps.forEach(prop => {
            const match = propSearch.toLowerCase().trim();
            if (match && !prop.toLowerCase().includes(match)) return;

            const isCommon = commonKeys.some(ck => prop.toLowerCase().includes(ck));
            if (isCommon) {
                result.common.push(prop);
            } else {
                result.custom.push(prop);
            }
        });

        // Deduplicate and sort
        result.common = Array.from(new Set(result.common)).sort();
        result.custom = Array.from(new Set(result.custom)).sort();

        return result;
    }, [availableProps, propSearch]);

    // Helper: check if a property is already configured as a column
    const isPropChecked = (propName: string) => {
        return columns.some(c => c.fieldMatch === propName);
    };

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
                    <span className="empty-state-desc">请拖入或在底栏中点击「加载」导入 IFC 模型，然后再启用清单设计器。</span>
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
                        清单设计器
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
                        模板预设
                    </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {rows.length > 0 && (
                        <button 
                            type="button"
                            onClick={exportCsv}
                            className="icon-button text-emerald-600 dark:text-emerald-400"
                            title="一键导出为 CSV 电子表格"
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
                            title="将当前设计存为自定义模板"
                            style={{ width: 28, height: 28 }}
                        >
                            <Save size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Design Config Tab */}
            {activeTab === 'design' && (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    
                    {/* Collapsible Config Options */}
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
                                报表计算规则 {designerOpen ? '已展开' : '已收起'}
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
                                gap: 12, borderTop: '1px solid var(--border-soft)', maxHeight: 310, overflowY: 'auto' 
                            }}>
                                <div style={{ height: 4 }} />

                                {/* 1. Mode selection */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>报表呈现模式</label>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {[
                                            { val: 'detail', label: '清单明细模式 (一物一行，直接追溯)' },
                                            { val: 'summary', label: '分组汇总模式 (条件归类，分组求和)' },
                                        ].map(({ val, label }) => (
                                            <button
                                                key={val}
                                                type="button"
                                                onClick={() => {
                                                    setMode(val as any);
                                                    // Reset column aggregations accordingly
                                                    setColumns(prev => prev.map(c => ({
                                                        ...c,
                                                        aggregation: val === 'detail' ? 'none' : (c.aggregation === 'none' ? 'sum' : c.aggregation)
                                                    })));
                                                }}
                                                className={`option-button ${mode === val ? 'option-button-active' : ''}`}
                                                style={{ flex: 1, padding: '6px 8px', fontSize: 11, textAlign: 'center' }}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* 2. Multi-level Grouping (Only shown in summary mode) */}
                                {mode === 'summary' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--surface-1)', padding: 8, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-soft)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>多级分组依赖 (勾选顺序决定层级)</label>
                                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>当前层级：{groupByFields.length > 0 ? groupByFields.map(f => {
                                                if (f === 'type') return '构件类型';
                                                if (f === 'space') return '所在空间';
                                                if (f === 'material') return '物理材质';
                                                return f;
                                            }).join(' > ') : '未选择 (默认按构件类型)'}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: 14 }}>
                                            {[
                                                { key: 'space', label: '楼层空间' },
                                                { key: 'type', label: '构件类型' },
                                                { key: 'material', label: '物理材质' }
                                            ].map(opt => (
                                                <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', color: 'var(--text-primary)' }}>
                                                    <input 
                                                        type="checkbox"
                                                        checked={groupByFields.includes(opt.key)}
                                                        onChange={() => toggleGroupByField(opt.key)}
                                                        style={{ cursor: 'pointer' }}
                                                    />
                                                    <span>{opt.label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* 3. Select columns from scanned properties checkboxes */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>勾选属性加入报表列 (Check Columns)</label>
                                    
                                    {/* Search Property List */}
                                    <div style={{ position: 'relative' }}>
                                        <input 
                                            type="text"
                                            placeholder="输入关键字检索可用属性（如体积、长度、LoadBearing）..."
                                            value={propSearch}
                                            onChange={(e) => setPropSearch(e.target.value)}
                                            className="input-control"
                                            style={{ paddingLeft: 28, paddingTop: 4, paddingBottom: 4, fontSize: 11 }}
                                        />
                                        <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                    </div>

                                    {/* Scrollable checklists */}
                                    <div style={{ 
                                        maxHeight: 120, overflowY: 'auto', border: '1px solid var(--border-soft)', 
                                        borderRadius: 'var(--radius-sm)', padding: 8, background: 'var(--surface-1)',
                                        display: 'flex', flexDirection: 'column', gap: 8
                                    }}>
                                        {/* Common metrics */}
                                        {categorizedProps.common.length > 0 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, borderBottom: '1px solid var(--border-soft)', paddingBottom: 2 }}>常用几何参数与基础属性</span>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px' }}>
                                                    {categorizedProps.common.map(prop => (
                                                        <label key={prop} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', color: 'var(--text-primary)' }}>
                                                            <input 
                                                                type="checkbox"
                                                                checked={isPropChecked(prop)}
                                                                onChange={(e) => handleToggleColumnProperty(prop, e.target.checked)}
                                                                style={{ cursor: 'pointer' }}
                                                            />
                                                            <span>{prop}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Custom props */}
                                        {categorizedProps.custom.length > 0 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                                                <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, borderBottom: '1px solid var(--border-soft)', paddingBottom: 2 }}>扫描到的自定义集属性 (Pset)</span>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px' }}>
                                                    {categorizedProps.custom.map(prop => (
                                                        <label key={prop} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', color: 'var(--text-primary)' }}>
                                                            <input 
                                                                type="checkbox"
                                                                checked={isPropChecked(prop)}
                                                                onChange={(e) => handleToggleColumnProperty(prop, e.target.checked)}
                                                                style={{ cursor: 'pointer' }}
                                                            />
                                                            <span title={prop}>{prop}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {categorizedProps.common.length === 0 && categorizedProps.custom.length === 0 && (
                                            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>无匹配属性键</span>
                                        )}
                                    </div>
                                </div>

                                {/* 4. Configured Columns Fine-tuning (Inline) */}
                                {columns.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>已选报表列配置 ({columns.length} 列)</label>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                            {columns.map(col => (
                                                <div key={col.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    <div style={{ 
                                                        display: 'flex', alignItems: 'center', gap: 4, background: 'var(--brand-soft)',
                                                        border: '1px solid var(--brand-border)', borderRadius: 4, padding: '3px 8px', fontSize: 10,
                                                        fontWeight: 700, color: 'var(--brand)', cursor: 'default'
                                                    }}>
                                                        <span>{col.name} ({col.aggregation === 'none' ? '明细' : col.aggregation})</span>
                                                        <button 
                                                            type="button"
                                                            onClick={() => setEditingColumnId(editingColumnId === col.id ? null : col.id)}
                                                            className="text-brand hover:text-brand-hover"
                                                            title="点击微调列名、求和与精度设置"
                                                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex' }}
                                                        >
                                                            <Settings size={11} />
                                                        </button>
                                                    </div>

                                                    {/* Inline Column Editor */}
                                                    {editingColumnId === col.id && (
                                                        <div className="animate-fade-in-up" style={{
                                                            position: 'relative', display: 'flex', flexDirection: 'column', gap: 6,
                                                            padding: 8, background: 'var(--surface-1)', border: '1px solid var(--border)',
                                                            borderRadius: 'var(--radius-sm)', minWidth: 200, zIndex: 10
                                                        }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)' }}>列 [{col.fieldMatch}] 属性微调</span>
                                                                <button type="button" onClick={() => setEditingColumnId(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
                                                                    <X size={10} style={{ color: 'var(--text-muted)' }} />
                                                                </button>
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                <input 
                                                                    type="text" 
                                                                    placeholder="显示表头别名" 
                                                                    value={col.name} 
                                                                    onChange={(e) => updateColumn(col.id, 'name', e.target.value)}
                                                                    className="input-control"
                                                                    style={{ padding: '3px 6px', fontSize: 10 }}
                                                                />
                                                                <div style={{ display: 'flex', gap: 4 }}>
                                                                    <select 
                                                                        value={col.aggregation} 
                                                                        disabled={mode === 'detail'}
                                                                        onChange={(e) => updateColumn(col.id, 'aggregation', e.target.value)}
                                                                        className="input-control"
                                                                        style={{ padding: '3px 6px', fontSize: 10, flex: 1.2 }}
                                                                    >
                                                                        <option value="none">无汇总 (清单值)</option>
                                                                        <option value="sum">求和 (SUM)</option>
                                                                        <option value="count">计数 (COUNT)</option>
                                                                        <option value="avg">平均 (AVG)</option>
                                                                        <option value="min">最小值 (MIN)</option>
                                                                        <option value="max">最大值 (MAX)</option>
                                                                    </select>
                                                                    <input 
                                                                        type="text" 
                                                                        placeholder="单位" 
                                                                        value={col.unit || ''} 
                                                                        onChange={(e) => updateColumn(col.id, 'unit', e.target.value)}
                                                                        className="input-control"
                                                                        style={{ padding: '3px 6px', fontSize: 10, width: 40 }}
                                                                    />
                                                                    <input 
                                                                        type="number" 
                                                                        min={0}
                                                                        max={5}
                                                                        placeholder="精度" 
                                                                        value={col.precision} 
                                                                        onChange={(e) => updateColumn(col.id, 'precision', parseInt(e.target.value, 10) || 0)}
                                                                        className="input-control"
                                                                        style={{ padding: '3px 6px', fontSize: 10, width: 35 }}
                                                                        title="小数位数"
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* 5. Filters configure */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>过滤器条件 (Filters - 支持多字段 , 号分隔)</label>
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
                                                        placeholder="字段,如 type"
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

                                {/* Run query */}
                                <button 
                                    type="button"
                                    onClick={runCalculation}
                                    disabled={isLoading || columns.length === 0}
                                    className="primary-button"
                                    style={{ minHeight: 32, gap: 6, fontSize: 12, marginTop: 4 }}
                                >
                                    {isLoading ? (
                                        <>
                                            <RefreshCw size={13} className="animate-spin" />
                                            <span>正在过滤统计并汇总数据...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Play size={13} fill="currentColor" />
                                            <span>开始生成 {mode === 'detail' ? '清单明细表' : '分组求和汇总表'}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Results table view */}
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
                                
                                {/* Search query input */}
                                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-soft)', background: 'var(--surface-1)' }}>
                                    <div style={{ position: 'relative' }}>
                                        <input 
                                            type="text" 
                                            placeholder="在结果表格中过滤首列文本..."
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

                                {/* Data sheet table */}
                                <div style={{ flex: 1, overflow: 'auto', background: 'var(--surface-0)' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: 'left' }}>
                                        <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-2)', zIndex: 10 }}>
                                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                                <th 
                                                    onClick={() => handleSort('groupValue')}
                                                    style={{ padding: '8px 10px', cursor: 'pointer', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}
                                                >
                                                    {mode === 'detail' ? '构件详细描述' : '嵌套分组依赖链'}
                                                </th>
                                                {mode === 'summary' && (
                                                    <th 
                                                        onClick={() => handleSort('count')}
                                                        style={{ padding: '8px 10px', cursor: 'pointer', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', textAlign: 'right' }}
                                                    >
                                                        数量
                                                    </th>
                                                )}
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
                                                    <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--text-primary)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {row.groupValue}
                                                    </td>
                                                    {mode === 'summary' && (
                                                        <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', textAlign: 'right', fontWeight: 500 }}>
                                                            {row.count}
                                                        </td>
                                                    )}
                                                    {columns.map(col => (
                                                        <td key={col.id} style={{ padding: '8px 10px', color: 'var(--text-secondary)', textAlign: 'right', fontWeight: 500 }}>
                                                            {row[col.id] ?? '-'}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                        {totalRow && (
                                            <tfoot style={{ position: 'sticky', bottom: 0, background: 'var(--surface-2)', zIndex: 5, borderTop: '2px solid var(--border)' }}>
                                                <tr style={{ fontWeight: 'bold' }}>
                                                    <td style={{ padding: '8px 10px', color: 'var(--text-primary)', fontWeight: 700 }}>
                                                        {totalRow.groupValue}
                                                    </td>
                                                    {mode === 'summary' && (
                                                        <td style={{ padding: '8px 10px', color: 'var(--text-primary)', textAlign: 'right', fontWeight: 700 }}>
                                                            {totalRow.count}
                                                        </td>
                                                    )}
                                                    {columns.map(col => (
                                                        <td key={col.id} style={{ padding: '8px 10px', color: 'var(--text-primary)', textAlign: 'right', fontWeight: 700 }}>
                                                            {totalRow[col.id]}
                                                        </td>
                                                    ))}
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                </div>
                                
                                {/* Status bar summary */}
                                <div style={{
                                    padding: '6px 12px', fontSize: 10, color: 'var(--text-muted)',
                                    borderTop: '1px solid var(--border)', background: 'var(--surface-1)',
                                    display: 'flex', justifyContent: 'space-between'
                                }}>
                                    <span>汇总结果：{rows.length} 行 (筛选过滤：{filteredAndSortedRows.length} 行)</span>
                                    <span>提示：双击表格行可以在 3D 视图中缩放聚焦</span>
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
                                <span className="empty-state-title">未计算任何数据</span>
                                <span className="empty-state-desc">在上方勾选参数列，点击「开始生成」输出清单数据。</span>
                            </div>
                        )}
                    </div>

                </div>
            )}

            {/* Template Library Tab */}
            {activeTab === 'templates' && (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: 12, gap: 14, overflowY: 'auto' }}>
                    
                    {/* Import configurations */}
                    <div style={{ 
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                        padding: '10px 12px', background: 'var(--surface-1)', border: '1px solid var(--border)', 
                        borderRadius: 'var(--radius-md)' 
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>本地导入设计模板</span>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>载入外部导出的 `.json` 设计文件</span>
                        </div>
                        <label 
                            className="primary-button" 
                            style={{ padding: '4px 10px', fontSize: 11, minHeight: 26, cursor: 'pointer', gap: 4 }}
                        >
                            <Upload size={12} /> 导入模板
                            <input type="file" accept=".json" onChange={handleImportTemplate} className="hidden" />
                        </label>
                    </div>

                    {/* Presets */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Layers size={13} style={{ color: 'var(--brand)' }} />
                            系统内置推荐模板
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
                                            内置
                                        </span>
                                    </div>
                                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{preset.description}</span>
                                    <div style={{ display: 'flex', gap: 10, fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
                                        <span>模式: {preset.config.mode === 'detail' ? '明细清单' : '分组汇总'}</span>
                                        <span>•</span>
                                        <span>量度列: {preset.config.columns.length} 列</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Custom Storage Templates */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
                            我的存盘模板 ({savedTemplates.length})
                        </span>
                        
                        {savedTemplates.length === 0 ? (
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic', padding: '10px 4px' }}>
                                暂无存盘模板。您可以在清单设计完毕后点击右上角「另存为」保存到这里。
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
                                        
                                        {/* Actions */}
                                        <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 4 }}>
                                            <button 
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleExportTemplate(tpl); }}
                                                className="icon-button"
                                                title="下载模板文件"
                                                style={{ width: 24, height: 24 }}
                                            >
                                                <Download size={11} />
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={(e) => deleteTemplate(tpl.id, e)}
                                                className="icon-button danger-button"
                                                title="删除模板"
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

            {/* Template Save Modal */}
            {showSaveModal && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)',
                    backdropFilter: 'blur(2px)', zIndex: 100, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', padding: 16
                }}>
                    <form onSubmit={handleSaveTemplate} className="panel-surface animate-fade-in-up" style={{ width: '100%', maxWidth: 320, padding: 16 }}>
                        <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>保存当前的报表设计配置</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)' }}>模板标题 *</label>
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
                                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)' }}>模板说明 (可选)</label>
                                <textarea 
                                    rows={2}
                                    placeholder="描述该清单模板的使用场合与分组依据..."
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

            {/* Datalist suggestions */}
            <datalist id="props-datalist">
                {availableProps.map(k => (
                    <option key={k} value={k} />
                ))}
            </datalist>

        </div>
    );
};

export default ReportPanel;
