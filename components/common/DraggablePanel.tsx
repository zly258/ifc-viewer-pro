
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
  const [resizeDirection, setResizeDirection] = useState<string | null>(null);
  
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
      if (resizeDirection) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        
        let newWidth = startSizeRef.current.w;
        let newHeight = startSizeRef.current.h;
        let newX = startPosRef.current.x;

        if (resizeDirection.includes('right')) {
          newWidth = Math.max(minWidth, startSizeRef.current.w + dx);
        } else if (resizeDirection.includes('left')) {
          newWidth = Math.max(minWidth, startSizeRef.current.w - dx);
          newX = startPosRef.current.x + (startSizeRef.current.w - newWidth);
        }

        if (resizeDirection.includes('bottom')) {
          newHeight = Math.max(minHeight, startSizeRef.current.h + dy);
        }

        setSize({ w: newWidth, h: newHeight });
        setPosition(prev => ({ ...prev, x: newX }));
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setResizeDirection(null);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    if (isDragging || resizeDirection) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'none';
      
      if (isDragging) {
        document.body.style.cursor = 'grabbing';
      } else if (resizeDirection) {
        if (resizeDirection === 'left') document.body.style.cursor = 'w-resize';
        else if (resizeDirection === 'right') document.body.style.cursor = 'e-resize';
        else if (resizeDirection === 'bottom') document.body.style.cursor = 's-resize';
        else if (resizeDirection === 'bottom-right') document.body.style.cursor = 'se-resize';
        else if (resizeDirection === 'bottom-left') document.body.style.cursor = 'sw-resize';
      }
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, resizeDirection, minWidth, minHeight]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.no-drag')) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    startPosRef.current = { ...position };
    startSizeRef.current = { ...size };
  };

  const handleResizeStart = (e: React.MouseEvent, dir: string) => {
    e.stopPropagation();
    e.preventDefault();
    setResizeDirection(dir);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    startSizeRef.current = { ...size };
    startPosRef.current = { ...position };
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
        className="flex items-center justify-between flex-shrink-0 cursor-grab select-none no-drag"
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
      <div className="flex-1 overflow-hidden relative panel-content no-drag">
        {children}
      </div>

      {/* Invisible Resize Borders/Handles */}
      <div
        className="absolute left-0 top-0 bottom-0 z-40 cursor-w-resize"
        style={{ width: 6 }}
        onMouseDown={(e) => handleResizeStart(e, 'left')}
      />
      <div
        className="absolute right-0 top-0 bottom-0 z-40 cursor-e-resize"
        style={{ width: 6 }}
        onMouseDown={(e) => handleResizeStart(e, 'right')}
      />
      <div
        className="absolute bottom-0 left-6 right-6 z-40 cursor-s-resize"
        style={{ height: 6 }}
        onMouseDown={(e) => handleResizeStart(e, 'bottom')}
      />
      <div
        className="absolute left-0 bottom-0 z-55 cursor-sw-resize"
        style={{ width: 10, height: 10 }}
        onMouseDown={(e) => handleResizeStart(e, 'bottom-left')}
      />
      <div
        className="absolute right-0 bottom-0 z-55 cursor-se-resize"
        style={{ width: 10, height: 10 }}
        onMouseDown={(e) => handleResizeStart(e, 'bottom-right')}
      />
    </div>
  );
};

export default DraggablePanel;
