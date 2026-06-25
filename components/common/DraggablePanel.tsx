
import React, { useState, useRef, useEffect } from 'react';
import { X, GripHorizontal } from 'lucide-react';

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
  className = ''
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
        y: Math.max(0, Math.min(prev.y, window.innerHeight - size.h))
    }));
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        setPosition({
          x: Math.max(0, Math.min(window.innerWidth - size.w, startPosRef.current.x + dx)),
          y: Math.max(0, Math.min(window.innerHeight - size.h, startPosRef.current.y + dy))
        });
      }
      if (isResizing) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        setSize({
          w: Math.max(minWidth, startSizeRef.current.w + dx),
          h: Math.max(minHeight, startSizeRef.current.h + dy)
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
    document.body.style.cursor = 'se-resize';
  };

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className={`absolute flex flex-col bg-white/95 backdrop-blur-md border border-slate-200 shadow-2xl rounded-lg overflow-hidden z-30 transition-opacity duration-200 ${className}`}
      style={{
        left: position.x,
        top: position.y,
        width: size.w,
        height: size.h,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200 cursor-move select-none flex-shrink-0"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2 text-slate-700 font-medium text-sm pointer-events-none">
          {Icon && <Icon size={16} className="text-blue-600" />}
          <span>{title}</span>
        </div>
        <div className="flex items-center gap-1">
            <GripHorizontal size={14} className="text-slate-300 mr-2" />
            <button
            onClick={onClose}
            className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-red-500 transition-colors no-drag"
            >
            <X size={16} />
            </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {children}
      </div>

      {/* Resize Handle */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
        onMouseDown={handleResizeStart}
      >
        <svg viewBox="0 0 6 6" className="w-2 h-2 fill-slate-400 absolute bottom-1 right-1 pointer-events-none">
           <path d="M6 6L6 0L0 6Z" />
        </svg>
      </div>
    </div>
  );
};

export default DraggablePanel;
