
import React, { useState, useEffect, useCallback } from 'react';
import Viewer3D from './components/Viewer3D';
import PropertyPanel from './components/PropertyPanel';
import ModelTree from './components/ModelTree';
import MeasurementPanel from './components/MeasurementPanel';
import BottomToolbar from './components/BottomToolbar';
import DraggablePanel from './components/common/DraggablePanel';
import { TopStatusBar } from './components/TopStatusBar';
import ContextMenu from './components/ContextMenu';
import { IFCElementData, MeasurementResult, ViewerTool } from './types';
import { Network, FileText, Ruler, Bookmark, Upload, TableProperties, X as XIcon, MessageSquare } from 'lucide-react';
import { ifcManager } from './services/ifcManager';
import BcfPanel from './components/BcfPanel';
import ReportPanel from './components/ReportPanel';
import AnnotationPanel from './components/AnnotationPanel';
import AboutModal from './components/AboutModal';
import SettingsModal, { ViewSettings, DEFAULT_VIEW_SETTINGS, applyThemeColor, applyThemeMode } from './components/SettingsModal';
import { useLanguage } from './locales/LanguageContext';

const App: React.FC = () => {
  const { t } = useLanguage();
  const [selectedElement, setSelectedElement] = useState<IFCElementData | null>(null);
  const [selectedElements, setSelectedElements] = useState<Array<{ modelID: number; expressID: number }>>([]);

  // Panel Visibility States
  const [showModelTree, setShowModelTree] = useState(false);
  const [showPropertyPanel, setShowPropertyPanel] = useState(false);
  const [showMeasurePanel, setShowMeasurePanel] = useState(false);
  const [showBcfPanel, setShowBcfPanel] = useState(false);
  const [showReportPanel, setShowReportPanel] = useState(false);
  const [showAnnotationPanel, setShowAnnotationPanel] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // View Settings (persisted in localStorage)
  const [viewSettings, setViewSettings] = useState<ViewSettings>(() => {
    try {
      const saved = localStorage.getItem('bimvision_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_VIEW_SETTINGS, ...parsed };
      }
    } catch {}
    return DEFAULT_VIEW_SETTINGS;
  });

  // Sync hover highlight setting to ifcManager
  useEffect(() => {
    ifcManager.enableHoverHighlight = viewSettings.enableHoverHighlight;
  }, [viewSettings.enableHoverHighlight]);

  // Sync shadow quality setting to ifcManager
  useEffect(() => {
    ifcManager.setShadowQuality(viewSettings.shadowQuality);
  }, [viewSettings.shadowQuality]);

  // Expose showSettingsModal + showAboutModal globally
  useEffect(() => {
    (window as any).showAboutModal = () => setShowAbout(true);
    (window as any).showSettingsModal = () => setShowSettings(true);
  }, []);

  // Sync measurement tips translations when language changes
  useEffect(() => {
    if (ifcManager.measurementManager) {
      ifcManager.measurementManager.tipsTranslations = {
        startPoint: t.measureTips.startPoint,
        clickStart: t.measureTips.clickStart,
        clickEnd: t.measureTips.clickEnd,
        clickVertex: t.measureTips.clickVertex,
        clickNext: t.measureTips.clickNext,
        clickCorner1: t.measureTips.clickCorner1,
        clickCorner2: t.measureTips.clickCorner2,
        clickAnyPoint: t.measureTips.clickAnyPoint,
        length: t.measureTips.length,
        angle: t.measureTips.angle,
        area: t.measureTips.area,
        volume: t.measureTips.volume,
      };
    }
  }, [t, ifcManager.measurementManager]);

  // Modal States
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Dark Theme — sync with settings
  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    // Prefer view settings, fall back to legacy key
    try {
      const saved = localStorage.getItem('bimvision_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.themeMode) return parsed.themeMode === 'dark';
      }
    } catch {}
    return localStorage.getItem('bimvision_theme') === 'dark';
  });

  useEffect(() => {
    applyThemeMode(isDarkTheme ? 'dark' : 'light');
    applyThemeColor(viewSettings.themeColor, isDarkTheme ? 'dark' : 'light');
    localStorage.setItem('bimvision_theme', isDarkTheme ? 'dark' : 'light');
    // Update Three.js scene background color
    ifcManager.scene && (ifcManager.scene as any).background?.set && 
      (ifcManager.scene as any).background.set(isDarkTheme ? 0x111827 : 0xf8fafc);
    ifcManager.renderScene();
  }, [isDarkTheme, viewSettings.themeColor]);

  // Apply theme on first load
  useEffect(() => {
    applyThemeMode(viewSettings.themeMode);
    applyThemeColor(viewSettings.themeColor, viewSettings.themeMode);
  }, []);

  // Drag & Drop state
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; hit: { modelID: number; expressID: number } | null } | null>(null);

  // Isolation state
  const [isIsolated, setIsIsolated] = useState(false);
  const [hasHiddenElements, setHasHiddenElements] = useState(false);

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

  // Context menu from viewer
  useEffect(() => {
    const handleContextMenu = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setContextMenu({ x: detail.x, y: detail.y, hit: detail.hit });
    };
    window.addEventListener('viewer-contextmenu', handleContextMenu);
    return () => window.removeEventListener('viewer-contextmenu', handleContextMenu);
  }, []);

  // Listen to isolation & element visibility events
  useEffect(() => {
    const handleIsolationChange = (e: Event) => {
      const isIso = (e as CustomEvent).detail?.isIsolated;
      setIsIsolated(!!isIso);
    };
    const handleElementsChanged = () => {
      setHasHiddenElements(ifcManager.hasHiddenElements);
    };
    window.addEventListener('viewer-isolation-changed', handleIsolationChange);
    window.addEventListener('viewer-elements-changed', handleElementsChanged);
    return () => {
      window.removeEventListener('viewer-isolation-changed', handleIsolationChange);
      window.removeEventListener('viewer-elements-changed', handleElementsChanged);
    };
  }, []);



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
      }
    }

    const allModels = Array.from(ifcManager.models.values());
    if (allModels.length === 0) {
      setLastFileName(null);
    } else if (allModels.length === 1) {
      setLastFileName(allModels[0].group.name || t.app.unnamedModel);
    } else {
      setLastFileName(`${allModels.length} ${t.app.activeModels}`);
    }

    ifcManager.fitModelToFrame();
    setModelKey(prev => prev + 1);
  };

  // Drag & Drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only hide if leaving the root element
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDraggingOver(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const files = (Array.from(e.dataTransfer.files) as File[]).filter(f => {
      const lower = f.name.toLowerCase();
      return lower.endsWith('.ifc');
    });
    if (files.length > 0) {
      await handleOpenFiles(files);
    }
  }, []);

  const handleContextMenuSelect = async (modelID: number, expressID: number) => {
    // Trigger property fetch
    setShowPropertyPanel(true);
  };

  const handleScreenshot = () => {
    const name = lastFileName ? `${lastFileName.replace(/\.[^/.]+$/, '')}-screenshot.png` : 'bimvision-screenshot.png';
    ifcManager.captureScreenshot(name);
  };

  const handleClearScene = () => {
    try {
      ifcManager.clearModels();
      ifcManager.measurementManager?.clear();
      ifcManager.annotationManager?.clear();
    } catch (e) {
      console.warn('Failed to fully clear 3D scene:', e);
    }

    setLastFileName(null);
    setSelectedElement(null);
    setSelectedElements([]);
    setHasHiddenElements(false);
    setShowModelTree(false);
    setShowPropertyPanel(false);
    setShowMeasurePanel(false);
    setShowReportPanel(false);
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
    ifcManager.onMultiSelect = (items) => {
      setSelectedElements([...items]);
    };
  };

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100vh', background: 'var(--app-bg)', overflow: 'hidden', position: 'relative' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >

      <TopStatusBar
        fileName={lastFileName}
        isDarkTheme={isDarkTheme}
        onToggleTheme={() => {
          const next = !isDarkTheme;
          setIsDarkTheme(next);
          // Sync to settings
          const updated = { ...viewSettings, themeMode: (next ? 'dark' : 'light') as 'light' | 'dark' };
          setViewSettings(updated);
          localStorage.setItem('bimvision_settings', JSON.stringify(updated));
        }}
        onScreenshot={lastFileName ? handleScreenshot : undefined}
      />

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
          title={t.modelTree.title}
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
          title={t.propertyPanel.title}
          icon={FileText}
          isOpen={showPropertyPanel}
          onClose={() => setShowPropertyPanel(false)}
          initialPosition={{ x: Math.max(20, window.innerWidth - 340), y: 20 }}
          initialSize={{ w: 320, h: 500 }}
        >
          <PropertyPanel data={selectedElement} selectedCount={selectedElements.length} />
        </DraggablePanel>

        <DraggablePanel
          title={t.measurement.title}
          icon={Ruler}
          isOpen={showMeasurePanel}
          onClose={() => setShowMeasurePanel(false)}
          initialPosition={{ x: 20, y: 120 }}
          initialSize={{ w: 300, h: 300 }}
        >
          <MeasurementPanel measurements={measurements} onClear={() => setMeasurements([])} />
        </DraggablePanel>



        <DraggablePanel
          title={t.bcf.title}
          icon={Bookmark}
          isOpen={showBcfPanel}
          onClose={() => setShowBcfPanel(false)}
          initialPosition={{ x: Math.max(20, window.innerWidth - 340), y: 120 }}
          initialSize={{ w: 320, h: 480 }}
        >
          <BcfPanel selectedElement={selectedElement} />
        </DraggablePanel>

        <DraggablePanel
          title={t.report.title || t.report.title}
          icon={TableProperties}
          isOpen={showReportPanel}
          onClose={() => setShowReportPanel(false)}
          initialPosition={{ x: Math.max(20, (window.innerWidth - 600) / 2), y: Math.max(20, (window.innerHeight - 450) / 2 - 30) }}
          initialSize={{ w: 600, h: 450 }}
        >
          <ReportPanel />
        </DraggablePanel>

        {/* Annotation Panel */}
        <DraggablePanel
          title={t.annotations.title}
          icon={MessageSquare}
          isOpen={showAnnotationPanel}
          onClose={() => setShowAnnotationPanel(false)}
          initialPosition={{ x: window.innerWidth - 320, y: 80 }}
          initialSize={{ w: 280, h: 300 }}
        >
          <AnnotationPanel />
        </DraggablePanel>

        {/* Bottom Toolbar */}
        <BottomToolbar
          onOpenFile={handleOpenFiles}
          onToggleModelTree={() => setShowModelTree(!showModelTree)}
          onToggleRightPanel={() => setShowPropertyPanel(!showPropertyPanel)}
          onClear={() => setShowClearConfirm(true)}
          isModelTreeOpen={showModelTree}
          activeRightPanel={showPropertyPanel ? 'properties' : null}
          onToggleBcfPanel={() => setShowBcfPanel(!showBcfPanel)}
          isBcfPanelOpen={showBcfPanel}
          onToggleReportPanel={() => setShowReportPanel(!showReportPanel)}
          isReportPanelOpen={showReportPanel}
          onToggleAnnotation={() => {
            setShowAnnotationPanel(!showAnnotationPanel);
            if (!showAnnotationPanel) {
              ifcManager.setTool(ViewerTool.ANNOTATION);
            } else {
              ifcManager.setTool(ViewerTool.SELECT);
            }
          }}
          isAnnotationActive={showAnnotationPanel}
        />

        {/* Loading Overlay */}
        {(isLoading || processingStatus) && (
          <div style={{
            position: 'absolute', inset: 0,
            background: isDarkTheme ? 'rgba(15,23,42,0.92)' : 'rgba(248, 250, 252, 0.92)',
            backdropFilter: 'blur(8px)',
            zIndex: 50,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', gap: 0,
          }}>
            <style>{`
              @keyframes appSpinner { to { transform: rotate(360deg); } }
              @keyframes appDotPulse { 0%, 80%, 100% { transform: scale(0.7); opacity: 0.5; } 40% { transform: scale(1); opacity: 1; } }
            `}</style>
            {isLoading ? (
              <>
                {/* Animated spinner */}
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  border: '3px solid var(--brand-soft)', borderTopColor: 'var(--brand)',
                  animation: 'appSpinner 0.8s linear infinite', marginBottom: 20,
                }} />
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                  {processingStatus || t.app.loading}
                </div>
                {/* Gradient progress bar */}
                <div className="loading-bar-container" style={{ marginBottom: 8 }}>
                  <div className="loading-bar-fill" style={{ width: `${Math.max(4, progress)}%` }} />
                </div>
                <div style={{ fontSize: 11,  color: 'var(--brand)', fontWeight: 700 }}>
                  {Math.round(progress)}%
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 7, marginBottom: 20 }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      width: 9, height: 9, borderRadius: '50%',
                      background: 'var(--brand)',
                      animation: `appDotPulse 1.2s ease-in-out ${i * 0.22}s infinite`,
                    }} />
                  ))}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {processingStatus || t.app.parsing}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.app.buildingGeometry}</div>
              </>
            )}
          </div>
        )}

        {/* Empty State */}
        {!lastFileName && !isLoading && !processingStatus && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', zIndex: 0,
          }}>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
              padding: '32px 44px',
              background: isDarkTheme ? 'rgba(22,27,39,0.9)' : 'rgba(255,255,255,0.88)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-panel)',
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 'var(--radius-lg)',
                background: 'var(--brand-soft)', border: '1px solid var(--brand-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4,
              }}>
                <Upload size={26} style={{ color: 'var(--brand)' }} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{t.app.openModel}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.7 }}>
                {t.app.supportFormat}<br />
                {t.app.dragHint} <strong style={{ color: 'var(--brand)' }}>{t.app.dragHere}</strong>{t.app.dragEnd}
              </div>
              {/* Format badges */}
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                {['IFC'].map(fmt => (
                  <span key={fmt} style={{
                    padding: '2px 8px', borderRadius: 99,
                    fontSize: 10, fontWeight: 700,
                    background: 'var(--surface-1)', border: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                  }}>{fmt}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Drag & Drop Overlay */}
        {isDraggingOver && (
          <div className="drop-overlay">
            <div className="drop-overlay-inner">
              <div className="drop-overlay-icon">
                <Upload size={28} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{t.app.releaseToLoad}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.app.supportedFormat}</div>
            </div>
          </div>
        )}

        {/* Isolation banner */}
        {isIsolated && (
          <div className="isolation-banner" onClick={() => { ifcManager.unisolateAll(); setIsIsolated(false); }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#d97706' }} />
            {t.app.isolationBanner}
            <XIcon size={12} />
          </div>
        )}


      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          hit={contextMenu.hit}
          isIsolated={isIsolated}
          onClose={() => setContextMenu(null)}
          onSelect={handleContextMenuSelect}
          onAddAnnotation={(mID, eID) => {
            setShowBcfPanel(true);
          }}
          onHideElement={() => {
            setSelectedElement(null);
            setHasHiddenElements(ifcManager.hasHiddenElements);
          }}
        />
      )}

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
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{t.app.clearScene}</h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 18 }}>
              {t.app.clearSceneDesc}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowClearConfirm(false)} className="secondary-button">{t.app.cancel}</button>
              <button
                onClick={() => { handleClearScene(); setShowClearConfirm(false); }}
                className="danger-primary-button"
              >
                {t.app.confirmClear}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* About Modal */}
      <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={viewSettings}
        onSave={(newSettings) => {
          setViewSettings(newSettings);
          localStorage.setItem('bimvision_settings', JSON.stringify(newSettings));
          // Keep dark theme toggle in sync
          if (newSettings.themeMode !== undefined) {
            setIsDarkTheme(newSettings.themeMode === 'dark');
          }
          setShowSettings(false);
        }}
      />

    </div>
  );
};

export default App;
