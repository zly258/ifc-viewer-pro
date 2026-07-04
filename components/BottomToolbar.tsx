import React, { useRef, useState, useEffect } from 'react';
import { FolderTree, FileText, Maximize, Box, Settings, MousePointer2, Ruler, Scissors, Trash2, Plus, DraftingCompass, MapPin, List, Sun, Compass, Bookmark } from 'lucide-react';
import { ifcManager } from '../services/ifcManager';
import { CameraView, ViewerTool, MeasurementMode } from '../types';

interface BottomToolbarProps {
  onOpenFile: (files: File[]) => void;
  onToggleModelTree: () => void;
  onToggleRightPanel: () => void;
  onOpenSettings: () => void;
  onClear: () => void; 
  isModelTreeOpen: boolean;
  activeRightPanel: 'properties' | null;
  onToggleLightingPanel: () => void;
  isLightingPanelOpen: boolean;
  onToggleBcfPanel: () => void;
  isBcfPanelOpen: boolean;
}

const BottomToolbar: React.FC<BottomToolbarProps> = ({ 
    onOpenFile, 
    onToggleModelTree, 
    onToggleRightPanel,
    onOpenSettings,
    onClear,
    isModelTreeOpen,
    activeRightPanel,
    onToggleLightingPanel,
    isLightingPanelOpen,
    onToggleBcfPanel,
    isBcfPanelOpen
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Menu States
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<ViewerTool>(ViewerTool.SELECT);
  
  // Section Tool State
  const [activePlanes, setActivePlanes] = useState({ X: false, Y: false, Z: false });
  const [planeRangeOffsets, setPlaneRangeOffsets] = useState({ 
    X: { min: -500, max: 500, defaultMin: -500, defaultMax: 500 }, 
    Y: { min: -500, max: 500, defaultMin: -500, defaultMax: 500 }, 
    Z: { min: -500, max: 500, defaultMin: -500, defaultMax: 500 } 
  });

  // Measurement Tool State
  const [measureMode, setMeasureMode] = useState<MeasurementMode>('DISTANCE');
  
  const viewMenuRef = useRef<HTMLDivElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      onOpenFile(files);
      e.target.value = '';
    }
  };

  const handleClear = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onClear();
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(event.target as Node)) {
        setViewMenuOpen(false);
      }
    };
    if (viewMenuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [viewMenuOpen]);

  // Init Section Range on tool activation
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
      if (tool === ViewerTool.SELECT && activeTool === ViewerTool.SELECT) {
          return;
      }

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
  
  const views = [
      { id: CameraView.TOP, label: '顶视图 (Top)', group: '标准投影' },
      { id: CameraView.BOTTOM, label: '底视图 (Bottom)', group: '标准投影' },
      { id: CameraView.FRONT, label: '前视图 (Front)', group: '标准投影' },
      { id: CameraView.BACK, label: '后视图 (Back)', group: '标准投影' },
      { id: CameraView.LEFT, label: '左视图 (Left)', group: '标准投影' },
      { id: CameraView.RIGHT, label: '右视图 (Right)', group: '标准投影' },
      { id: CameraView.ISO_NE, label: '等轴测 东北 (NE)', group: '轴测视图' },
      { id: CameraView.ISO_NW, label: '等轴测 西北 (NW)', group: '轴测视图' },
      { id: CameraView.ISO_SE, label: '等轴测 东南 (SE)', group: '轴测视图' },
      { id: CameraView.ISO_SW, label: '等轴测 西南 (SW)', group: '轴测视图' },
  ];

  const ToolButton = ({ 
      icon: Icon, 
      label, 
      onClick, 
      active = false,
      extraClass = ""
  }: { icon: any, label: string, onClick: (e: React.MouseEvent) => void, active?: boolean, extraClass?: string }) => (
    <button 
      type="button"
      onClick={onClick}
      className={`toolbar-button group ${active ? 'toolbar-button-active' : ''} ${extraClass}`}
      title={label}
    >
      <Icon size={19} strokeWidth={1.8} />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-40 pointer-events-none">
      
      {/* Sub-toolbar for Measurement Tool */}
      {activeTool === ViewerTool.MEASURE && (
           <div className="sub-toolbar flex items-center gap-1">
              <button type="button" onClick={() => handleMeasureMode('DISTANCE')} className={`icon-button ${measureMode === 'DISTANCE' ? 'icon-button-active' : ''}`} title="距离">
                  <Ruler size={18} />
              </button>
              <button type="button" onClick={() => handleMeasureMode('ANGLE')} className={`icon-button ${measureMode === 'ANGLE' ? 'icon-button-active' : ''}`} title="角度">
                   <DraftingCompass size={18} />
              </button>
              <button type="button" onClick={() => handleMeasureMode('COORDINATE')} className={`icon-button ${measureMode === 'COORDINATE' ? 'icon-button-active' : ''}`} title="坐标">
                   <MapPin size={18} />
              </button>
              <div className="toolbar-divider"></div>
              <button type="button" onClick={() => window.dispatchEvent(new Event('open-measure-panel'))} className="icon-button" title="显示测量结果">
                   <List size={18} />
              </button>
              <button type="button" onClick={() => { ifcManager.measurementManager?.clear(); ifcManager.renderScene(); }} className="icon-button danger-button" title="清除测量">
                   <Trash2 size={18} />
              </button>
           </div>
      )}

      {/* Sub-toolbar for Section Tool */}
      {activeTool === ViewerTool.SECTION && (
          <div className="sub-toolbar flex flex-col gap-3 min-w-[280px]">
              {(['X', 'Y', 'Z'] as const).map(axis => (
                  <div key={axis} className="flex items-center gap-3">
                      <button 
                        type="button"
                        onClick={() => toggleSectionPlane(axis)}
                        className={`w-8 h-6 text-xs font-semibold rounded-md transition-colors ${activePlanes[axis] ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-700'}`}
                      >
                          {axis}
                      </button>
                      
                      <div className="flex-1 flex flex-col gap-1 relative opacity-100 transition-opacity" style={{ opacity: activePlanes[axis] ? 1 : 0.4 }}>
                          {/* We use two inputs overlapping, one for min one for max to create a simple dual slider */}
                          <div className="relative h-2 w-full">
                            <input 
                              type="range" 
                              min={planeRangeOffsets[axis].defaultMin} 
                              max={planeRangeOffsets[axis].defaultMax} 
                              step={(planeRangeOffsets[axis].defaultMax - planeRangeOffsets[axis].defaultMin) / 500}
                              value={planeRangeOffsets[axis].min}
                              onChange={(e) => handleSectionOffsetMin(axis, e)}
                              disabled={!activePlanes[axis]}
                              className="absolute w-full h-1.5 top-0 bg-transparent rounded-lg appearance-none cursor-pointer accent-blue-500 z-20 pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto"
                            />
                            <div className="absolute w-full h-1.5 top-0 bg-slate-200 rounded-lg overflow-hidden z-0"></div>
                            <input 
                              type="range" 
                              min={planeRangeOffsets[axis].defaultMin} 
                              max={planeRangeOffsets[axis].defaultMax} 
                              step={(planeRangeOffsets[axis].defaultMax - planeRangeOffsets[axis].defaultMin) / 500}
                              value={planeRangeOffsets[axis].max}
                              onChange={(e) => handleSectionOffsetMax(axis, e)}
                              disabled={!activePlanes[axis]}
                              className="absolute w-full h-1.5 top-0 bg-transparent rounded-lg appearance-none cursor-pointer accent-blue-500 z-10 pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto"
                            />
                          </div>
                      </div>
                  </div>
              ))}
          </div>
      )}

      {/* Main Toolbar */}
      <div className="main-toolbar">
        
        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".ifc,.glb,.gltf" multiple className="hidden" />

        <ToolButton icon={Plus} label="加载" onClick={() => fileInputRef.current?.click()} />
        
        <div className="toolbar-divider" />

        <ToolButton icon={FolderTree} label="模型" active={isModelTreeOpen} onClick={onToggleModelTree} />
        <ToolButton icon={FileText} label="属性" active={activeRightPanel === 'properties'} onClick={() => onToggleRightPanel()} />
        <ToolButton icon={Bookmark} label="批注" active={isBcfPanelOpen} onClick={onToggleBcfPanel} />

        <div className="toolbar-divider" />

        <ToolButton icon={MousePointer2} label="选择" active={activeTool === ViewerTool.SELECT} onClick={() => handleToolChange(ViewerTool.SELECT)} />
        <ToolButton icon={Compass} label="漫游" active={activeTool === ViewerTool.WALK} onClick={() => handleToolChange(ViewerTool.WALK)} />
        <ToolButton icon={Ruler} label="测量" active={activeTool === ViewerTool.MEASURE} onClick={() => handleToolChange(ViewerTool.MEASURE)} />
        <ToolButton icon={Scissors} label="剖切" active={activeTool === ViewerTool.SECTION} onClick={() => handleToolChange(ViewerTool.SECTION)} />
        <ToolButton icon={Sun} label="光照" active={isLightingPanelOpen} onClick={onToggleLightingPanel} />
        <ToolButton icon={Settings} label="设置" onClick={onOpenSettings} />

        <div className="toolbar-divider" />

        <ToolButton icon={Maximize} label="充满" onClick={() => ifcManager.fitModelToFrame()} />
        
        <div className="relative" ref={viewMenuRef}>
           {viewMenuOpen && (
               <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 panel-surface py-2 w-48 overflow-hidden z-50 animate-fade-in-up">
                   <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 tracking-wide bg-slate-50 border-b border-slate-100 mb-1 select-none">标准视图</div>
                   {views.filter(v => v.group === '标准投影').map(v => (
                       <button
                          key={v.id}
                          type="button"
                          className="w-full text-left px-3.5 py-2 text-xs text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center justify-between font-medium"
                          onClick={() => { ifcManager.setCameraView(v.id); setViewMenuOpen(false); }}
                       >
                          {v.label}
                       </button>
                   ))}
                   <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 tracking-wide bg-slate-50 border-t border-b border-slate-100 my-1 select-none">轴测视图</div>
                   {views.filter(v => v.group === '轴测视图').map(v => (
                       <button
                          key={v.id}
                          type="button"
                          className="w-full text-left px-3.5 py-2 text-xs text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center justify-between font-medium"
                          onClick={() => { ifcManager.setCameraView(v.id); setViewMenuOpen(false); }}
                       >
                          {v.label}
                       </button>
                   ))}
               </div>
           )}
           <ToolButton icon={Box} label="视图" active={viewMenuOpen} onClick={() => setViewMenuOpen(!viewMenuOpen)} />
        </div>
        
        <div className="toolbar-divider" />
        
        <ToolButton icon={Trash2} label="清空" onClick={handleClear} extraClass="hover:text-red-500 hover:bg-red-50" />

      </div>
    </div>
  );
};

export default BottomToolbar;
