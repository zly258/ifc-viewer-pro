import React, { useState } from 'react';
import { IFCElementData } from '../types';
import { Box, Hash, ChevronDown, ChevronRight, Search } from 'lucide-react';

interface PropertyPanelProps {
  data: IFCElementData | null;
}

const PropertyGroup = ({ 
    name, 
    props, 
    defaultOpen = false,
    forceOpen = false 
}: { 
    name: string; 
    props: any[]; 
    defaultOpen?: boolean;
    forceOpen?: boolean;
}) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    
    // Auto-open groups when searching
    const showContent = forceOpen || isOpen;

    return (
        <div className="border-b border-slate-100 last:border-0">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-3 py-2 flex items-center gap-2 bg-slate-50/50 hover:bg-slate-100 transition-colors text-xs font-bold text-slate-700"
            >
                {showContent ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                <span className="truncate pr-1">{name}</span>
                <span className="ml-auto text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-bold">{props.length}</span>
            </button>
            
            {showContent && (
                <div className="bg-white border-l-2 border-blue-100 ml-6 pl-2 my-0.5">
                    {props.map((prop, idx) => (
                        <div key={idx} className="flex text-xs border-b border-slate-50 last:border-0 hover:bg-blue-50/30 group">
                            <div 
                                className="w-[42%] px-3 py-2 text-slate-500 font-semibold truncate whitespace-nowrap border-r border-slate-50/80" 
                                title={prop.name}
                            >
                                {prop.name}
                            </div>
                            <div 
                                className="w-[58%] px-3 py-2 text-slate-700 font-mono font-medium truncate whitespace-nowrap select-text" 
                                title={String(prop.value)}
                            >
                                {String(prop.value)}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const PropertyPanel: React.FC<PropertyPanelProps> = ({ data }) => {
  const [searchQuery, setSearchQuery] = useState('');

  if (!data) {
    return (
      <div className="h-full flex flex-col bg-white">
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center select-none">
            <Box className="w-16 h-16 mb-4 opacity-10" />
            <p className="text-sm font-medium text-slate-500">未选择构件</p>
            <p className="text-xs mt-1 text-slate-400">请在 3D 视图中点击模型</p>
        </div>
      </div>
    );
  }

  const q = searchQuery.toLowerCase().trim();
  const filteredProps = data.properties.filter(prop => {
      if (!q) return true;
      return (
          (prop.name || '').toLowerCase().includes(q) || 
          String(prop.value || '').toLowerCase().includes(q) || 
          (prop.setName || '').toLowerCase().includes(q)
      );
  });

  // Group properties
  const groupedProps: Record<string, any[]> = {};
  
  // Sort: Info first, then alphabetical Psets
  const sortedProps = [...filteredProps].sort((a, b) => {
      if (a.setName === 'Info') return -1;
      if (b.setName === 'Info') return 1;
      return (a.setName || '').localeCompare(b.setName || '');
  });

  sortedProps.forEach(prop => {
    const set = prop.setName || 'General';
    if (!groupedProps[set]) groupedProps[set] = [];
    groupedProps[set].push(prop);
  });

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Dynamic Header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-white shadow-sm z-10">
         <div className="flex items-center gap-2 mb-1.5">
             <Box className="w-4 h-4 text-blue-600 shrink-0" />
             <span className="font-bold text-slate-800 text-sm truncate" title={data.name || data.type}>
                 {data.name || data.type}
             </span>
         </div>
         <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono pl-6">
             <div className="flex items-center gap-1 bg-slate-100 px-1.5 rounded font-bold">
                <Hash size={10} />
                <span>{data.expressID}</span>
             </div>
             <span className="font-semibold bg-blue-50 text-blue-600 px-1.5 rounded">{data.type}</span>
         </div>
      </div>

      {/* Property Search Box */}
      <div className="p-2 border-b border-slate-100 bg-slate-50/50">
          <div className="relative">
              <input 
                  type="text"
                  placeholder="输入检索属性名称或属性值..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-semibold placeholder-slate-400"
              />
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
      </div>

      {/* Property Grid */}
      <div className="flex-1 overflow-y-auto">
        {Object.keys(groupedProps).length > 0 ? (
          Object.entries(groupedProps).map(([setName, props]) => (
            <PropertyGroup 
               key={setName} 
               name={setName} 
               props={props} 
               defaultOpen={setName === 'Info' || setName === 'Pset_QuantityTakeOff' || setName.includes('Common')} 
               forceOpen={!!searchQuery}
            />
          ))
        ) : (
          <div className="p-8 text-center text-xs text-slate-400">
             无匹配属性
          </div>
        )}
        <div className="h-8"></div>
      </div>
    </div>
  );
};

export default PropertyPanel;
