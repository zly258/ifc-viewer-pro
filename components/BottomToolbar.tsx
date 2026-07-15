import React, { useRef, useState, useEffect } from 'react';
import {
  FolderTree, FileText, Maximize, Settings,
  Ruler, Scissors, Trash2, Plus, DraftingCompass, MapPin,
  List, Bookmark, LayoutGrid, TableProperties,
  Database, MessageSquare,
} from 'lucide-react';
import { ifcManager } from '../services/ifcManager';
import { CameraView, ViewerTool, MeasurementMode } from '../types';
import { useLanguage } from '../locales/LanguageContext';
import { eventBus } from '../services/eventBus';

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
  onToggleAnnotation: () => void;
  isAnnotationActive: boolean;
}

// Camera views list
const getViews = (t: any) => [
    { id: CameraView.TOP,     label: t.views.top,      group: t.views.orthographic },
    { id: CameraView.BOTTOM,  label: t.views.bottom,   group: t.views.orthographic },
    { id: CameraView.FRONT,   label: t.views.front,    group: t.views.orthographic },
    { id: CameraView.BACK,    label: t.views.back,     group: t.views.orthographic },
    { id: CameraView.LEFT,    label: t.views.left,     group: t.views.orthographic },
    { id: CameraView.RIGHT,   label: t.views.right,    group: t.views.orthographic },
    { id: CameraView.ISO_NE,  label: t.views.isoNE,    group: t.views.isometric },
    { id: CameraView.ISO_NW,  label: t.views.isoNW,    group: t.views.isometric },
    { id: CameraView.ISO_SE,  label: t.views.isoSE,    group: t.views.isometric },
    { id: CameraView.ISO_SW,  label: t.views.isoSW,    group: t.views.isometric },
];

const getSamples = (t: any) => [
    { file: 'Structure_Model.ifc', label: t.samples.structureModel },
    { file: 'LED_Screen.ifc', label: t.samples.ledScreen },
    { file: 'Energy_Tower.ifc', label: t.samples.energyTower },
    { file: 'Wellness_Center.ifc', label: t.samples.wellnessCenter },
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
    onToggleAnnotation,
    isAnnotationActive,
}) => {
  const { t } = useLanguage();
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
      const baseUrl = import.meta.env.BASE_URL;
      const response = await fetch(`${baseUrl}samples/${fileName}`);
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      const file = new File([blob], displayName, { type: 'application/octet-stream' });
      onOpenFile([file]);
      setSampleMenuOpen(false);
    } catch (e) {
      console.error(e);
      alert(t.app.downloadSampleFailed);
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

  // Listen for tool changes from keyboard shortcuts (e.g. ESC)
  useEffect(() => {
    const handleToolChanged = (detail: { tool: ViewerTool }) => {
      if (detail?.tool !== undefined) {
        setActiveTool(detail.tool);
      }
    };
    return eventBus.on('tool-changed', handleToolChanged);
  }, []);

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

  const VIEWS = getViews(t);
  const SAMPLES = getSamples(t);

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
          <SubBtn icon={Ruler} onClick={() => handleMeasureMode('DISTANCE')} active={measureMode === 'DISTANCE'} title={t.toolbar.distance} />
          <SubBtn icon={DraftingCompass} onClick={() => handleMeasureMode('ANGLE')} active={measureMode === 'ANGLE'} title={t.toolbar.angle} />
          <SubBtn icon={MapPin} onClick={() => handleMeasureMode('COORDINATE')} active={measureMode === 'COORDINATE'} title={t.toolbar.coordinate} />
          <div className="toolbar-divider" />
          <SubBtn icon={List} onClick={() => eventBus.emit('open-measure-panel', undefined)} title={t.toolbar.measureList} />
          <SubBtn
            icon={Trash2}
            danger
            onClick={() => { ifcManager.measurementManager?.clear(); ifcManager.renderScene(); }}
            title={t.toolbar.clearAllMeasure}
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
            {t.toolbar.resetSection}
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
        <ToolButton icon={Plus} label={t.toolbar.load} onClick={() => fileInputRef.current?.click()} />

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
                {t.toolbar.selectSample}
              </div>
              {isLoadingSample ? (
                <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="animate-spin" style={{ width: 12, height: 12, border: '2px solid var(--brand)', borderTopColor: 'transparent', borderRadius: '50%' }} />
                  {t.app.uploadingSample}
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
          <ToolButton icon={Database} label={t.toolbar.sample} active={sampleMenuOpen} onClick={() => setSampleMenuOpen(!sampleMenuOpen)} />
        </div>

        <div className="toolbar-divider" />

        {/* Panel Group */}
        <ToolButton icon={FolderTree} label={t.toolbar.model} active={isModelTreeOpen} onClick={onToggleModelTree} />
        <ToolButton icon={FileText} label={t.toolbar.properties} active={activeRightPanel === 'properties'} onClick={() => onToggleRightPanel()} />
        <ToolButton icon={MessageSquare} label={t.toolbar.annotationTool} active={isAnnotationActive} onClick={onToggleAnnotation} />
        <ToolButton icon={Bookmark} label={t.toolbar.bcf} active={isBcfPanelOpen} onClick={onToggleBcfPanel} />
        <ToolButton icon={TableProperties} label={t.toolbar.report} active={isReportPanelOpen} onClick={onToggleReportPanel} />

        <div className="toolbar-divider" />

        {/* Tool Group */}
        <ToolButton icon={Ruler} label={t.toolbar.measure} active={activeTool === ViewerTool.MEASURE} onClick={() => handleToolChange(ViewerTool.MEASURE)} />
        <ToolButton icon={Scissors} label={t.toolbar.section} active={activeTool === ViewerTool.SECTION} onClick={() => handleToolChange(ViewerTool.SECTION)} />

        <div className="toolbar-divider" />

        {/* View Group */}
        <ToolButton icon={Maximize} label={t.toolbar.fit} onClick={() => ifcManager.fitModelToFrame()} />

        <div className="relative" ref={viewMenuRef}>
          {viewMenuOpen && (
            <div
              className="absolute mb-3 py-1 w-44 overflow-hidden z-50 animate-fade-in-up panel-surface"
              style={{ bottom: '100%', left: '50%', transform: 'translateX(-50%)' }}
            >
              {[t.views.orthographic, t.views.isometric].map(group => (
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
          <ToolButton icon={LayoutGrid} label={t.toolbar.view} active={viewMenuOpen} onClick={() => setViewMenuOpen(!viewMenuOpen)} />
        </div>

        <div className="toolbar-divider" />

        {/* Danger Group */}
        <ToolButton
          icon={Trash2}
          label={t.toolbar.clear}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClear(); }}
          danger
        />
      </div>
    </div>
  );
};

export default BottomToolbar;
