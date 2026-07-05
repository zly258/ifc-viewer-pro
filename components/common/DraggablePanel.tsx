
import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

interface DraggablePanelProps {
  title: string;
  icon?: React.ElementType;
  isOpen: boolean;
  onClose: () => void;
  initialPosition?: { x: number; y: number };
  initialSize?: { w: number; h: number };
  minWidth?: number;
  minHeight?: number;
  children: React.ReactNode;
  className?: string;
}

const DraggablePanel: React.FC<DraggablePanelProps> = ({
  title,
  icon: Icon,
  isOpen,
  onClose,
  initialPosition = { x: 20, y: 80 },
  initialSize = { w: 320, h: 400 },
  minWidth = 250,
  minHeight = 200,
  children,
  className = '',
}) => {
  const [position, setPosition] = useState(initialPosition);
  const [size, setSize] = useState(initialSize);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const startPosRef = useRef({ x: 0, y: 0 });
  const startSizeRef = useRef({ w: 0, h: 0 });

  // Ensure panel is on screen on mount
  useEffect(() => {
    setPosition(prev => ({
      x: Math.max(0, Math.min(prev.x, window.innerWidth - size.w)),
      y: Math.max(0, Math.min(prev.y, window.innerHeight - size.h)),
    }));
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        setPosition({
          x: Math.max(0, Math.min(window.innerWidth - size.w, startPosRef.current.x + dx)),
          y: Math.max(0, Math.min(window.innerHeight - size.h, startPosRef.current.y + dy)),
        });
      }
      if (isResizing) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        setSize({
          w: Math.max(minWidth, startSizeRef.current.w + dx),
          h: Math.max(minHeight, startSizeRef.current.h + dy),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = isDragging ? 'grabbing' : 'se-resize';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, size.w, size.h, minWidth, minHeight]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.no-drag')) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    startPosRef.current = { ...position };
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    startSizeRef.current = { ...size };
  };

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className={`absolute flex flex-col glass-panel overflow-hidden z-30 animate-fade-in-up ${className}`}
      style={{
        left: position.x,
        top: position.y,
        width: size.w,
        height: size.h,
        borderRadius: 'var(--radius-lg)',
      }}
    >
      {/* Header — drag zone */}
      <div
        className="flex items-center justify-between flex-shrink-0 cursor-grab select-none"
        style={{
          height: 40,
          padding: '0 12px 0 14px',
          background: 'var(--surface-1)',
          borderBottom: '1px solid var(--border-soft)',
        }}
        onMouseDown={handleMouseDown}
      >
        {/* Title */}
        <div
          className="flex items-center gap-2 pointer-events-none"
          style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}
        >
          {Icon && (
            <Icon size={14} style={{ color: 'var(--brand)', flexShrink: 0 }} />
          )}
          <span>{title}</span>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="icon-button danger-button no-drag"
          style={{ width: 28, height: 28 }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative panel-content">
        {children}
      </div>

      {/* Resize Handle */}
      <div
        className="absolute bottom-0 right-0 z-40"
        style={{ width: 14, height: 14, cursor: 'se-resize' }}
        onMouseDown={handleResizeStart}
      >
        <svg
          viewBox="0 0 6 6"
          style={{ width: 7, height: 7, position: 'absolute', bottom: 3, right: 3, pointerEvents: 'none' }}
        >
          <path d="M6 6L6 0L0 6Z" fill="var(--text-muted)" opacity="0.5" />
        </svg>
      </div>
    </div>
  );
};

export default DraggablePanel;
