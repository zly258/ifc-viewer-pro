
import React, { useState, useEffect } from 'react';
import Viewer3D from './components/Viewer3D';
import PropertyPanel from './components/PropertyPanel';
import ModelTree from './components/ModelTree';
import MeasurementPanel from './components/MeasurementPanel';
import BottomToolbar from './components/BottomToolbar';
import SettingsModal, { ViewSettings, DEFAULT_VIEW_SETTINGS } from './components/SettingsModal';
import DraggablePanel from './components/common/DraggablePanel';
import { TopStatusBar } from './components/TopStatusBar';
import { IFCElementData, MeasurementResult } from './types';
import { Loader, Cpu, Network, FileText, Ruler, Sun } from 'lucide-react';
import { ifcManager } from './services/ifcManager';
import LightingSimulationPanel from './components/LightingSimulationPanel';

const App: React.FC = () => {
  const [selectedElement, setSelectedElement] = useState<IFCElementData | null>(null);
  
  // Panel Visibility States
  const [showModelTree, setShowModelTree] = useState(false);
  const [showPropertyPanel, setShowPropertyPanel] = useState(false);
  const [showMeasurePanel, setShowMeasurePanel] = useState(false);
  const [showLightingPanel, setShowLightingPanel] = useState(false);
  
  // Modal States
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [settings, setSettings] = useState<ViewSettings>(() => {
    const saved = localStorage.getItem('bimvision_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ifcUpAxis: parsed.ifcUpAxis || 'Y',
          glbUpAxis: parsed.glbUpAxis || 'Y',
          shadowQuality: parsed.shadowQuality || 'off'
        };
      } catch (e) {
        return DEFAULT_VIEW_SETTINGS;
      }
    }
    return DEFAULT_VIEW_SETTINGS;
  });
  
  // Data States
  const [lastFileName, setLastFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [modelKey, setModelKey] = useState(0);
  const [measurements, setMeasurements] = useState<MeasurementResult[]>([]);

  useEffect(() => {
    // Listen for measurement panel toggle
    const handleMeasurePanelOpen = () => setShowMeasurePanel(true);
    window.addEventListener('open-measure-panel', handleMeasurePanelOpen);
    return () => window.removeEventListener('open-measure-panel', handleMeasurePanelOpen);
  }, []);

  useEffect(() => {
    const ifcUp = settings.ifcUpAxis || 'Z';
    const glbUp = settings.glbUpAxis || 'Y';
    ifcManager.setOrientations(ifcUp, glbUp);
  }, [settings.ifcUpAxis, settings.glbUpAxis]);

  useEffect(() => {
    const shadowQ = settings.shadowQuality || 'off';
    ifcManager.setShadowQuality(shadowQ);
  }, [settings.shadowQuality]);

  const handleSaveSettings = (newSettings: ViewSettings) => {
    setSettings(newSettings);
    localStorage.setItem('bimvision_settings', JSON.stringify(newSettings));
    setIsSettingsOpen(false);
  };

  const handleElementSelect = (data: IFCElementData | null) => {
      setSelectedElement(data);
      if (data) {
          setShowPropertyPanel(true);
      }
  };

  const handleOpenFiles = async (files: File[]) => {
      if (files.length === 0) return;
      
      for (const file of files) {
          const lower = file.name.toLowerCase();
          if (lower.endsWith('.ifc')) {
             await ifcManager.loadIfc(file, true); 
          } else if (lower.endsWith('.glb') || lower.endsWith('.gltf')) {
             await ifcManager.loadGlb(file, true);
          }
      }
      
      const allModels = Array.from(ifcManager.models.values());
      if (allModels.length === 0) {
          setLastFileName(null);
      } else if (allModels.length === 1) {
          setLastFileName(allModels[0].group.name || "未命名模型");
      } else {
          setLastFileName(`${allModels.length} 个活动模型`);
      }
      
      ifcManager.fitModelToFrame();
      setModelKey(prev => prev + 1);
  };
  
  const handleClearScene = () => {
      // Note: BottomToolbar handles the confirmation, we just do the logic
      try {
          ifcManager.clearModels();
          ifcManager.measurementManager?.clear();
      } catch (e) {
          console.warn("Failed to fully clear 3D scene:", e);
      }

      setLastFileName(null);
      setSelectedElement(null);
      setShowModelTree(false);
      setShowPropertyPanel(false);
      setShowMeasurePanel(false);
      setMeasurements([]);
      setProcessingStatus(null); 
      setIsLoading(false);
      setModelKey(prev => prev + 1);
  };

  // Sync measurements
  const onViewerReady = () => {
      if (ifcManager.measurementManager) {
          // Set the callback to update App state when measurements change
          ifcManager.measurementManager.onMeasurementsChange = (results) => {
              setMeasurements([...results]);
              if (results.length > 0) setShowMeasurePanel(true);
          };
      }
  };

  return (
    <div className="flex flex-col w-full h-screen bg-slate-50 text-slate-800 overflow-hidden font-sans relative">
      
      <TopStatusBar fileName={lastFileName} />

      {/* Main Content Area */}
      <div className="flex-1 relative overflow-hidden w-full h-full">
          
          {/* 3D Viewer Layer */}
          <div className="absolute inset-0 z-0">
              <Viewer3D 
                  file={null} 
                  onSelectElement={handleElementSelect}
                  onLoadingStatus={(loading, prog) => {
                      setIsLoading(loading);
                      setProgress(prog);
                      if (!loading && prog === 100) {
                          setShowModelTree(true); 
                          setModelKey(prev => prev + 1);
                          onViewerReady();
                      }
                  }}
                  onProcessingStatus={(status) => {
                      setProcessingStatus(status);
                  }}
              />
          </div>

          {/* Draggable Panels Layer */}
          
          <DraggablePanel 
              title="模型结构" 
              icon={Network}
              isOpen={showModelTree} 
              onClose={() => setShowModelTree(false)}
              initialPosition={{ x: 20, y: 20 }}
              initialSize={{ w: 300, h: 500 }}
          >
              <ModelTree 
                key={modelKey} 
                onLoadStructure={() => {}} 
                selectedElement={selectedElement}
              />
          </DraggablePanel>

          <DraggablePanel 
              title="属性详情" 
              icon={FileText}
              isOpen={showPropertyPanel} 
              onClose={() => setShowPropertyPanel(false)}
              initialPosition={{ x: Math.max(20, window.innerWidth - 340), y: 20 }}
              initialSize={{ w: 320, h: 500 }}
          >
              <PropertyPanel data={selectedElement} />
          </DraggablePanel>

          <DraggablePanel 
              title="测量结果" 
              icon={Ruler}
              isOpen={showMeasurePanel} 
              onClose={() => setShowMeasurePanel(false)}
              initialPosition={{ x: 20, y: 400 }}
              initialSize={{ w: 300, h: 300 }}
          >
              <MeasurementPanel measurements={measurements} onClear={() => setMeasurements([])} />
          </DraggablePanel>

          <DraggablePanel 
              title="光照与阴影模拟" 
              icon={Sun}
              isOpen={showLightingPanel} 
              onClose={() => setShowLightingPanel(false)}
              initialPosition={{ x: 20, y: 380 }}
              initialSize={{ w: 320, h: 480 }}
          >
              <LightingSimulationPanel 
                  onShadowQualityChange={(quality) => {
                      setSettings(prev => {
                          const newSettings = { ...prev, shadowQuality: quality };
                          localStorage.setItem('bimvision_settings', JSON.stringify(newSettings));
                          return newSettings;
                      });
                  }}
                  currentShadowQuality={settings.shadowQuality}
              />
          </DraggablePanel>

          {/* Floating UI Layer (Toolbar) */}
          <BottomToolbar 
              onOpenFile={handleOpenFiles}
              onToggleModelTree={() => setShowModelTree(!showModelTree)}
              onToggleRightPanel={() => setShowPropertyPanel(!showPropertyPanel)}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onClear={() => setShowClearConfirm(true)}
              isModelTreeOpen={showModelTree}
              activeRightPanel={showPropertyPanel ? 'properties' : null}
              onToggleLightingPanel={() => setShowLightingPanel(!showLightingPanel)}
              isLightingPanelOpen={showLightingPanel}
          />
          
          {/* Combined Loading Overlay */}
          {(isLoading || processingStatus) && (
              <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center pointer-events-none transition-opacity duration-300">
                  {/* Phase 1: Reading/Loading (Determinate Progress) */}
                  {isLoading ? (
                      <>
                        <Loader className="w-10 h-10 text-blue-500 animate-spin mb-4" />
                        <h3 className="text-xl font-light text-slate-800 mb-2">{processingStatus || "正在读取文件"}</h3>
                        <div className="w-64 h-2 bg-slate-200 rounded-full overflow-hidden shadow-inner">
                            <div className="h-full bg-blue-500 transition-all duration-200 ease-out" style={{ width: `${Math.max(5, progress)}%` }} />
                        </div>
                        <p className="text-xs text-slate-500 mt-2 font-mono">{Math.round(progress)}%</p>
                      </>
                  ) : (
                  /* Phase 2: Processing (Indeterminate) */
                      <>
                        <div className="relative">
                            <Cpu className="w-10 h-10 text-green-500 animate-pulse mb-4" />
                            <div className="absolute top-0 right-0 w-3 h-3 bg-green-400 rounded-full animate-ping" />
                        </div>
                        <h3 className="text-xl font-light text-slate-800 mb-2">{processingStatus || "处理中..."}</h3>
                        <p className="text-xs text-slate-400">正在解析几何数据与属性</p>
                      </>
                  )}
              </div>
          )}
          
          {!lastFileName && !isLoading && !processingStatus && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                  <div className="text-slate-400 text-sm bg-white/50 px-4 py-2 rounded-full border border-slate-200 shadow-sm">
                      请点击下方“加载”按钮导入 IFC/GLB 模型
                  </div>
              </div>
          )}
      </div>
      
      {showClearConfirm && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden p-5 animate-in fade-in zoom-in-95 duration-150">
                  <h3 className="text-sm font-semibold text-slate-800 mb-2 font-sans">清空当前场景</h3>
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed font-sans">确定要清空当前场景吗？所有的模型和测量数据都会被清空且无法恢复。</p>
                  <div className="flex justify-end gap-2 text-xs font-sans">
                      <button 
                          onClick={() => setShowClearConfirm(false)} 
                          className="px-3.5 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-semibold border border-slate-200"
                      >
                          取消
                      </button>
                      <button 
                          onClick={() => {
                              handleClearScene();
                              setShowClearConfirm(false);
                          }} 
                          className="px-3.5 py-2 text-white bg-red-600 hover:bg-red-700 font-semibold rounded-lg transition-colors"
                      >
                          确认清空
                      </button>
                  </div>
              </div>
          </div>
      )}

      <SettingsModal 
        isOpen={isSettingsOpen}
        settings={settings}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveSettings}
      />
    </div>
  );
};

export default App;
