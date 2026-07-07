import React, { useEffect, useRef } from "react";
import { Focus, EyeOff, Eye, Copy, MessageSquarePlus, X, Expand } from "lucide-react";
import { ifcManager } from "../services/ifcManager";

interface ContextMenuProps {
    x: number;
    y: number;
    hit: { modelID: number; expressID: number } | null;
    onClose: () => void;
    onAddAnnotation?: (modelID: number, expressID: number) => void;
    onSelect: (modelID: number, expressID: number) => void;
    isIsolated: boolean;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, hit, onClose, onAddAnnotation, onSelect, isIsolated }) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const adjustedX = Math.min(x, window.innerWidth - 200);
    const adjustedY = Math.min(y, window.innerHeight - 240);

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

    const handleFocus = () => {
        if (hit) { onSelect(hit.modelID, hit.expressID); setTimeout(() => ifcManager.zoomToHighlight(), 100); }
        onClose();
    };
    const handleIsolate = async () => {
        if (hit) { await ifcManager.isolateElement(hit.modelID, hit.expressID); onSelect(hit.modelID, hit.expressID); }
        onClose();
    };
    const handleUnisolate = () => { ifcManager.unisolateAll(); onClose(); };
    const handleCopyID = () => { if (hit) { navigator.clipboard.writeText(String(hit.expressID)).catch(() => {}); } onClose(); };
    const handleAnnotation = () => { if (hit && onAddAnnotation) onAddAnnotation(hit.modelID, hit.expressID); onClose(); };

    return (
        <div ref={menuRef} className="context-menu" style={{ left: adjustedX, top: adjustedY }} onContextMenu={e => e.preventDefault()}>
            {hit ? (
                <>
                    <div className="context-menu-header">构件操作</div>
                    <button className="context-menu-item" onClick={handleFocus}>
                        <Focus size={13} /> 聚焦此构件
                    </button>
                    <button className="context-menu-item" onClick={handleIsolate}>
                        <Eye size={13} /> 隔离此构件
                    </button>
                    {isIsolated && (
                        <button className="context-menu-item" onClick={handleUnisolate}>
                            <EyeOff size={13} /> 取消隔离
                        </button>
                    )}
                    <button className="context-menu-item" onClick={handleCopyID}>
                        <Copy size={13} /> 复制 Express ID
                    </button>
                    {onAddAnnotation && (
                        <button className="context-menu-item" onClick={handleAnnotation}>
                            <MessageSquarePlus size={13} /> 添加批注
                        </button>
                    )}
                </>
            ) : (
                <>
                    <div className="context-menu-header">场景操作</div>
                    {isIsolated && (
                        <button className="context-menu-item" onClick={handleUnisolate}>
                            <EyeOff size={13} /> 取消隔离
                        </button>
                    )}
                    <button className="context-menu-item" onClick={() => { ifcManager.fitModelToFrame(); onClose(); }}>
                        <Expand size={13} /> 适应全景
                    </button>
                </>
            )}
            <div className="context-menu-separator" />
            <button className="context-menu-item" style={{ color: "var(--text-muted)" }} onClick={onClose}>
                <X size={13} /> 关闭菜单
            </button>
        </div>
    );
};

export default ContextMenu;
