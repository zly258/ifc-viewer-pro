import React, { useEffect, useRef } from "react";
import { EyeOff, Eye, Copy, MessageSquarePlus, X, Expand } from "lucide-react";
import { ifcManager } from "../services/ifcManager";
import { useLanguage } from "../locales/LanguageContext";

interface ContextMenuProps {
    x: number;
    y: number;
    hit: { modelID: number; expressID: number } | null;
    onClose: () => void;
    onAddAnnotation?: (modelID: number, expressID: number) => void;
    onSelect: (modelID: number, expressID: number) => void;
    isIsolated: boolean;
    onHideElement?: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, hit, onClose, onAddAnnotation, onSelect, isIsolated, onHideElement }) => {
    const { t } = useLanguage();
    const menuRef = useRef<HTMLDivElement>(null);
    const adjustedX = Math.min(x, window.innerWidth - 200);
    const adjustedY = Math.min(y, window.innerHeight - 260);

    useEffect(() => {
        const handleClose = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
        };
        const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("mousedown", handleClose);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handleClose);
            document.removeEventListener("keydown", handleKey);
        };
    }, [onClose]);


    const handleIsolate = async () => {
        if (hit) { await ifcManager.isolateElement(hit.modelID, hit.expressID); onSelect(hit.modelID, hit.expressID); }
        onClose();
    };
    const handleHide = () => {
        if (hit) {
            ifcManager.hideElement(hit.modelID, hit.expressID);
            if (onHideElement) onHideElement();
        }
        onClose();
    };
    const handleRestoreHidden = () => {
        ifcManager.showAllElements();
        onClose();
    };
    const handleUnisolate = () => { ifcManager.unisolateAll(); onClose(); };

    const handleAnnotation = () => { if (hit && onAddAnnotation) onAddAnnotation(hit.modelID, hit.expressID); onClose(); };

    return (
        <div ref={menuRef} className="context-menu" style={{ left: adjustedX, top: adjustedY }} onContextMenu={e => e.preventDefault()}>
            {hit ? (
                <>
                    <div className="context-menu-header">{t.contextMenu.elementOps}</div>

                    <button className="context-menu-item" onClick={handleIsolate}>
                        <Eye size={13} /> {t.contextMenu.isolateElement}
                    </button>
                    <button className="context-menu-item" onClick={handleHide}>
                        <EyeOff size={13} /> {t.contextMenu.hideElement}
                    </button>
                    {isIsolated && (
                        <button className="context-menu-item" onClick={handleUnisolate}>
                            <EyeOff size={13} /> {t.contextMenu.unisolate}
                        </button>
                    )}

                    {onAddAnnotation && (
                        <button className="context-menu-item" onClick={handleAnnotation}>
                            <MessageSquarePlus size={13} /> {t.contextMenu.addAnnotation}
                        </button>
                    )}
                </>
            ) : (
                <>
                    <div className="context-menu-header">{t.contextMenu.sceneOps}</div>
                    {isIsolated && (
                        <button className="context-menu-item" onClick={handleUnisolate}>
                            <EyeOff size={13} /> {t.contextMenu.unisolate}
                        </button>
                    )}
                    {ifcManager.hasHiddenElements && (
                        <button className="context-menu-item" onClick={handleRestoreHidden}>
                            <Eye size={13} /> {t.contextMenu.restoreAllHidden}
                        </button>
                    )}
                    <button className="context-menu-item" onClick={() => { ifcManager.fitModelToFrame(); onClose(); }}>
                        <Expand size={13} /> {t.contextMenu.fitView}
                    </button>
                </>
            )}
            <div className="context-menu-separator" />
            <button className="context-menu-item" style={{ color: "var(--text-muted)" }} onClick={onClose}>
                <X size={13} /> {t.contextMenu.closeMenu}
            </button>
        </div>
    );
};

export default ContextMenu;
