import React, { useRef, useState, useEffect } from 'react';
import {
  FolderTree, FileText, Maximize, Settings, MousePointer2,
  Ruler, Scissors, Trash2, Plus, DraftingCompass, MapPin,
  List, Navigation, Bookmark, LayoutGrid, TableProperties,
  Database,
} from 'lucide-react';
import { ifcManager } from '../services/ifcManager';
import { CameraView, ViewerTool, MeasurementMode } from '../types';

interface BottomToolbarProps {
  onOpenFile: (files: File[]) => void;
  onToggleModelTree: () => void;
  onToggleRightPanel: () => void;
  onClear: () => void;
  isModelTreeOpen: boolean;
  activeRightPanel: 'properties' | null;
  onToggleBcfPanel: () => void;
  isBcfPanelOpen: boolean;
  onToggleReportPanel: () => void;
  isReportPanelOpen: boolean;
}

// Camera views list
const VIEWS = [
    { id: CameraView.TOP,     label: '顶视图',      group: '正投影' },
    { id: CameraView.BOTTOM,  label: '底视图',      group: '正投影' },
    { id: CameraView.FRONT,   label: '前视图',      group: '正投影' },
    { id: CameraView.BACK,    label: '后视图',      group: '正投影' },
    { id: CameraView.LEFT,    label: '左视图',      group: '正投影' },
    { id: CameraView.RIGHT,   label: '右视图',      group: '正投影' },
    { id: CameraView.ISO_NE,  label: '东北等轴测',  group: '等轴测' },
    { id: CameraView.ISO_NW,  label: '西北等轴测',  group: '等轴测' },
    { id: CameraView.ISO_SE,  label: '东南等轴测',  group: '等轴测' },
    { id: CameraView.ISO_SW,  label: '西南等轴测',  group: '等轴测' },
];

const SAMPLES = [
    { file: 'Structure_Model.ifc', label: '结构体系模型 (0.7MB)' },
    { file: 'LED_Screen.ifc', label: 'LED大屏结构 (5.2MB)' },
    { file: 'Energy_Tower.ifc', label: '能源大楼 (10.6MB)' },
    { file: 'Wellness_Center.ifc', label: '康体中心 (21.3MB)' },
];

const BottomToolbar: React.FC<BottomToolbarProps> = ({
    onOpenFile,
    onToggleModelTree,
    onToggleRightPanel,
    onClear,
    isModelTreeOpen,
    activeRightPanel,
    onToggleBcfPanel,
    isBcfPanelOpen,
    onToggleReportPanel,
    isReportPanelOpen,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [sampleMenuOpen, setSampleMenuOpen] = useState(false);
  const [isLoadingSample, setIsLoadingSample] = useState(false);
  const [activeTool, setActiveTool] = useState<ViewerTool>(ViewerTool.NONE);

  const [activePlanes, setActivePlanes] = useState({ X: false, Y: false, Z: false });
  const [planeRangeOffsets, setPlaneRangeOffsets] = useState({
    X: { min: -500, max: 500, defaultMin: -500, defaultMax: 500 },
    Y: { min: -500, max: 500, defaultMin: -500, defaultMax: 500 },
    Z: { min: -500, max: 500, defaultMin: -500, defaultMax: 500 },
  });

  const [measureMode, setMeasureMode] = useState<MeasurementMode>('DISTANCE');
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const sampleMenuRef = useRef<HTMLDivElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onOpenFile(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleLoadSample = async (fileName: string, displayName: string) => {
    setIsLoadingSample(true);
    try {
      const response = await fetch(`/samples/${fileName}`);
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      const file = new File([blob], displayName, { type: 'application/octet-stream' });
      onOpenFile([file]);
      setSampleMenuOpen(false);
    } catch (e) {
      console.error(e);
      alert('下载案例模型失败，请检查网络！');
    } finally {
      setIsLoadingSample(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(event.target as Node)) {
        setViewMenuOpen(false);
      }
      if (sampleMenuRef.current && !sampleMenuRef.current.contains(event.target as Node)) {
        setSampleMenuOpen(false);
      }
    };
    if (viewMenuOpen || sampleMenuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [viewMenuOpen, sampleMenuOpen]);

  useEffect(() => {
    if (activeTool === ViewerTool.SECTION) {
      const { min, max } = ifcManager.getModelBoundingBox();
      if (min && max) {
        setPlaneRangeOffsets({
          X: { min: min.x, max: max.x, defaultMin: min.x, defaultMax: max.x },
          Y: { min: min.y, max: max.y, defaultMin: min.y, defaultMax: max.y },
          Z: { min: min.z, max: max.z, defaultMin: min.z, defaultMax: max.z },
        });
      }
    }
  }, [activeTool]);

  const handleToolChange = (tool: ViewerTool) => {
    if (activeTool === tool) {
      setActiveTool(ViewerTool.NONE);
      ifcManager.setTool(ViewerTool.NONE);
    } else {
      setActiveTool(tool);
      ifcManager.setTool(tool);
      if (tool === ViewerTool.MEASURE) {
        setMeasureMode('DISTANCE');
        ifcManager.setMeasurementMode('DISTANCE');
      }
    }
  };

  const toggleSectionPlane = (axis: 'X' | 'Y' | 'Z') => {
    const newState = !activePlanes[axis];
    setActivePlanes(prev => ({ ...prev, [axis]: newState }));
    const { min, max } = planeRangeOffsets[axis];
    ifcManager.sectionManager?.togglePlane(axis, newState, min, max);
    ifcManager.renderScene();
  };

  const disableAllSectionPlanes = () => {
    setActivePlanes({ X: false, Y: false, Z: false });
    ifcManager.sectionManager?.togglePlane('X', false, 0, 0);
    ifcManager.sectionManager?.togglePlane('Y', false, 0, 0);
    ifcManager.sectionManager?.togglePlane('Z', false, 0, 0);
    ifcManager.renderScene();
  };

  const handleSectionOffsetMin = (axis: 'X' | 'Y' | 'Z', e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setPlaneRangeOffsets(prev => ({ ...prev, [axis]: { ...prev[axis], min: Math.min(val, prev[axis].max - 0.1) } }));
    ifcManager.sectionManager?.updateOffset(axis, val, planeRangeOffsets[axis].max);
    ifcManager.renderScene();
  };

  const handleSectionOffsetMax = (axis: 'X' | 'Y' | 'Z', e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setPlaneRangeOffsets(prev => ({ ...prev, [axis]: { ...prev[axis], max: Math.max(val, prev[axis].min + 0.1) } }));
    ifcManager.sectionManager?.updateOffset(axis, planeRangeOffsets[axis].min, val);
    ifcManager.renderScene();
  };

  const handleMeasureMode = (mode: MeasurementMode) => {
    setMeasureMode(mode);
    ifcManager.setMeasurementMode(mode);
  };

  // ---- Sub-components ----

  // Main toolbar button: icon + label
  const ToolButton = ({
    icon: Icon, label, onClick, active = false, danger = false,
  }: { icon: any; label: string; onClick: (e: React.MouseEvent) => void; active?: boolean; danger?: boolean }) => (
    <button
      type="button"
      onClick={onClick}
      className={`toolbar-button ${active ? 'toolbar-button-active' : ''} ${danger ? 'danger-tool-btn' : ''}`}
      title={label}
      style={danger ? { color: 'var(--text-muted)' } : undefined}
    >
      <Icon size={18} strokeWidth={1.8} />
      <span>{label}</span>
    </button>
  );

  // Sub-toolbar icon button
  const SubBtn = ({
    icon: Icon, onClick, active = false, danger = false, title,
  }: { icon: any; onClick: () => void; active?: boolean; danger?: boolean; title: string }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`icon-button ${active ? 'icon-button-active' : ''} ${danger ? 'danger-button' : ''}`}
    >
      <Icon size={17} />
    </button>
  );

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-40 pointer-events-none">

      {/* Sub-toolbar: Measurement */}
      {activeTool === ViewerTool.MEASURE && (
        <div className="sub-toolbar flex items-center gap-1">
          <SubBtn icon={Ruler} onClick={() => handleMeasureMode('DISTANCE')} active={measureMode === 'DISTANCE'} title="距离测量" />
          <SubBtn icon={DraftingCompass} onClick={() => handleMeasureMode('ANGLE')} active={measureMode === 'ANGLE'} title="角度测量" />
          <SubBtn icon={MapPin} onClick={() => handleMeasureMode('COORDINATE')} active={measureMode === 'COORDINATE'} title="坐标拾取" />
          <div className="toolbar-divider" />
          <SubBtn icon={List} onClick={() => window.dispatchEvent(new Event('open-measure-panel'))} title="测量结果列表" />
          <SubBtn
            icon={Trash2}
            danger
            onClick={() => { ifcManager.measurementManager?.clear(); ifcManager.renderScene(); }}
            title="清除全部测量"
          />
        </div>
      )}

      {/* Sub-toolbar: Section */}
      {activeTool === ViewerTool.SECTION && (
        <div className="sub-toolbar flex flex-col gap-1.5" style={{ minWidth: 280 }}>
          {(['X', 'Y', 'Z'] as const).map(axis => (
            <div key={axis} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleSectionPlane(axis)}
                style={{
                  width: 24,
                  height: 20,
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 10,
                  fontWeight: 700,
                  border: '1px solid',
                  cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                  background: activePlanes[axis] ? 'var(--brand)' : 'var(--surface-1)',
                  color: activePlanes[axis] ? '#fff' : 'var(--text-muted)',
                  borderColor: activePlanes[axis] ? 'var(--brand)' : 'var(--border)',
                }}
              >
                {axis}
              </button>
              <div
                className="flex-1 flex flex-col gap-0.5"
                style={{ opacity: activePlanes[axis] ? 1 : 0.35, transition: 'opacity 0.2s', padding: '2px 0' }}
              >
                {/* Numeric readout */}
                <div className="flex justify-between text-[9px] font-bold text-slate-500 dark:text-slate-400 px-0.5" style={{ pointerEvents: 'none' }}>
                  <span>{planeRangeOffsets[axis].min.toFixed(1)}m</span>
                  <span>{planeRangeOffsets[axis].max.toFixed(1)}m</span>
                </div>
                
                {/* Dual Thumb Slider Container */}
                <div className="relative h-4 w-full flex items-center">
                  {/* Background Track */}
                  <div className="absolute left-0 right-0 h-1 rounded-full bg-slate-200 dark:bg-slate-700 z-0" style={{ pointerEvents: 'none' }} />
                  
                  {/* Active highlight fill range */}
                  <div 
                    className="absolute h-1 rounded-full bg-blue-500 dark:bg-blue-600 z-10" 
                    style={{
                      pointerEvents: 'none',
                      left: `${Math.max(0, Math.min(100, ((planeRangeOffsets[axis].min - planeRangeOffsets[axis].defaultMin) / Math.max(1, planeRangeOffsets[axis].defaultMax - planeRangeOffsets[axis].defaultMin)) * 100))}%`,
                      right: `${Math.max(0, Math.min(100, 100 - ((planeRangeOffsets[axis].max - planeRangeOffsets[axis].defaultMin) / Math.max(1, planeRangeOffsets[axis].defaultMax - planeRangeOffsets[axis].defaultMin)) * 100))}%`
                    }}
                  />
                  
                  <input
                    type="range"
                    min={planeRangeOffsets[axis].defaultMin}
                    max={planeRangeOffsets[axis].defaultMax}
                    step={Math.max(0.01, (planeRangeOffsets[axis].defaultMax - planeRangeOffsets[axis].defaultMin) / 500)}
                    value={planeRangeOffsets[axis].min}
                    onChange={(e) => handleSectionOffsetMin(axis, e)}
                    disabled={!activePlanes[axis]}
                    className="dual-range-input min-range-input"
                  />
                  <input
                    type="range"
                    min={planeRangeOffsets[axis].defaultMin}
                    max={planeRangeOffsets[axis].defaultMax}
                    step={Math.max(0.01, (planeRangeOffsets[axis].defaultMax - planeRangeOffsets[axis].defaultMin) / 500)}
                    value={planeRangeOffsets[axis].max}
                    onChange={(e) => handleSectionOffsetMax(axis, e)}
                    disabled={!activePlanes[axis]}
                    className="dual-range-input max-range-input"
                  />
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={disableAllSectionPlanes}
            style={{
              padding: '6px 12px',
              fontSize: 10,
              fontWeight: 700,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              marginTop: 4,
              textAlign: 'center',
              width: '100%',
              background: 'var(--surface-1)',
              color: 'var(--text-secondary)',
              transition: 'background 0.15s, color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'var(--danger-soft)';
              (e.currentTarget as HTMLElement).style.color = 'var(--danger)';
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--danger-border)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'var(--surface-1)';
              (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
            }}
          >
            重置并关闭所有剖切面
          </button>
        </div>
      )}

      {/* Main Toolbar */}
      <div className="main-toolbar">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".ifc"
          multiple
          className="hidden"
        />

        {/* File Group */}
        <ToolButton icon={Plus} label="加载" onClick={() => fileInputRef.current?.click()} />

        <div className="relative" ref={sampleMenuRef}>
          {sampleMenuOpen && (
            <div
              className="absolute mb-3 py-1 w-52 overflow-hidden z-50 animate-fade-in-up panel-surface"
              style={{ bottom: '100%', left: '50%', transform: 'translateX(-50%)' }}
            >
              <div style={{
                padding: '4px 12px',
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--text-muted)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                background: 'var(--surface-1)',
                borderBottom: '1px solid var(--border-soft)',
              }}>
                选择预设案例
              </div>
              {isLoadingSample ? (
                <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="animate-spin" style={{ width: 12, height: 12, border: '2px solid var(--brand)', borderTopColor: 'transparent', borderRadius: '50%' }} />
                  正在拉取案例模型...
                </div>
              ) : (
                SAMPLES.map(s => (
                  <button
                    key={s.file}
                    type="button"
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 14px',
                      fontSize: 12,
                      fontWeight: 500,
                      color: 'var(--text-secondary)',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'background 0.1s, color 0.1s',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background = 'var(--brand-soft)';
                      (e.currentTarget as HTMLElement).style.color = 'var(--brand)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                      (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
                    }}
                    onClick={() => handleLoadSample(s.file, s.label.split(' ')[0] + '.ifc')}
                  >
                    {s.label}
                  </button>
                ))
              )}
            </div>
          )}
          <ToolButton icon={Database} label="案例" active={sampleMenuOpen} onClick={() => setSampleMenuOpen(!sampleMenuOpen)} />
        </div>

        <div className="toolbar-divider" />

        {/* Panel Group */}
        <ToolButton icon={FolderTree} label="模型" active={isModelTreeOpen} onClick={onToggleModelTree} />
        <ToolButton icon={FileText} label="属性" active={activeRightPanel === 'properties'} onClick={() => onToggleRightPanel()} />
        <ToolButton icon={Bookmark} label="批注" active={isBcfPanelOpen} onClick={onToggleBcfPanel} />
        <ToolButton icon={TableProperties} label="报表" active={isReportPanelOpen} onClick={onToggleReportPanel} />

        <div className="toolbar-divider" />

        {/* Tool Group */}
        <ToolButton icon={Navigation} label="漫游" active={activeTool === ViewerTool.WALK} onClick={() => handleToolChange(ViewerTool.WALK)} />
        <ToolButton icon={Ruler} label="测量" active={activeTool === ViewerTool.MEASURE} onClick={() => handleToolChange(ViewerTool.MEASURE)} />
        <ToolButton icon={Scissors} label="剖切" active={activeTool === ViewerTool.SECTION} onClick={() => handleToolChange(ViewerTool.SECTION)} />

        <div className="toolbar-divider" />

        {/* View Group */}
        <ToolButton icon={Maximize} label="充满" onClick={() => ifcManager.fitModelToFrame()} />

        <div className="relative" ref={viewMenuRef}>
          {viewMenuOpen && (
            <div
              className="absolute mb-3 py-1 w-44 overflow-hidden z-50 animate-fade-in-up panel-surface"
              style={{ bottom: '100%', left: '50%', transform: 'translateX(-50%)' }}
            >
              {['正投影', '等轴测'].map(group => (
                <div key={group}>
                  <div style={{
                    padding: '4px 12px',
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    background: 'var(--surface-1)',
                    borderBottom: '1px solid var(--border-soft)',
                  }}>
                    {group}
                  </div>
                  {VIEWS.filter(v => v.group === group).map(v => (
                    <button
                      key={v.id}
                      type="button"
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '7px 14px',
                        fontSize: 12,
                        fontWeight: 500,
                        color: 'var(--text-secondary)',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'background 0.1s, color 0.1s',
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.background = 'var(--brand-soft)';
                        (e.currentTarget as HTMLElement).style.color = 'var(--brand)';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.background = 'transparent';
                        (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
                      }}
                      onClick={() => { ifcManager.setCameraView(v.id); setViewMenuOpen(false); }}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
          <ToolButton icon={LayoutGrid} label="视图" active={viewMenuOpen} onClick={() => setViewMenuOpen(!viewMenuOpen)} />
        </div>

        <div className="toolbar-divider" />

        {/* Danger Group */}
        <ToolButton
          icon={Trash2}
          label="清空"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClear(); }}
          danger
        />
      </div>
    </div>
  );
};

export default BottomToolbar;
