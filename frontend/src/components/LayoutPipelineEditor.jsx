import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, ArrowDown, X, Save, Settings, Hash, FileText, ArrowRight, GripVertical, CheckCircle } from 'lucide-react';
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// -----------------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------------

const SectionHeader = ({ title, icon: Icon, colorClass, children }) => (
    <div className={cn("px-4 py-2 border-b border-slate-100 flex items-center justify-between", colorClass)}>
        <div className="flex items-center gap-2">
            {Icon && <Icon className="w-4 h-4" />}
            <h4 className="font-bold text-xs">{title}</h4>
        </div>
        {children}
    </div>
);

const InputGroup = ({ label, children, className }) => (
    <div className={cn("space-y-1", className)}>
        <label className="text-[10px] font-bold text-slate-500 block uppercase tracking-wide">{label}</label>
        {children}
    </div>
);

// -----------------------------------------------------------------------------
// LayoutPipelineEditor Component
// -----------------------------------------------------------------------------

export default function LayoutPipelineEditor({ 
    layout, 
    onChange, // (field, value) => void
    onSave,   // (fullLayoutObject) => void
    onDelete, 
    onCancel,
    previewResult // { validation: [], extractions: [], validation_text: "", extraction_text: "" }
}) {
    // Internal state for the parsed config object
    const [config, setConfig] = useState({
        extractions: [],
        processing: { concat_separator: "_" },
        validation: { keyword: "", filename_suffix: "" }
    });
    
    // Flag to prevent loop updates
    const isInternalUpdate = useRef(false);

    // State for drag and drop
    const [draggedIndex, setDraggedIndex] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);

    // State for identification drag and drop
    const [draggedIdIndex, setDraggedIdIndex] = useState(null);
    const [dragOverIdIndex, setDragOverIdIndex] = useState(null);

    // Initialize from layout prop
    useEffect(() => {
        if (!layout || isInternalUpdate.current) {
            isInternalUpdate.current = false;
            return;
        }

        let parsedConfig = {};
        try {
            parsedConfig = layout.pipeline_config ? JSON.parse(layout.pipeline_config) : {};
        } catch (e) {
            console.error("Failed to parse pipeline_config", e);
        }

        // Identification Logic Initialization:
        // Use validation.steps if available, otherwise fallback to legacy keyword_x0
        const idSteps = parsedConfig.validation?.steps || [
            {
                id: crypto.randomUUID(),
                type: 'coordinate',
                name: '判定エリア1',
                x0: layout.keyword_x0 || 0,
                y0: layout.keyword_y0 || 0,
                x1: layout.keyword_x1 || 0,
                y1: layout.keyword_y1 || 0,
                // value not used here in new single-keyword mode, but kept for structure if needed
            }
        ];

        setConfig({
            extractions: parsedConfig.extractions || [
                { 
                    id: crypto.randomUUID(), 
                    type: 'coordinate', 
                    name: '抽出エリア1',
                    x0: layout.extract_x0 || 0, 
                    y0: layout.extract_y0 || 0, 
                    x1: layout.extract_x1 || 0, 
                    y1: layout.extract_y1 || 0 
                }
            ],
            processing: parsedConfig.processing || {
                remove_whitespace: true,
                uppercase: false,
                remove_pattern: "",
                concat_separator: "_"
            },
            validation: {
                keyword: parsedConfig.validation?.keyword || layout.keyword || "",
                filename_suffix: "",
                steps: idSteps // Add steps to validation
            }
        });
    }, [layout]);

    // Helper to calculate legacy fields from config
    const getLegacyFields = (currentConfig) => {
        const firstCoord = currentConfig.extractions.find(e => e.type === 'coordinate');
        const firstIdStep = currentConfig.validation.steps?.[0]; // Use first step as primary

        return {
            extract_x0: firstCoord ? firstCoord.x0 : 0,
            extract_y0: firstCoord ? firstCoord.y0 : 0,
            extract_x1: firstCoord ? firstCoord.x1 : 0,
            extract_y1: firstCoord ? firstCoord.y1 : 0,
            
            // Sync legacy keyword/area too
            keyword: currentConfig.validation.keyword || "",
            keyword_x0: firstIdStep ? firstIdStep.x0 : 0,
            keyword_y0: firstIdStep ? firstIdStep.y0 : 0,
            keyword_x1: firstIdStep ? firstIdStep.x1 : 0,
            keyword_y1: firstIdStep ? firstIdStep.y1 : 0,

            pipeline_config: JSON.stringify(currentConfig)
        };
    };

    // Unified update handler
    const handleConfigChange = (newConfig) => {
        isInternalUpdate.current = true;
        setConfig(newConfig);
        
        const legacyUpdates = getLegacyFields(newConfig);
        
        onChange('pipeline_config', legacyUpdates.pipeline_config);
        
        onChange('keyword', legacyUpdates.keyword);
        onChange('extract_x0', legacyUpdates.extract_x0);
        onChange('extract_y0', legacyUpdates.extract_y0);
        onChange('extract_x1', legacyUpdates.extract_x1);
        onChange('extract_y1', legacyUpdates.extract_y1);
        
        onChange('keyword_x0', legacyUpdates.keyword_x0);
        onChange('keyword_y0', legacyUpdates.keyword_y0);
        onChange('keyword_x1', legacyUpdates.keyword_x1);
        onChange('keyword_y1', legacyUpdates.keyword_y1);
    };

    const handleSave = () => {
        const legacyUpdates = getLegacyFields(config);
        onSave({
            ...layout,
            ...legacyUpdates
        });
    };

    // --- Action Handlers ---
    const updateConfigSection = (section, updates) => {
        const newConfig = { ...config, [section]: { ...config[section], ...updates } };
        handleConfigChange(newConfig);
    };

    // --- Extraction Handlers ---
    const addExtractionStep = () => {
        const newStep = {
            id: crypto.randomUUID(),
            type: 'coordinate',
            name: `エリア${config.extractions.length + 1}`,
            x0: 0, y0: 0, x1: 0, y1: 0,
            value: "",
            offset: 0
        };
        const newConfig = { ...config, extractions: [...config.extractions, newStep] };
        handleConfigChange(newConfig);
    };

    const updateExtractionStep = (id, field, value) => {
        const newExtractions = config.extractions.map(step => 
            step.id === id ? { ...step, [field]: value } : step
        );
        const newConfig = { ...config, extractions: newExtractions };
        handleConfigChange(newConfig);
    };

    const removeExtractionStep = (id) => {
        const newConfig = { ...config, extractions: config.extractions.filter(s => s.id !== id) };
        handleConfigChange(newConfig);
    };

    // --- Identification Handlers (New) ---
    const addIdentificationStep = () => {
        const currentSteps = config.validation.steps || [];
        const newStep = {
            id: crypto.randomUUID(),
            type: 'coordinate',
            name: `判定エリア${currentSteps.length + 1}`,
            x0: 0, y0: 0, x1: 0, y1: 0,
            value: "",
            offset: 0
        };
        updateConfigSection('validation', { steps: [...currentSteps, newStep] });
    };

    const updateIdentificationStep = (id, field, value) => {
        const currentSteps = config.validation.steps || [];
        const newSteps = currentSteps.map(step => 
            step.id === id ? { ...step, [field]: value } : step
        );
        updateConfigSection('validation', { steps: newSteps });
    };

    const removeIdentificationStep = (id) => {
        const currentSteps = config.validation.steps || [];
        const newSteps = currentSteps.filter(s => s.id !== id);
        updateConfigSection('validation', { steps: newSteps });
    };

    // --- Drag & Drop Handlers (Extraction) ---
    const handleDragStart = (e, index) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e, index) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;
        setDragOverIndex(index);
    };

    const handleDragLeave = () => {
        setDragOverIndex(null);
    };

    const handleDrop = (e, targetIndex) => {
        e.preventDefault();
        setDragOverIndex(null);
        if (draggedIndex === null || draggedIndex === targetIndex) return;
        
        const newExtractions = [...config.extractions];
        const [movedItem] = newExtractions.splice(draggedIndex, 1);
        newExtractions.splice(targetIndex, 0, movedItem);
        
        const newConfig = { ...config, extractions: newExtractions };
        handleConfigChange(newConfig);
        setDraggedIndex(null);
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    // --- Drag & Drop Handlers (Identification) ---
    const handleIdDragStart = (e, index) => {
        setDraggedIdIndex(index);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleIdDragOver = (e, index) => {
        e.preventDefault();
        if (draggedIdIndex === null || draggedIdIndex === index) return;
        setDragOverIdIndex(index);
    };

    const handleIdDragLeave = () => {
        setDragOverIdIndex(null);
    };

    const handleIdDrop = (e, targetIndex) => {
        e.preventDefault();
        setDragOverIdIndex(null);
        if (draggedIdIndex === null || draggedIdIndex === targetIndex) return;
        
        const currentSteps = [...(config.validation.steps || [])];
        const [movedItem] = currentSteps.splice(draggedIdIndex, 1);
        currentSteps.splice(targetIndex, 0, movedItem);
        
        updateConfigSection('validation', { steps: currentSteps });
        setDraggedIdIndex(null);
    };

    const handleIdDragEnd = () => {
        setDraggedIdIndex(null);
        setDragOverIdIndex(null);
    };

    return (
        <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
            {/* 1. Header & Actions (Compact) */}
            <div className="bg-white px-3 py-2 border-b border-slate-200 flex items-center justify-between sticky top-0 z-20 shadow-sm">
                <input 
                    type="text"
                    value={layout.name || ""}
                    onChange={(e) => onChange('name', e.target.value)}
                    className="text-sm font-bold border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none bg-transparent w-full mr-2"
                    placeholder="レイアウト名を入力"
                />
                <div className="flex gap-2 shrink-0">
                    <button onClick={onDelete} className="p-1.5 text-slate-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors" title="削除">
                        <Trash2 className="w-4 h-4" />
                    </button>
                    <button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded text-xs font-bold shadow-sm flex items-center gap-1 transition-colors" title="保存">
                        <Save className="w-3 h-3" /> 保存
                    </button>
                    <button onClick={onCancel} className="p-1.5 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 transition-colors" title="閉じる">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
                
                {/* ------------------------------------------------------------- */}
                {/* A. レイアウト識別 (Identification) */}
                {/* ------------------------------------------------------------- */}
                <div className="bg-white rounded-lg border border-indigo-100 shadow-sm overflow-hidden">
                    <SectionHeader title="A. レイアウト識別 (Identification)" icon={Hash} colorClass="bg-indigo-50 text-indigo-800" />
                    
                    <div className="p-3 space-y-4">
                        {/* Step 1: Area */}
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                                    <span className="bg-indigo-100 text-indigo-700 w-4 h-4 rounded flex items-center justify-center text-[9px]">1</span>
                                    判定エリア (複数指定可)
                                </label>
                            </div>
                            
                            <div className="space-y-2">
                                {(config.validation.steps || []).map((step, index) => (
                                    <div 
                                        key={step.id} 
                                        draggable
                                        onDragStart={(e) => handleIdDragStart(e, index)}
                                        onDragOver={(e) => handleIdDragOver(e, index)}
                                        onDragLeave={handleIdDragLeave}
                                        onDrop={(e) => handleIdDrop(e, index)}
                                        onDragEnd={handleIdDragEnd}
                                        className={cn(
                                            "bg-white border rounded p-2 text-xs shadow-sm relative group transition-all duration-200",
                                            draggedIdIndex === index ? "opacity-50 border-dashed border-indigo-400 bg-indigo-50" : "border-slate-200",
                                            dragOverIdIndex === index && draggedIdIndex !== index ? "border-t-2 border-t-indigo-500 mt-2" : ""
                                        )}
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="cursor-grab hover:bg-slate-100 p-0.5 rounded text-slate-400 active:cursor-grabbing">
                                                <GripVertical className="w-3 h-3" />
                                            </div>
                                            <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 bg-indigo-500">
                                                {index + 1}
                                            </span>
                                            <input 
                                                type="text" 
                                                value={step.name || ""}
                                                onChange={(e) => updateIdentificationStep(step.id, 'name', e.target.value)}
                                                className="font-bold text-slate-700 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 outline-none w-full" 
                                            />
                                            <button 
                                                onClick={() => removeIdentificationStep(step.id)} 
                                                className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                title="削除"
                                            >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>

                                <div className="mb-2">
                                    <div className="flex bg-slate-100 rounded p-0.5 w-max">
                                        <button 
                                            onClick={() => updateIdentificationStep(step.id, 'type', 'coordinate')}
                                            className={cn("px-2 py-0.5 text-[9px] rounded transition-colors", step.type === 'coordinate' ? "bg-white text-indigo-700 shadow-sm font-bold" : "text-slate-400 hover:text-slate-600")}
                                        >
                                            エリア指定
                                        </button>
                                            <button 
                                                onClick={() => updateIdentificationStep(step.id, 'type', 'const')}
                                                className={cn("px-2 py-0.5 text-[9px] rounded transition-colors", step.type === 'const' ? "bg-white text-indigo-700 shadow-sm font-bold" : "text-slate-400 hover:text-slate-600")}
                                            >
                                                固定文字
                                            </button>
                                        </div>
                                    </div>

                                    {step.type === 'coordinate' ? (
                                        <div className="grid grid-cols-4 gap-1.5 mb-2">
                                            {['x0', 'y0', 'x1', 'y1'].map((c) => (
                                                <div key={c} className="flex items-center bg-slate-50 rounded border border-slate-100 px-1">
                                                    <span className="text-[8px] text-slate-400 w-8">判定 {c.toUpperCase()}</span>
                                                    <input 
                                                        type="number" 
                                                        value={step[c] || 0} 
                                                        onChange={(e) => updateIdentificationStep(step.id, c, parseFloat(e.target.value))} 
                                                        className="w-full bg-transparent text-right font-mono outline-none py-0.5" 
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-slate-50 rounded border border-slate-100 p-2 mb-2">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-[9px] font-bold text-slate-500 whitespace-nowrap w-12 text-right">検索文字:</span>
                                            <input 
                                                type="text"
                                                value={step.value || ""}
                                                onChange={(e) => updateIdentificationStep(step.id, 'value', e.target.value)}
                                                className="w-full text-xs bg-transparent border-b border-dashed border-slate-300 focus:border-indigo-500 outline-none"
                                                placeholder="基準となる文字列"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[9px] font-bold text-slate-500 whitespace-nowrap w-12 text-right">相対位置:</span>
                                            <input 
                                                type="number"
                                                value={step.offset || 0}
                                                onChange={(e) => updateIdentificationStep(step.id, 'offset', isNaN(parseInt(e.target.value)) ? 0 : parseInt(e.target.value))}
                                                className="w-12 text-xs bg-white border border-slate-300 rounded px-1 py-0.5 text-right focus:border-indigo-500 outline-none"
                                            />
                                            <span className="text-[8px] text-slate-400 ml-1">
                                                (0:文字自体, &gt;0:後方, &lt;0:前方)
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                        </div>
                        <button 
                            onClick={addIdentificationStep}
                            className="w-full py-2 border border-dashed border-slate-300 rounded text-slate-400 text-xs font-bold hover:bg-slate-50 hover:border-indigo-400 hover:text-indigo-600 transition-colors flex items-center justify-center gap-1 mt-2"
                        >
                            <Plus className="w-3 h-3" /> 判定エリアを追加
                        </button>
                        </div>

                        {/* Step 2: Match Keyword */}
                        <div className="mt-4">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                                <span className="bg-indigo-100 text-indigo-700 w-4 h-4 rounded flex items-center justify-center text-[9px]">2</span>
                                判定キーワード (結合テキストと比較)
                            </label>
                            <div className="bg-slate-50 border border-slate-200 rounded p-2">
                                <span className="text-[10px] text-slate-400 block mb-1">抽出されたテキストを結合し、以下のキーワードが含まれるか判定します:</span>
                                <input 
                                    type="text" 
                                    value={config.validation.keyword}
                                    onChange={(e) => updateConfigSection('validation', { keyword: e.target.value })}
                                    className="w-full text-xs border border-slate-300 rounded px-2 py-2 focus:ring-1 focus:ring-indigo-300 outline-none"
                                    placeholder="例: 請求書番号 (この文字列が含まれるか判定)"
                                />
                            </div>
                        </div>

                        {/* Step 3: Result Preview */}
                        <div className="mt-4">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                                <span className="bg-indigo-100 text-indigo-700 w-4 h-4 rounded flex items-center justify-center text-[9px]">3</span>
                                結果プレビュー (判定)
                            </label>
                            
                            {previewResult?.validation_text ? (
                                <div className="space-y-2">
                                     <div className="bg-indigo-50 border border-indigo-200 rounded p-2">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[9px] font-bold text-indigo-600 uppercase">抽出されたテキスト結合結果</span>
                                        </div>
                                        <div className="font-mono text-xs text-slate-800 break-all bg-white p-1.5 rounded border border-indigo-100">
                                            {previewResult.validation_text}
                                        </div>
                                    </div>
                                    
                                    <div className={cn(
                                        "p-2 rounded border text-xs font-bold flex items-center gap-2",
                                        (config.validation.keyword && previewResult.validation_text.includes(config.validation.keyword)) 
                                            ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                                            : "bg-red-50 border-red-200 text-red-700"
                                    )}>
                                        {(config.validation.keyword && previewResult.validation_text.includes(config.validation.keyword))  
                                            ? <><CheckCircle className="w-4 h-4" /> キーワード一致 (判定OK)</>
                                            : <><X className="w-4 h-4" /> キーワード不一致 (判定NG)</>
                                        }
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-slate-100 border border-slate-200 border-dashed rounded p-2 text-center">
                                    <span className="text-[10px] text-slate-400">ファイルをアップロードすると判定結果が表示されます</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex justify-center -my-2 opacity-30 z-10 relative">
                    <ArrowDown className="w-4 h-4 text-slate-400 bg-slate-50 rounded-full" />
                </div>

                {/* ------------------------------------------------------------- */}
                {/* B. ファイル名生成設定 (Extraction & Processing) */}
                {/* ------------------------------------------------------------- */}
                <div className="bg-white rounded-lg border border-emerald-100 shadow-sm overflow-hidden">
                    <SectionHeader title="B. ファイル名抽出 (Extraction)" icon={FileText} colorClass="bg-emerald-50 text-emerald-800" />
                    
                    <div className="p-3 space-y-4">
                        {/* Step 1: Extraction List */}
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                                    <span className="bg-emerald-100 text-emerald-700 w-4 h-4 rounded flex items-center justify-center text-[9px]">1</span>
                                    抽出エリア
                                </label>
                            </div>
                            
                            <div className="space-y-2">
                         {config.extractions.map((step, index) => (
                            <div 
                                key={step.id} 
                                draggable
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, index)}
                                onDragEnd={handleDragEnd}
                                className={cn(
                                    "bg-white border rounded p-2 text-xs shadow-sm relative group transition-all duration-200",
                                    draggedIndex === index ? "opacity-50 border-dashed border-indigo-400 bg-indigo-50" : "border-slate-200",
                                    dragOverIndex === index && draggedIndex !== index ? "border-t-2 border-t-indigo-500 mt-2" : ""
                                )}
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="cursor-grab hover:bg-slate-100 p-0.5 rounded text-slate-400 active:cursor-grabbing">
                                        <GripVertical className="w-3 h-3" />
                                    </div>
                                    <span className={cn(
                                        "w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0",
                                        index % 3 === 0 ? "bg-emerald-500" : index % 3 === 1 ? "bg-orange-500" : "bg-purple-500"
                                    )}>
                                        {index + 1}
                                    </span>
                                    <input 
                                        type="text" 
                                        value={step.name || ""}
                                        onChange={(e) => updateExtractionStep(step.id, 'name', e.target.value)}
                                        className="font-bold text-slate-700 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-emerald-500 outline-none w-full" 
                                    />
                                    <button 
                                        onClick={() => removeExtractionStep(step.id)} 
                                        className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="削除"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                                <div className="mb-2">
                                    <div className="flex bg-slate-100 rounded p-0.5 w-max">
                                        <button 
                                            onClick={() => updateExtractionStep(step.id, 'type', 'coordinate')}
                                            className={cn("px-2 py-0.5 text-[9px] rounded transition-colors", step.type === 'coordinate' ? "bg-white text-emerald-700 shadow-sm font-bold" : "text-slate-400 hover:text-slate-600")}
                                        >
                                            エリア指定
                                        </button>
                                        <button 
                                            onClick={() => updateExtractionStep(step.id, 'type', 'const')}
                                            className={cn("px-2 py-0.5 text-[9px] rounded transition-colors", step.type === 'const' ? "bg-white text-emerald-700 shadow-sm font-bold" : "text-slate-400 hover:text-slate-600")}
                                        >
                                            固定文字
                                        </button>
                                    </div>
                                </div>

                                {step.type === 'coordinate' ? (
                                    <div className="grid grid-cols-4 gap-1.5">
                                        {['x0', 'y0', 'x1', 'y1'].map((c) => (
                                            <div key={c} className="flex items-center bg-slate-50 rounded border border-slate-100 px-1">
                                                <span className="text-[8px] text-slate-400 w-8">抽出 {c.toUpperCase()}</span>
                                                <input 
                                                    type="number" 
                                                    value={step[c] || 0} 
                                                    onChange={(e) => updateExtractionStep(step.id, c, parseFloat(e.target.value))} 
                                                    className="w-full bg-transparent text-right font-mono outline-none py-0.5" 
                                                />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="bg-slate-50 rounded border border-slate-100 p-2">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-[9px] font-bold text-slate-500 whitespace-nowrap w-12 text-right">検索文字:</span>
                                            <input 
                                                type="text"
                                                value={step.value || ""}
                                                onChange={(e) => updateExtractionStep(step.id, 'value', e.target.value)}
                                                className="w-full text-xs bg-transparent border-b border-dashed border-slate-300 focus:border-emerald-500 outline-none"
                                                placeholder="基準となる文字列"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[9px] font-bold text-slate-500 whitespace-nowrap w-12 text-right">相対位置:</span>
                                            <input 
                                                type="number"
                                                value={step.offset || 0}
                                                onChange={(e) => updateExtractionStep(step.id, 'offset', isNaN(parseInt(e.target.value)) ? 0 : parseInt(e.target.value))}
                                                className="w-12 text-xs bg-white border border-slate-300 rounded px-1 py-0.5 text-right focus:border-emerald-500 outline-none"
                                            />
                                            <span className="text-[8px] text-slate-400 ml-1">
                                                (0:文字自体, &gt;0:後方, &lt;0:前方)
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                        </div>
                        <button 
                            onClick={addExtractionStep}
                            className="w-full py-2 border border-dashed border-slate-300 rounded text-slate-400 text-xs font-bold hover:bg-slate-50 hover:border-emerald-400 hover:text-emerald-600 transition-colors flex items-center justify-center gap-1 mt-2"
                        >
                            <Plus className="w-3 h-3" /> 抽出箇所を追加
                        </button>
                        </div>

                        {/* Step 2: Processing Rules */}
                        <div className="mt-4 space-y-2">
                             <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                                <span className="bg-emerald-100 text-emerald-700 w-4 h-4 rounded flex items-center justify-center text-[9px]">2</span>
                                文字列加工
                            </label>
                            
                            <div className="bg-slate-50 p-2 rounded border border-slate-200">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-[10px] text-slate-500 font-bold">結合文字:</span>
                                    <div className="flex gap-2">
                                        {['_', '-', ' ', ''].map(sep => (
                                            <label key={sep} className="flex items-center gap-0.5 cursor-pointer hover:bg-white rounded px-1 transition-colors">
                                                <input 
                                                    type="radio" 
                                                    name="separator"
                                                    value={sep}
                                                    checked={config.processing.concat_separator === sep}
                                                    onChange={() => updateConfigSection('processing', { concat_separator: sep })}
                                                    className="accent-emerald-600 w-3 h-3"
                                                />
                                                <code className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-200 min-w-[1.2em] text-center font-mono">
                                                    {sep === '' ? '無し' : sep === ' ' ? 'スペース' : sep}
                                                </code>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="flex items-center gap-1.5 cursor-pointer hover:bg-white p-1 rounded transition-colors">
                                        <input 
                                            type="checkbox" 
                                            checked={config.processing.remove_whitespace || false}
                                            onChange={(e) => updateConfigSection('processing', { remove_whitespace: e.target.checked })}
                                            className="w-3 h-3 accent-emerald-600 rounded" 
                                        />
                                        <span className="text-[10px] text-slate-600">空白削除 (全角/半角)</span>
                                    </label>
                                    <label className="flex items-center gap-1.5 cursor-pointer hover:bg-white p-1 rounded transition-colors">
                                        <input 
                                            type="checkbox" 
                                            checked={config.processing.uppercase || false}
                                            onChange={(e) => updateConfigSection('processing', { uppercase: e.target.checked })}
                                            className="w-3 h-3 accent-emerald-600 rounded" 
                                        />
                                        <span className="text-[10px] text-slate-600">英字大文字化</span>
                                    </label>
                                </div>
                                <div className="mt-2 flex items-center gap-2 text-[10px] p-1 border-t border-slate-100 pt-2">
                                    <span className="text-slate-400">除去パターン(正規表現):</span>
                                    <input 
                                        type="text" 
                                        value={config.processing.remove_pattern || ""}
                                        onChange={(e) => updateConfigSection('processing', { remove_pattern: e.target.value })}
                                        className="flex-1 border-b border-slate-300 focus:border-emerald-500 outline-none bg-transparent"
                                        placeholder="例: [^0-9]"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Step 3: Result Preview */}
                        <div className="mt-4">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                                <span className="bg-emerald-100 text-emerald-700 w-4 h-4 rounded flex items-center justify-center text-[9px]">3</span>
                                結果プレビュー (ファイル名)
                            </label>
                            
                            {previewResult?.extraction_text ? (
                                <div className="space-y-2">
                                     <div className="bg-emerald-50 border border-emerald-200 rounded p-2">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[9px] font-bold text-emerald-600 uppercase">生成ファイル名</span>
                                        </div>
                                        <div className="font-mono text-base font-bold text-slate-800 break-all bg-white p-2 rounded border border-emerald-100 shadow-sm text-center">
                                            {previewResult.extraction_text}
                                        </div>
                                    </div>

                                    {previewResult.extractions && previewResult.extractions.length > 0 && (
                                        <div className="bg-slate-50 rounded p-2 text-[9px] border border-slate-100">
                                            <h5 className="font-bold text-slate-400 mb-1">抽出内訳:</h5>
                                            <ul className="space-y-1">
                                                {previewResult.extractions.map((ex, i) => (
                                                    <li key={i} className="flex gap-2 items-start">
                                                        <span className="font-bold text-slate-500 w-4">#{i+1}</span>
                                                        <span className="font-mono text-slate-700 bg-white px-1 rounded border border-slate-200 truncate flex-1 block">
                                                            {ex.text || <span className="text-slate-300 italic">(空)</span>}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="bg-slate-100 border border-slate-200 border-dashed rounded p-2 text-center">
                                    <span className="text-[10px] text-slate-400">ファイルをアップロードすると生成されるファイル名が表示されます</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}