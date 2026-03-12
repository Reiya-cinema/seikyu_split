import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Upload, FileText, CheckCircle, Split, Settings, List, Plus, Save, Trash2, ArrowRight, Loader2, AlertCircle, Eye, X, RotateCcw, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import * as Tabs from '@radix-ui/react-tabs';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Utility function inline to avoid import issues in build
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const API_BASE_URL = import.meta.env.PROD ? '' : 'http://localhost:8000';
const isStaging = import.meta.env.VITE_APP_ENV === 'staging';

function App() {
  const [activeTab, setActiveTab] = useState('main');
  const [currentStep, setCurrentStep] = useState(1); // 1: Upload, 2: Analysis, 3: Output
  
  // File & Scan State
  const [file, setFile] = useState(null);
  const [scanResults, setScanResults] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const fileInputRef = useRef(null);
  const [expandedRows, setExpandedRows] = useState(new Set());

  // Settings State
  const [layouts, setLayouts] = useState([]);
  const [selectedLayoutId, setSelectedLayoutId] = useState(null);
  const [editingLayout, setEditingLayout] = useState({
      name: '新規レイアウト', 
      keyword: '', 
      keyword_x0: 100, keyword_y0: 100, keyword_x1: 200, keyword_y1: 200,
      extract_x0: 100, extract_y0: 100, extract_x1: 200, extract_y1: 200
  });

  // Preview State
  const [previewFile, setPreviewFile] = useState(null);
  const previewInputRef = useRef(null);
  const [testExtractResult, setTestExtractResult] = useState(null);
  const [isTestExtracting, setIsTestExtracting] = useState(false);
  const [testKeywordResult, setTestKeywordResult] = useState(null);
  const [isTestKeyword, setIsTestKeyword] = useState(false);

  // Layout Checkbox State for Scan
  const [selectedScanLayoutIds, setSelectedScanLayoutIds] = useState(new Set());

  // Fetch layouts on load
  useEffect(() => {
    fetchLayouts();
  }, []);

  // Initialize selected layouts when layouts are loaded (Select All by default)
  useEffect(() => {
    if (layouts.length > 0) {
        setSelectedScanLayoutIds(new Set(layouts.map(l => l.id)));
    }
  }, [layouts]);

  const fetchLayouts = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/settings`);
      setLayouts(res.data);
    } catch (err) {
      console.error("Failed to fetch layouts", err);
    }
  };

  // --- Main Tab Logic ---

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Validate PDF
      if (selectedFile.type !== 'application/pdf') {
        setError('PDFファイルのみアップロード可能です。');
        return;
      }
      setFile(selectedFile);
      setError(null);
      setSuccessMsg(null);
      setCurrentStep(2); // Go to Analysis step
    }
  };

  const handleScan = async (uploadedFile) => {
    const fileToScan = uploadedFile || file;
    if (!fileToScan) return;

    if (selectedScanLayoutIds.size === 0) {
        if (!window.confirm("レイアウトが1つも選択されていません。\n解析を実行してもPDFはすべて不明として処理されますが、よろしいですか？")) {
            return;
        }
    }

    setIsProcessing(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', fileToScan);
    
    // Add selected layout IDs (comma separated)
    const layoutIdList = Array.from(selectedScanLayoutIds);
    if (layoutIdList.length > 0) {
        formData.append('layout_ids', layoutIdList.join(','));
    }

    try {
      const res = await axios.post(`${API_BASE_URL}/api/scan`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      let processedData = res.data.map(item => ({
        ...item,
        is_output_target: true,
        should_merge: false
      }));

      // Sort by extracted_text (filename)
      processedData.sort((a, b) => {
          const textA = (a.extracted_text || "").toString();
          const textB = (b.extracted_text || "").toString();
          if (textA === textB) {
              return a.page_number - b.page_number; // Keep pages in order for same file
          }
          return textA.localeCompare(textB, 'ja');
      });

      // Mark duplicates for merge automatically
      // Iterate from second item
      for (let i = 1; i < processedData.length; i++) {
          const prev = processedData[i-1];
          const curr = processedData[i];
          // If current has a filename and matches previous, set merge flag
          if (curr.extracted_text && prev.extracted_text === curr.extracted_text) {
              curr.should_merge = true;
          }
      }

      setScanResults(processedData);
      setCurrentStep(3); // Go to Output step
    } catch (err) {
      console.error(err);
      setError('ファイルの解析に失敗しました。サーバーの状態を確認してください。');
      setScanResults([]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleScanLayout = (id) => {
      const newSelected = new Set(selectedScanLayoutIds);
      if (newSelected.has(id)) {
          newSelected.delete(id);
      } else {
          newSelected.add(id);
      }
      setSelectedScanLayoutIds(newSelected);
  };

  const handleSelectAllScanLayouts = (checked) => {
      if (checked) {
          setSelectedScanLayoutIds(new Set(layouts.map(l => l.id)));
      } else {
          setSelectedScanLayoutIds(new Set());
      }
  };

  const handleResultChange = (index, field, value) => {
    const newResults = [...scanResults];
    newResults[index][field] = value;
    setScanResults(newResults);
  };

  const handleExecuteSplit = async () => {
    if (!file || scanResults.length === 0) return;
    
    setIsProcessing(true);
    const formData = new FormData();
    formData.append('file', file);
    // Only send selected items
    const selectedResults = scanResults.filter(r => r.is_output_target);
    if (selectedResults.length === 0) {
        setError('出力対象のファイルが選択されていません。');
        setIsProcessing(false);
        return;
    }
    formData.append('metadata', JSON.stringify(selectedResults));

    try {
      const res = await axios.post(`${API_BASE_URL}/api/execute`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `split_invoices_${new Date().getTime()}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setSuccessMsg('分割処理が完了しました。ダウンロードが開始されます。');
    } catch (err) {
      console.error(err);
      setError('分割処理に失敗しました。');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetAll = () => {
    setFile(null);
    setScanResults([]);
    setError(null);
    setSuccessMsg(null);
    setCurrentStep(1); // Reset to Upload step
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- Settings Tab Logic ---

  const handleSelectLayout = (layout) => {
    setSelectedLayoutId(layout.id);
    setEditingLayout({ ...layout });
    // Reset preview
    setPreviewFile(null);
    setTestExtractResult(null);
    setTestKeywordResult(null);
  };

  const handleNewLayout = async () => {
    // Reset preview and errors first
    setPreviewFile(null);
    setTestExtractResult(null);
    setTestKeywordResult(null);
    setError(null);
    setSuccessMsg(null);

    // Initial data for new layout
    const initialData = {
      name: '新規レイアウト', 
      keyword: '', 
      keyword_x0: 50, keyword_y0: 50, keyword_x1: 150, keyword_y1: 150,
      extract_x0: 50, extract_y0: 50, extract_x1: 150, extract_y1: 150
    };

    try {
        // Create immediately on server to get an ID
        const res = await axios.post(`${API_BASE_URL}/api/settings`, initialData);
        const createdLayout = res.data;
        
        // Add to list and select it
        setLayouts([...layouts, createdLayout]);
        setSelectedLayoutId(createdLayout.id);
        setEditingLayout(createdLayout);
    } catch (err) {
        console.error("Failed to create new layout", err);
        setError("新規レイアウトの作成に失敗しました。");
    }
  };

  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });

    const sortedResults = [...scanResults].sort((a, b) => {
      let valA = a[key];
      let valB = b[key];

      // Handle nulls/undefined
      if (valA === undefined || valA === null) valA = "";
      if (valB === undefined || valB === null) valB = "";

      // Special handling for layout_name to sort Unknown last or first
      if (key === 'layout_name') {
        if (valA === 'Unknown') valA = 'zzzz'; // Push to end
        if (valB === 'Unknown') valB = 'zzzz';
      }

      // Check if number
      if (key === 'page_number') {
        return direction === 'asc' ? valA - valB : valB - valA;
      }

      // String comparison
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();

      if (strA < strB) return direction === 'asc' ? -1 : 1;
      if (strA > strB) return direction === 'asc' ? 1 : -1;
      return 0;
    });

    setScanResults(sortedResults);
  };

  const RenderSortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
    if (sortConfig.direction === 'asc') return <ArrowUp className="w-3 h-3 text-indigo-600" />;
    return <ArrowDown className="w-3 h-3 text-indigo-600" />;
  };

  const handleLayoutChange = (field, value) => {
    setEditingLayout(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const toggleRowExpansion = (index) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
        newExpanded.delete(index);
    } else {
        newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  const handleExtractTest = async () => {
    if (!previewFile) {
      setError("テスト用PDFを右側のプレビューエリアにアップロードしてください。");
      return;
    }
    
    // 座標チェック
    if (editingLayout.extract_x1 <= editingLayout.extract_x0 || 
        editingLayout.extract_y1 <= editingLayout.extract_y0) {
      setError("抽出エリアの座標が正しくありません (終了位置 > 開始位置)。");
      return;
    }

    setIsTestExtracting(true);
    setTestExtractResult(null);
    setError(null);
    
    const formData = new FormData();
    formData.append('x0', editingLayout.extract_x0);
    formData.append('y0', editingLayout.extract_y0);
    formData.append('x1', editingLayout.extract_x1);
    formData.append('y1', editingLayout.extract_y1);
    formData.append('file', previewFile);
    
    try {
      const res = await axios.post(`${API_BASE_URL}/api/extract_text`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setTestExtractResult(res.data.text || "(抽出されたテキストはありません)");
    } catch (err) {
      console.error(err);
      setError("テキスト抽出テストに失敗しました。");
    } finally {
      setIsTestExtracting(false);
    }
  };

  const handleKeywordTest = async () => {
    if (!previewFile) {
        setError("テスト用PDFを右側のプレビューエリアにアップロードしてください。");
        return;
    }

    // 座標チェック
    if (editingLayout.keyword_x1 <= editingLayout.keyword_x0 || 
        editingLayout.keyword_y1 <= editingLayout.keyword_y0) {
        setError("識別キーワードエリアの座標が正しくありません (終了位置 > 開始位置)。");
        return;
    }

    setIsTestKeyword(true);
    setTestKeywordResult(null);
    setError(null);

    const formData = new FormData();
    formData.append('x0', editingLayout.keyword_x0);
    formData.append('y0', editingLayout.keyword_y0);
    formData.append('x1', editingLayout.keyword_x1);
    formData.append('y1', editingLayout.keyword_y1);
    formData.append('file', previewFile);

    try {
        const res = await axios.post(`${API_BASE_URL}/api/extract_text`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
        });
        setTestKeywordResult(res.data.text || "(抽出されたテキストはありません)");
    } catch (err) {
        console.error(err);
        setError("キーワード抽出テストに失敗しました。");
    } finally {
        setIsTestKeyword(false);
    }
  };

  const validateLayout = () => {
      if (!editingLayout.name) return "レイアウト名は必須です";
      if (!editingLayout.keyword) return "識別キーワードは必須です";

      // Keyword Area Validation (Mandatory)
      if (editingLayout.keyword_x1 <= editingLayout.keyword_x0 || 
          editingLayout.keyword_y1 <= editingLayout.keyword_y0) {
          return "識別キーワードエリアの座標が正しくありません (終了位置 > 開始位置)";
      }
      if (editingLayout.keyword_x1 === 0 && editingLayout.keyword_y1 === 0) {
          return "識別キーワードエリアは必須項目です";
      }

      // Extract Area Validation (Warning but not strictly blocking if they want manual entry?)
      // User didn't say Extract Area is mandatory, but implicitly it is for the tool to work.
      // Let's keep it consistent.
      if (editingLayout.extract_x1 <= editingLayout.extract_x0 || 
          editingLayout.extract_y1 <= editingLayout.extract_y0) {
          return "抽出エリアの座標が正しくありません";
      }
      return null;
  };

  const handleSaveLayout = async () => {
    const errorMsg = validateLayout();
    if (errorMsg) {
        setError(errorMsg);
        return;
    }

    try {
      if (selectedLayoutId) {
          // Update existing layout
          // Strip ID from payload if necessary, though FastAPI handles it usually. 
          // Safest to just send the fields we edit or the whole object if backend is lenient.
          // We will send editingLayout as is, assuming backend ignores 'id' in body or matches it.
          const res = await axios.put(`${API_BASE_URL}/api/settings/${selectedLayoutId}`, editingLayout);
          
          // Only update the specific item in the list
          setLayouts(layouts.map(l => l.id === selectedLayoutId ? res.data : l));
          setSuccessMsg(`レイアウト「${res.data.name}」を更新しました。`);
      } else {
          // Fallback: Create new layout if no ID (e.g. after delete but user types and saves)
          const res = await axios.post(`${API_BASE_URL}/api/settings`, editingLayout);
          const createdLayout = res.data;
          
          setSelectedLayoutId(createdLayout.id);
          setLayouts([...layouts, createdLayout]);
          setSuccessMsg(`レイアウト「${createdLayout.name}」を保存しました。`);
      }
      
      setError(null);
    } catch (err) {
        console.error(err);
        setError('設定の保存に失敗しました。');
    }
  };

  const handleDeleteLayout = async () => {
      if (!selectedLayoutId) return;
      if (!window.confirm("このレイアウトを削除してもよろしいですか？")) return;

      try {
          await axios.delete(`${API_BASE_URL}/api/settings/${selectedLayoutId}`);
          
          // Decrease layout count / remove from list
          const remainingLayouts = layouts.filter(l => l.id !== selectedLayoutId);
          setLayouts(remainingLayouts);
          
          // Reset selection to empty state
          setSelectedLayoutId(null);
          setEditingLayout({
            name: '新規レイアウト', 
            keyword: '', 
            keyword_x0: 50, keyword_y0: 50, keyword_x1: 150, keyword_y1: 150,
            extract_x0: 50, extract_y0: 50, extract_x1: 150, extract_y1: 150
          });
          
          setSuccessMsg("レイアウトを削除しました。");
      } catch (err) {
          console.error(err);
          setError("レイアウトの削除に失敗しました。");
      }
  };

  return (
    <div className={cn(
        "min-h-screen font-sans selection:bg-indigo-100 selection:text-indigo-900 border-t-8",
        isStaging ? "bg-red-50 border-red-600" : "bg-slate-50 border-indigo-600"
    )}>
      
      {/* Navbar */}
      <nav className={cn(
        "border-b px-8 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10",
        isStaging ? "bg-red-600 border-red-700 text-white" : "bg-white border-slate-200"
      )}>
        <div className="flex items-center gap-2">
          <div className={cn(
            "p-1.5 rounded-lg",
            isStaging ? "bg-white text-red-600" : "bg-indigo-600 text-white"
          )}>
            <Split className="w-5 h-5" />
          </div>
          <span className={cn(
            "text-xl font-bold",
            isStaging ? "text-white" : "bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-indigo-500"
          )}>
            {isStaging ? "pdfファイル分割 (Staging)" : "pdfファイル分割"}
          </span>
        </div>
        <div className={cn("flex items-center gap-4 text-sm", isStaging ? "text-red-100" : "text-slate-500")}>
            {isProcessing && <div className={cn("flex items-center gap-2 px-3 py-1 rounded-full", isStaging ? "bg-white/20 text-white" : "text-indigo-600 bg-indigo-50")}><Loader2 className="w-4 h-4 animate-spin" /> Processing...</div>}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-8">
        
        {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700 animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p>{error}</p>
            </div>
        )}

        {successMsg && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3 text-emerald-700 animate-in fade-in slide-in-from-top-2">
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
                <p>{successMsg}</p>
            </div>
        )}

        <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="w-full">
          <Tabs.List className="flex gap-6 mb-8 border-b border-slate-200">
            <Tabs.Trigger 
              value="main"
              className={cn(
                "pb-3 px-1 text-sm font-medium transition-all duration-200 border-b-2 flex items-center gap-2 outline-none",
                activeTab === 'main' 
                  ? "border-indigo-600 text-indigo-600" 
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              )}
            >
              <FileText className="w-4 h-4" /> メイン操作（分割・結合）
            </Tabs.Trigger>
            <Tabs.Trigger 
              value="settings"
              className={cn(
                "pb-3 px-1 text-sm font-medium transition-all duration-200 border-b-2 flex items-center gap-2 outline-none",
                activeTab === 'settings' 
                  ? "border-indigo-600 text-indigo-600" 
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              )}
            >
              <Settings className="w-4 h-4" /> レイアウト設定
            </Tabs.Trigger>
          </Tabs.List>

          {/* Main Tab Content */}
          <Tabs.Content value="main" className="outline-none animate-in fade-in zoom-in-95 duration-300">
            {/* Stepper */}
            <div className="flex items-center justify-between mb-8 max-w-3xl mx-auto px-4">
               {['PDFアップロード', '解析実行', '結果・出力'].map((label, index) => {
                   const stepNum = index + 1;
                   const isActive = currentStep === stepNum;
                   const isCompleted = currentStep > stepNum;
                   
                   return (
                       <div key={label} className="flex flex-col items-center relative z-10 w-1/3">
                           <div className={cn(
                               "w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 border-2",
                               isActive ? "bg-indigo-600 border-indigo-600 text-white scale-110 shadow-md" : 
                               isCompleted ? "bg-emerald-500 border-emerald-500 text-white" : 
                               "bg-white border-slate-200 text-slate-400"
                           )}>
                               {isCompleted ? <CheckCircle className="w-6 h-6" /> : stepNum}
                           </div>
                           <span className={cn(
                               "text-xs mt-2 font-medium transition-colors",
                               isActive ? "text-indigo-700" : isCompleted ? "text-emerald-600" : "text-slate-400"
                           )}>{label}</span>
                           
                           {/* Connector Line */}
                           {index < 2 && (
                               <div className="absolute top-5 left-[50%] w-full h-[2px] -z-10 bg-slate-100">
                                   <div className={cn(
                                       "h-full transition-all duration-500",
                                       isCompleted ? "bg-emerald-500 w-full" : "w-0"
                                   )}></div>
                               </div>
                           )}
                       </div>
                   )
               })}
            </div>

            <div className="max-w-4xl mx-auto">
              
              {/* Step 1: Upload */}
              {currentStep === 1 && (
                <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="group border-2 border-dashed border-slate-300 rounded-xl p-12 text-center bg-white hover:bg-slate-50/50 hover:border-indigo-400 transition-all cursor-pointer shadow-sm hover:shadow-md h-80 flex flex-col items-center justify-center"
                >
                    <input 
                        type="file" 
                        accept=".pdf" 
                        ref={fileInputRef} 
                        className="hidden" 
                        onChange={handleFileSelect}
                    />
                    <div className="bg-indigo-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-300">
                      <Upload className="w-10 h-10 text-indigo-600" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-2">分割したい請求書PDFを選択</h3>
                    <p className="text-slate-500 max-w-sm mx-auto mb-8 text-sm">
                      ここにファイルをドラッグ＆ドロップするか、<br/>クリックしてファイルを選択してください。
                    </p>
                    <button className="bg-white border border-slate-300 text-slate-700 font-medium py-3 px-8 rounded-lg shadow-sm hover:bg-slate-50 hover:text-indigo-600 transition-colors pointer-events-none">
                      ファイルを選択
                    </button>
                    <p className="text-xs text-slate-400 mt-4">対応フォーマット: PDF (最大 50MB)</p>
                </div>
              )}

              {/* Step 2: Analysis */}
              {currentStep === 2 && file && (
                  <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden text-center py-12 px-6">
                      <div className="mb-6 inline-flex p-4 rounded-full bg-red-100 text-red-600 relative">
                        <FileText className="w-12 h-12" />
                        <button onClick={resetAll} className="absolute -top-2 -right-2 bg-white text-slate-400 p-1 rounded-full border border-slate-200 hover:text-red-500 hover:border-red-300 shadow-sm" title="キャンセル">
                             <X className="w-4 h-4" />
                        </button>
                      </div>
                      
                      <h3 className="text-xl font-bold text-slate-800 mb-2">{file.name}</h3>
                      <p className="text-slate-500 mb-8 font-mono bg-slate-100 inline-block px-3 py-1 rounded text-sm">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                      
                      <div className="max-w-md mx-auto">
                        <p className="text-sm text-slate-600 mb-6 bg-indigo-50 p-4 rounded-lg border border-indigo-100 text-left">
                            <span className="font-bold text-indigo-700 block mb-1">処理内容:</span>
                            PDFに含まれるすべてのページをスキャンし、レイアウト設定に基づいて自動的に仕分けを行います。
                        </p>
                        
                        <div className="mb-6 p-4 bg-white rounded-lg border border-slate-200 shadow-sm text-left">
                           <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                             <span className="font-bold text-sm text-slate-700">使用するレイアウトを選択</span>
                             <label className="text-xs text-indigo-600 cursor-pointer hover:underline flex items-center gap-1">
                                <input 
                                    type="checkbox" 
                                    className="accent-indigo-600 w-3 h-3"
                                    checked={layouts.length > 0 && selectedScanLayoutIds.size === layouts.length}
                                    onChange={(e) => handleSelectAllScanLayouts(e.target.checked)}
                                />
                                全て選択
                             </label>
                           </div>
                           <div className="max-h-40 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                               {layouts.length === 0 ? (
                                   <p className="text-xs text-slate-400 text-center py-2">レイアウトが見つかりません</p>
                               ) : (
                                   layouts.map(layout => (
                                       <label key={layout.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1.5 rounded transition-colors group">
                                           <input 
                                              type="checkbox" 
                                              className="accent-indigo-600 w-4 h-4"
                                              checked={selectedScanLayoutIds.has(layout.id)}
                                              onChange={() => handleToggleScanLayout(layout.id)}
                                           />
                                           <div className="flex-1 min-w-0">
                                               <div className="text-sm font-medium text-slate-700 truncate group-hover:text-indigo-700">{layout.name}</div>
                                               <div className="text-[10px] text-slate-400 truncate">KW: {layout.keyword}</div>
                                           </div>
                                       </label>
                                   ))
                               )}
                           </div>
                           <div className="mt-2 text-right">
                               <span className="text-xs text-slate-400">
                                   選択済み: {selectedScanLayoutIds.size} / {layouts.length}
                               </span>
                           </div>
                        </div>

                        <button 
                            onClick={() => handleScan(file)}
                            disabled={isProcessing}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed group"
                        >
                            {isProcessing ? (
                                <>
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                    <span>解析中...</span>
                                </>
                            ) : (
                                <>
                                    <span>解析を開始する</span>
                                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>
                      </div>
                  </div>
              )}

              {/* Step 3: Results (Output) */}
              {currentStep === 3 && scanResults.length > 0 && (
                <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden flex flex-col h-[calc(100vh-250px)]">
                    <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <div className="flex items-center gap-4">
                            <div className="bg-green-100 p-2 rounded-full text-green-600">
                                <CheckCircle className="w-6 h-6" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-slate-800">解析完了</h2>
                                <p className="text-xs text-slate-500 mt-0.5">全 {scanResults.length} ページを処理しました</p>
                            </div>
                        </div>
                        
                        <div className="flex gap-3">
                            <button 
                                onClick={resetAll}
                                className="text-slate-500 hover:text-slate-700 px-4 py-2 text-sm font-medium flex items-center gap-2 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                <RotateCcw className="w-4 h-4" /> 最初に戻る
                            </button>
                            <button 
                                onClick={handleExecuteSplit}
                                disabled={isProcessing}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg shadow-sm shadow-indigo-200 transition-all flex items-center gap-2 text-sm"
                            >
                                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Split className="w-4 h-4" />}
                                分割実行・ダウンロード
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-auto bg-slate-50/30">
                        <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10 bg-white shadow-sm">
                            <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            <th className="px-2 py-3 w-10 text-center bg-slate-50"></th>
                            <th className="px-2 py-3 w-12 text-center bg-slate-50">No.</th>
                            <th 
                                className="px-2 py-3 w-16 text-center bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                onClick={() => handleSort('page_number')}
                            >
                                <div className="flex items-center justify-center gap-1">
                                    PAGE
                                    <RenderSortIcon columnKey="page_number" />
                                </div>
                            </th>
                            <th 
                                className="px-4 py-3 w-32 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                onClick={() => handleSort('layout_name')}
                            >
                                <div className="flex items-center gap-1">
                                    レイアウト種別
                                    <RenderSortIcon columnKey="layout_name" />
                                </div>
                            </th>
                            <th 
                                className="px-6 py-3 w-auto bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                onClick={() => handleSort('confirmed_name')}
                            >
                                <div className="flex items-center gap-1">
                                    出力対象 / 出力ファイル名
                                    <RenderSortIcon columnKey="confirmed_name" />
                                </div>
                            </th>
                            <th className="px-4 py-3 w-24 text-center bg-slate-50">結合</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm bg-white">
                            {scanResults.map((result, index) => (
                                <React.Fragment key={index}>
                                <tr className={cn("transition-colors group", result.should_merge ? "bg-slate-50/50" : "bg-white hover:bg-slate-50/80")}>
                                    <td className="px-2 py-4 text-center">
                                        <button 
                                            onClick={() => toggleRowExpansion(index)}
                                            className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-indigo-600 transition-colors"
                                        >
                                            <Plus className={cn("w-4 h-4 transition-transform", expandedRows.has(index) ? "rotate-45 text-indigo-600" : "")} />
                                        </button>
                                    </td>
                                    <td className="px-2 py-4 text-center text-slate-400">{index + 1}</td>
                                    <td className="px-2 py-4 text-center">
                                        <div className="font-medium text-slate-700 bg-slate-50 mx-1 rounded border border-slate-100 py-1">
                                            P.{result.page_number}
                                        </div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className={cn(
                                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                                            result.layout_name === "Unknown" 
                                                ? "bg-slate-100 text-slate-600" 
                                                : "bg-blue-100 text-blue-800"
                                        )}>
                                        {result.layout_name}
                                        </span>
                                    </td>
                                    <td className={cn("px-6 py-4", result.should_merge && "opacity-50")}>
                                        <div className="flex items-center gap-3 w-full">
                                            {!result.should_merge && (
                                                <input 
                                                    type="checkbox" 
                                                    className="accent-indigo-600 w-5 h-5 shrink-0 cursor-pointer"
                                                    checked={result.is_output_target}
                                                    onChange={(e) => handleResultChange(index, 'is_output_target', e.target.checked)}
                                                    title="出力対象にする"
                                                />
                                            )}
                                            {result.should_merge ? (
                                                <span className="text-slate-400 text-xs italic w-full">（上のページと結合）</span>
                                            ) : (
                                                <input 
                                                    type="text" 
                                                    value={result.confirmed_name}
                                                    onChange={(e) => handleResultChange(index, 'confirmed_name', e.target.value)}
                                                    placeholder={result.is_output_target && !result.confirmed_name ? "※必須項目です" : ""}
                                                    className={cn(
                                                        "w-full rounded px-3 py-1.5 focus:outline-none focus:ring-2 transition-all font-medium",
                                                        result.is_output_target && !result.confirmed_name 
                                                            ? "bg-red-50 border border-red-300 text-slate-900 focus:ring-red-200 focus:border-red-500 placeholder:text-red-400" 
                                                            : "bg-slate-50 border border-slate-200 text-slate-700 focus:ring-indigo-500/20 focus:border-indigo-500"
                                                    )}
                                                />
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                        {index > 0 && (
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input 
                                                    type="checkbox" 
                                                    className="sr-only peer" 
                                                    checked={result.should_merge} 
                                                    onChange={(e) => handleResultChange(index, 'should_merge', e.target.checked)}
                                                />
                                                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                                            </label>
                                        )}
                                    </td>
                                </tr>
                                {expandedRows.has(index) && (
                                    <tr className="bg-slate-50/50 animate-in fade-in slide-in-from-top-1">
                                        <td colSpan="6" className="px-6 py-3 border-b border-indigo-100">
                                            <div className="flex gap-6 text-xs text-slate-600 pl-10">
                                                <div className="flex flex-col gap-1 w-1/2">
                                                    <span className="font-bold text-indigo-600 uppercase tracking-wider text-[10px]">
                                                        Detected Keyword (for {result.layout_name})
                                                    </span>
                                                    <div className="bg-white p-2 rounded border border-slate-200 font-mono text-slate-800 break-all min-h-[2.5em]">
                                                        {result.found_keyword_text ? result.found_keyword_text : <span className="text-slate-400 italic">(None)</span>}
                                                    </div>
                                                    
                                                    {/* Detection Log */}
                                                    {result.detection_log && result.detection_log.length > 0 && (
                                                        <div className="mt-2">
                                                            <div 
                                                                className="text-[10px] font-bold text-slate-500 mb-1 cursor-pointer flex items-center gap-1 hover:text-slate-700"
                                                                onClick={(e) => {
                                                                    const pre = e.currentTarget.nextElementSibling;
                                                                    if(pre) pre.classList.toggle('hidden');
                                                                }}
                                                            >
                                                                <span>Details / Logs</span>
                                                                <span className="text-[8px] bg-slate-200 px-1 rounded">▼</span>
                                                            </div>
                                                            <pre className="hidden text-[9px] bg-slate-100 p-2 rounded border border-slate-200 overflow-x-auto whitespace-pre-wrap font-mono text-slate-600 max-h-32 overflow-y-auto">
                                                                {result.detection_log.join('\n')}
                                                            </pre>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex flex-col gap-1 w-1/2">
                                                    <span className="font-bold text-emerald-600 uppercase tracking-wider text-[10px]">Extracted File Name Text</span>
                                                    <div className="bg-white p-2 rounded border border-slate-200 font-mono text-slate-800 break-all min-h-[2.5em]">
                                                        {result.extracted_text ? result.extracted_text : <span className="text-slate-400 italic">(None)</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                </React.Fragment>
                            ))}
                        </tbody>
                        </table>
                    </div>
                </div>
              )}
            </div>
          </Tabs.Content>
          
          {/* Settings Tab Content */}
          <Tabs.Content value="settings" className="outline-none animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex gap-4 h-[calc(100vh-200px)]">
                
                {/* 1. Layout List (15%) */}
                <div className="w-[15%] bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                    <div className="p-3 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="font-bold text-slate-700 text-xs text-center uppercase tracking-wide">登録済みリスト</h3>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                         <div 
                             onClick={handleNewLayout}
                             className={cn(
                                "w-full p-2 rounded-lg border cursor-pointer transition-all hover:bg-slate-50 text-center",
                                selectedLayoutId === null 
                                    ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-bold shadow-sm"
                                    : "bg-white border-slate-100 text-slate-600"
                             )}
                         >
                            <div className="flex flex-col items-center gap-1 py-1">
                                <Plus className="w-4 h-4" />
                                <span className="text-xs">新規作成</span>
                            </div>
                        </div>
                        
                        {layouts.map((layout) => (
                             <div 
                                key={layout.id}
                                onClick={() => handleSelectLayout(layout)}
                                className={cn(
                                    "w-full p-2 rounded-lg border cursor-pointer transition-all",
                                    selectedLayoutId === layout.id 
                                       ? "bg-indigo-50 border-indigo-200 shadow-sm"
                                       : "bg-white border-slate-100 hover:bg-slate-50 hover:border-slate-200"
                                )}
                            >
                                <div className={cn("font-medium text-xs truncate mb-1", selectedLayoutId === layout.id ? "text-indigo-900" : "text-slate-700")}>{layout.name}</div>
                                <div className="text-[10px] text-slate-400 truncate pl-1 border-l-2 border-slate-200">{layout.keyword}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 2. Layout Detail Form (30%) */}
                <div className="w-[30%] bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                    {/* Header */}
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                        <h3 className="font-bold text-slate-800 text-sm">レイアウト詳細</h3>
                        {selectedLayoutId && (
                            <button onClick={handleDeleteLayout} className="text-slate-400 hover:text-red-500 p-1.5 rounded hover:bg-red-50 transition-colors" title="削除">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {!selectedLayoutId ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-2">
                            <Split className="w-8 h-8 opacity-20" />
                            <p className="text-xs font-bold">レイアウトを選択してください</p>
                        </div>
                    ) : (
                        <>
                            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                                {/* Name Input */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">レイアウト名</label>
                                    <input
                                        type="text"
                                        value={editingLayout.name}
                                        onChange={(e) => handleLayoutChange('name', e.target.value)}
                                        className="w-full text-sm font-bold text-slate-800 border-b-2 border-slate-200 focus:border-indigo-600 outline-none py-1 transition-colors px-1 bg-transparent"
                                        placeholder="レイアウト名を入力"
                                    />
                                </div>

                                {/* Step 1: Identification */}
                                <div className="bg-slate-50/50 rounded-lg border border-slate-200 overflow-hidden">
                                    <div className="px-3 py-2 bg-indigo-50/50 border-b border-indigo-100 flex items-center gap-2">
                                        <span className="bg-indigo-600 text-white w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold">1</span>
                                        <span className="text-xs font-bold text-indigo-900">識別条件 (Keyword)</span>
                                    </div>
                                    
                                    <div className="p-3 space-y-3">
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 mb-1">判別キーワード</label>
                                            <input 
                                                type="text" 
                                                value={editingLayout.keyword}
                                                onChange={(e) => handleLayoutChange('keyword', e.target.value)}
                                                className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200" 
                                                placeholder="例: 請求書"
                                            />
                                        </div>
                                        
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 mb-1">検索エリア (mm)</label>
                                            <div className="grid grid-cols-2 gap-2">
                                                {['x0', 'y0', 'x1', 'y1'].map((coord) => (
                                                    <div key={`key_${coord}`} className="flex items-center gap-1 bg-white border border-slate-200 rounded px-2 py-1">
                                                        <span className="text-[10px] text-slate-400 uppercase w-4">{coord}</span>
                                                        <input 
                                                            type="number" 
                                                            className="flex-1 min-w-0 text-xs text-right outline-none font-mono" 
                                                            value={editingLayout[`keyword_${coord}`]} 
                                                            onChange={(e) => handleLayoutChange(`keyword_${coord}`, parseFloat(e.target.value))} 
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="mt-2 pt-2 border-t border-indigo-100 flex flex-col gap-2">
                                            <button 
                                                onClick={handleKeywordTest}
                                                disabled={isTestKeyword}
                                                className={cn(
                                                    "w-full py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-sm",
                                                    !previewFile 
                                                        ? "bg-slate-200 text-slate-400 cursor-not-allowed" 
                                                        : "bg-indigo-600 hover:bg-indigo-700 text-white"
                                                )}
                                                title={!previewFile ? "プレビュー用PDFをアップロードしてください" : "指定エリアのテキスト抽出テストを実行"}
                                            >
                                                {isTestKeyword ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                                                抽出テスト実行
                                            </button>
                                            {testKeywordResult !== null && (
                                                <div className="bg-indigo-50 border border-indigo-200 rounded p-2 text-xs">
                                                    <span className="text-[10px] font-bold text-indigo-800 block mb-0.5">抽出結果:</span>
                                                    <div className="bg-white border border-indigo-100 rounded p-1.5 text-slate-700 min-h-[1.5em] break-all font-mono">
                                                        {testKeywordResult || <span className="text-slate-400 italic">(空)</span>}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Step 2: Extraction */}
                                <div className="bg-slate-50/50 rounded-lg border border-slate-200 overflow-hidden">
                                    <div className="px-3 py-2 bg-emerald-50/50 border-b border-emerald-100 flex items-center gap-2">
                                        <span className="bg-emerald-600 text-white w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold">2</span>
                                        <span className="text-xs font-bold text-emerald-900">ファイル名抽出 (Extract)</span>
                                    </div>
                                    
                                    <div className="p-3 space-y-3">
                                        <p className="text-[10px] text-slate-500 leading-tight">
                                            指定エリアの文字を読み取り、ファイル名に使用します。
                                        </p>
                                        
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 mb-1">抽出エリア (mm)</label>
                                            <div className="grid grid-cols-2 gap-2">
                                                {['x0', 'y0', 'x1', 'y1'].map((coord) => (
                                                    <div key={`extract_${coord}`} className="flex items-center gap-1 bg-white border border-slate-200 rounded px-2 py-1">
                                                        <span className="text-[10px] text-slate-400 uppercase w-4">{coord}</span>
                                                        <input 
                                                            type="number" 
                                                            className="flex-1 min-w-0 text-xs text-right outline-none font-mono" 
                                                            value={editingLayout[`extract_${coord}`]} 
                                                            onChange={(e) => handleLayoutChange(`extract_${coord}`, parseFloat(e.target.value))} 
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                            
                                            <div className="mt-3 pt-2 border-t border-emerald-100 flex flex-col gap-2">
                                                <button 
                                                    onClick={handleExtractTest}
                                                    disabled={isTestExtracting}
                                                    className={cn(
                                                        "w-full py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-sm",
                                                        !previewFile 
                                                            ? "bg-slate-200 text-slate-400 cursor-not-allowed" 
                                                            : "bg-emerald-600 hover:bg-emerald-700 text-white"
                                                    )}
                                                    title={!previewFile ? "プレビュー用PDFをアップロードしてください" : "指定エリアのテキスト抽出テストを実行"}
                                                >
                                                    {isTestExtracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                                                    抽出テスト実行
                                                </button>

                                                {testExtractResult !== null && (
                                                    <div className="bg-emerald-50 border border-emerald-200 rounded p-2 text-xs">
                                                        <span className="text-[10px] font-bold text-emerald-800 block mb-0.5">抽出結果:</span>
                                                        <div className="bg-white border border-emerald-100 rounded p-1.5 text-slate-700 min-h-[1.5em] break-all font-mono">
                                                            {testExtractResult || <span className="text-slate-400 italic">(空)</span>}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="p-4 border-t border-slate-100 bg-white shadow-[0_-4px_6px_-2px_rgba(0,0,0,0.02)]">
                                <button onClick={handleSaveLayout} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg shadow-sm shadow-indigo-200 text-sm font-bold transition-all flex items-center justify-center gap-2">
                                    <Save className="w-4 h-4" /> 設定を保存
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* 3. Preview (55%) */}
                <div className="w-[55%] bg-slate-100 rounded-xl shadow-inner border border-slate-200 overflow-hidden flex flex-col relative group">
                    <div className="absolute top-3 left-3 z-20 bg-white/90 backdrop-blur px-3 py-1.5 rounded shadow-sm border border-slate-200 flex items-center gap-2">
                        <Eye className="w-3 h-3 text-indigo-500" />
                        <span className="text-xs font-bold text-slate-600">プレビュー</span>
                    </div>

                    <div className="absolute top-3 right-3 z-20">
                         <button 
                            onClick={() => previewInputRef.current?.click()}
                            className="text-xs bg-white/90 backdrop-blur border border-slate-300 hover:bg-white hover:text-indigo-600 px-3 py-1.5 rounded shadow-sm text-slate-600 flex items-center gap-1 transition-all"
                        >
                            <Upload className="w-3 h-3" /> PDF変更
                        </button>
                        <input 
                            type="file" 
                            accept=".pdf" 
                            className="hidden" 
                            ref={previewInputRef}
                            onChange={(e) => e.target.files[0] && setPreviewFile(e.target.files[0])}
                        />
                    </div>
                    
                    <div className="flex-1 overflow-auto p-4 flex justify-center items-start">
                         {!previewFile ? (
                             <div 
                                onClick={() => previewInputRef.current?.click()}
                                className="w-full h-full flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:text-indigo-500 transition-colors border-2 border-dashed border-slate-300 rounded-lg m-4"
                            >
                                <Upload className="w-10 h-10 mb-3 opacity-50" />
                                <span className="text-xs font-bold">プレビュー用PDFをアップロード</span>
                            </div>
                        ) : (
                            <div className="relative shadow-lg bg-white mt-8">
                                <Document
                                    file={previewFile}
                                    onLoadError={(e) => console.error(e)}
                                >
                                    <Page 
                                        pageNumber={1} 
                                        width={600} 
                                        renderTextLayer={false}
                                        renderAnnotationLayer={false}
                                        onLoadSuccess={(page) => {
                                            const scale = 600 / page.originalWidth;
                                            document.documentElement.style.setProperty('--preview-scale', scale);
                                        }}
                                    />
                                    
                                    {/* Overlay for Keyword Area (Blue) */}
                                    {(editingLayout.keyword_x1 > 0 && editingLayout.keyword_y1 > 0) && (
                                        <div 
                                            className="absolute border-2 border-indigo-500 bg-indigo-500/20 text-indigo-700 font-bold text-[10px] flex items-start justify-start pl-1 pt-0.5 pointer-events-none"
                                            style={{
                                                left: `calc(${editingLayout.keyword_x0} * 2.83465 * var(--preview-scale) * 1px)`,
                                                top: `calc(${editingLayout.keyword_y0} * 2.83465 * var(--preview-scale) * 1px)`,
                                                width: `calc(${editingLayout.keyword_x1 - editingLayout.keyword_x0} * 2.83465 * var(--preview-scale) * 1px)`,
                                                height: `calc(${editingLayout.keyword_y1 - editingLayout.keyword_y0} * 2.83465 * var(--preview-scale) * 1px)`,
                                                zIndex: 10
                                            }}
                                        >
                                            <span className="bg-indigo-500 text-white px-1">Keyword</span>
                                        </div>
                                    )}

                                    {/* Overlay for Extract Area (Green) */}
                                    {(editingLayout.extract_x1 > 0 && editingLayout.extract_y1 > 0) && (
                                        <div 
                                            className="absolute border-2 border-emerald-500 bg-emerald-500/20 text-emerald-700 font-bold text-[10px] flex items-start justify-start pl-1 pt-0.5 pointer-events-none"
                                            style={{
                                                left: `calc(${editingLayout.extract_x0} * 2.83465 * var(--preview-scale) * 1px)`,
                                                top: `calc(${editingLayout.extract_y0} * 2.83465 * var(--preview-scale) * 1px)`,
                                                width: `calc(${editingLayout.extract_x1 - editingLayout.extract_x0} * 2.83465 * var(--preview-scale) * 1px)`,
                                                height: `calc(${editingLayout.extract_y1 - editingLayout.extract_y0} * 2.83465 * var(--preview-scale) * 1px)`,
                                                zIndex: 10
                                            }}
                                        >
                                            <span className="bg-emerald-500 text-white px-1">File Name</span>
                                        </div>
                                    )}
                                </Document>
                            </div>
                        )}
                    </div>
                </div>

            </div>
          </Tabs.Content>
        </Tabs.Root>

      </main>
    </div>
  );
}

export default App;
