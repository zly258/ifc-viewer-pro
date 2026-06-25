
import React, { useEffect, useRef, useState } from 'react';
import { ifcManager } from '../services/ifcManager';
import { IFCElementData } from '../types';
import { AlertTriangle } from 'lucide-react';

interface Viewer3DProps {
  onSelectElement: (data: IFCElementData | null) => void;
  onLoadingStatus: (isLoading: boolean, progress: number) => void;
  onProcessingStatus: (status: string | null) => void; 
  file: File | null;
}

const Viewer3D: React.FC<Viewer3DProps> = ({ onSelectElement, onLoadingStatus, onProcessingStatus, file }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (containerRef.current) {
      ifcManager.init(containerRef.current);
      
      ifcManager.onSelect = (data) => {
        onSelectElement(data);
      };

      ifcManager.onLoading = (progress, total) => {
        onLoadingStatus(progress < 100, progress);
      };

      ifcManager.onProcessing = (message) => {
        onProcessingStatus(message);
      };

      ifcManager.onError = (msg) => {
        setError(msg);
        setTimeout(() => setError(null), 5000);
      };
    }

    return () => {
      ifcManager.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (file) {
      ifcManager.loadIfc(file);
    }
  }, [file]);

  return (
    <div className="relative w-full h-full bg-slate-50 overflow-hidden group">
      <div ref={containerRef} className="absolute inset-0 z-0" />
      
      {/* 错误提示 */}
      {error && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded shadow-lg flex items-center gap-2 animate-bounce z-50">
           <AlertTriangle className="w-5 h-5 text-white" />
           <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export default Viewer3D;
