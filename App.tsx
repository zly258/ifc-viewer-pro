
import React, { useState, useEffect } from 'react';
import Viewer3D from './components/Viewer3D';
import PropertyPanel from './components/PropertyPanel';
import ModelTree from './components/ModelTree';
import MeasurementPanel from './components/MeasurementPanel';
import BottomToolbar from './components/BottomToolbar';
import SettingsModal, { ViewSettings, DEFAULT_VIEW_SETTINGS, SETTINGS_VERSION } from './components/SettingsModal';
import DraggablePanel from './components/common/DraggablePanel';
import { TopStatusBar } from './components/TopStatusBar';
import { IFCElementData, MeasurementResult } from './types';
import { Network, FileText, Ruler, Sun, Bookmark, Upload } from 'lucide-react';
import { ifcManager } from './services/ifcManager';
import SunPanel from './components/SunPanel';
import BcfPanel from './components/BcfPanel';

const App: React.FC = () => {
  const [selectedElement, setSelectedElement] = useState<IFCElementData | null>(null);

  // Panel Visibility States
  const [showModelTree, setShowModelTree] = useState(false);
  const [showPropertyPanel, setShowPropertyPanel] = useState(false);
  const [showMeasurePanel, setShowMeasurePanel] = useState(false);
  const [showLightingPanel, setShowLightingPanel] = useState(false);
  const [showBcfPanel, setShowBcfPanel] = useState(false);

  // Modal States
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [settings, setSettings] = useState<ViewSettings>(() => {
    const saved = localStorage.getItem('bimvision_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ifcUpAxis: parsed.settingsVersion === SETTINGS_VERSION ? (parsed.ifcUpAxis || 'Z') : 'Z',
          glbUpAxis: parsed.settingsVersion === SETTINGS_VERSION ? (parsed.glbUpAxis || 'Y') : 'Y',
          shadowQuality: parsed.settingsVersion === SETTINGS_VERSION ? (parsed.shadowQuality || 'off') : 'off',
          settingsVersion: SETTINGS_VERSION,
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
    const versionedSettings = { ...newSettings, settingsVersion: SETTINGS_VERSION };
    setSettings(versionedSettings);
    localStorage.setItem('bimvision_settings', JSON.stringify(versionedSettings));
    setIsSettingsOpen(false);
  };

  const handleElementSelect = (data: IFCElementData | null) => {
    setSelectedElement(data);
    if (data) setShowPropertyPanel(true);
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
      setLastFileName(allModels[0].group.name || '未命名模型');
    } else {
      setLastFileName(`${allModels.length} 个活动模型`);
    }

    ifcManager.fitModelToFrame();
    setModelKey(prev => prev + 1);
  };

  const handleClearScene = () => {
    try {
      ifcManager.clearModels();
      ifcManager.measurementManager?.clear();
    } catch (e) {
      console.warn('Failed to fully clear 3D scene:', e);
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

  const onViewerReady = () => {
    if (ifcManager.measurementManager) {
      ifcManager.measurementManager.onMeasurementsChange = (results) => {
        setMeasurements([...results]);
        if (results.length > 0) setShowMeasurePanel(true);
      };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100vh', background: 'var(--app-bg)', overflow: 'hidden', position: 'relative' }}>

      <TopStatusBar fileName={lastFileName} />

      {/* Main Content Area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', width: '100%', height: '100%' }}>

        {/* 3D Viewer */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
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

        {/* Draggable Panels */}

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
          title="光照与阴影"
          icon={Sun}
          isOpen={showLightingPanel}
          onClose={() => setShowLightingPanel(false)}
          initialPosition={{ x: 20, y: 380 }}
          initialSize={{ w: 320, h: 480 }}
        >
          <SunPanel
            onShadowQualityChange={(quality) => {
              setSettings(prev => {
                const newSettings = { ...prev, shadowQuality: quality, settingsVersion: SETTINGS_VERSION };
                localStorage.setItem('bimvision_settings', JSON.stringify(newSettings));
                return newSettings;
              });
            }}
            currentShadowQuality={settings.shadowQuality}
          />
        </DraggablePanel>

        <DraggablePanel
          title="视点与批注"
          icon={Bookmark}
          isOpen={showBcfPanel}
          onClose={() => setShowBcfPanel(false)}
          initialPosition={{ x: Math.max(20, window.innerWidth - 340), y: 120 }}
          initialSize={{ w: 320, h: 480 }}
        >
          <BcfPanel selectedElement={selectedElement} />
        </DraggablePanel>

        {/* Bottom Toolbar */}
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
          onToggleBcfPanel={() => setShowBcfPanel(!showBcfPanel)}
          isBcfPanelOpen={showBcfPanel}
        />

        {/* Loading Overlay */}
        {(isLoading || processingStatus) && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(248, 250, 252, 0.92)',
            backdropFilter: 'blur(6px)',
            zIndex: 50,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <style>{`
              @keyframes appSpinner { to { transform: rotate(360deg); } }
              @keyframes appDotPulse { 0%, 80%, 100% { transform: scale(0.7); opacity: 0.5; } 40% { transform: scale(1); opacity: 1; } }
            `}</style>
            {isLoading ? (
              <>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  border: '3px solid var(--brand-soft)', borderTopColor: 'var(--brand)',
                  animation: 'appSpinner 0.9s linear infinite', marginBottom: 18,
                }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 14 }}>
                  {processingStatus || '正在读取文件…'}
                </div>
                <div style={{ width: 220, height: 4, background: 'var(--surface-2)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', background: 'var(--brand)', borderRadius: 99,
                    width: `${Math.max(4, progress)}%`, transition: 'width 0.25s ease-out',
                  }} />
                </div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', marginTop: 8 }}>
                  {Math.round(progress)}%
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 7, marginBottom: 18 }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: 'var(--brand)',
                      animation: `appDotPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }} />
                  ))}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {processingStatus || '解析模型数据…'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>正在构建几何体与属性索引</div>
              </>
            )}
          </div>
        )}

        {/* Empty State — welcome */}
        {!lastFileName && !isLoading && !processingStatus && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', zIndex: 0,
          }}>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              padding: '28px 36px',
              background: 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(8px)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 'var(--radius-lg)',
                background: 'var(--brand-soft)', border: '1px solid var(--brand-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4,
              }}>
                <Upload size={22} style={{ color: 'var(--brand)' }} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>打开 BIM 模型</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
                支持 IFC · GLB · GLTF 格式<br />
                点击底部工具栏"加载"导入文件
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Clear Scene Confirm */}
      {showClearConfirm && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15, 23, 42, 0.42)',
          backdropFilter: 'blur(3px)',
          zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}>
          <div className="panel-surface animate-fade-in-up" style={{ width: '100%', maxWidth: 360, padding: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>清空当前场景</h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 18 }}>
              此操作将清除所有已加载模型与测量记录，且无法撤销。
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowClearConfirm(false)} className="secondary-button">取消</button>
              <button
                onClick={() => { handleClearScene(); setShowClearConfirm(false); }}
                className="danger-primary-button"
              >
                清空场景
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
