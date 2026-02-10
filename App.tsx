
import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  FileSpreadsheet, Settings, Database, BarChart4, LayoutGrid, 
  AlertCircle, Download, CheckCircle2, XCircle, BrainCircuit, FileText, Image as ImageIcon,
  Zap, Eraser, Layers, ChevronDown
} from 'lucide-react';
import { DataTable } from './components/DataTable';
import { DataRow, PearsonResult, ClusterResult } from './types';
import { fixFactoryNames, calculatePearson, performClustering, getSuggestedK } from './services/dataProcessor';
import { 
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Cell, Legend, LineChart, Line, BarChart, Bar
} from 'recharts';

const saveFileWithPicker = async (content: Blob | string, suggestedName: string, type: 'xlsx' | 'png' | 'txt') => {
  const triggerClassicDownload = () => {
    const url = typeof content === 'string' 
      ? URL.createObjectURL(new Blob([content], { type: 'text/plain' })) 
      : URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url;
    link.download = suggestedName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  try {
    if ('showSaveFilePicker' in window) {
      const opts = {
        suggestedName: suggestedName,
        types: type === 'xlsx' ? [
          { description: 'Excel Files', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }
        ] : type === 'png' ? [
          { description: 'PNG Image', accept: { 'image/png': ['.png'] } }
        ] : [
          { description: 'Text File', accept: { 'text/plain': ['.txt'] } }
        ]
      };
      const handle = await (window as any).showSaveFilePicker(opts);
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
    } else {
      triggerClassicDownload();
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      triggerClassicDownload();
    }
  }
};

const App: React.FC = () => {
  const [data, setData] = useState<DataRow[]>([]);
  const [selectedCols, setSelectedCols] = useState<string[]>([]);
  const [factoryCol, setFactoryCol] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [sheets, setSheets] = useState<string[]>([]);
  const [showSheetSelector, setShowSheetSelector] = useState(false);
  const [rawWorkbook, setRawWorkbook] = useState<XLSX.WorkBook | null>(null);

  const [pearsonResult, setPearsonResult] = useState<PearsonResult | null>(null);
  const [clusterResult, setClusterResult] = useState<ClusterResult | null>(null);
  const [showModal, setShowModal] = useState<'pearson' | 'cluster' | 'none'>('none');
  const [showModeDropdown, setShowModeDropdown] = useState(false);

  const pearsonRef = useRef<HTMLDivElement>(null);
  const clusterQualityRef = useRef<HTMLDivElement>(null);
  const clusterPcaRef = useRef<HTMLDivElement>(null);
  const clusterVarRef = useRef<HTMLDivElement>(null);

  const stats = useMemo(() => {
    if (data.length === 0 || selectedCols.length === 0) return null;
    return { totalSamples: data.length, missingCount: selectedCols.reduce((acc, col) => acc + data.filter(r => !r[col] && r[col] !== 0).length, 0) };
  }, [data, selectedCols]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      setRawWorkbook(wb);
      setSheets(wb.SheetNames);
      if (wb.SheetNames.length > 1) setShowSheetSelector(true);
      else loadSheet(wb, wb.SheetNames[0]);
    };
    reader.readAsBinaryString(file);
  };

  const loadSheet = (wb: XLSX.WorkBook, sheetName: string) => {
    const ws = wb.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<DataRow>(ws);
    const fCol = Object.keys(jsonData[0] || {}).find(k => k.includes('厂名'));
    if (fCol) {
      setFactoryCol(fCol);
      if (jsonData.some(row => !row[fCol]) && window.confirm('检测到缺失厂名，是否补全？')) setData(fixFactoryNames(jsonData, fCol));
      else setData(jsonData);
    } else setData(jsonData);
    setActiveSheet(sheetName);
    setShowSheetSelector(false);
    setSelectedCols([]);
  };

  const savePearsonResults = async () => {
    if (!pearsonResult) return;
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(
      pearsonResult.columns.map(row => ({
        指标: row,
        ...Object.fromEntries(pearsonResult.columns.map(col => [col, pearsonResult.matrix[row][col]]))
      }))
    );
    XLSX.utils.book_append_sheet(wb, ws, "Pearson Matrix");
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    await saveFileWithPicker(new Blob([wbout]), `${pearsonResult.datasetName}_pearson_matrix.xlsx`, 'xlsx');
  };

  const saveElementAsImage = async (ref: React.RefObject<HTMLDivElement | null>, name: string) => {
    if (!ref.current) return;
    try {
      const canvas = await (window as any).html2canvas(ref.current, { scale: 2 });
      canvas.toBlob(async (blob: Blob | null) => {
        if (blob) {
          await saveFileWithPicker(blob, name, 'png');
        }
      });
    } catch (err) {
      console.error(err);
      alert('生成图片失败');
    }
  };

  const saveClusterFiles = async () => {
    if (!clusterResult) return;
    
    // 1. Save cluster_stats.xlsx
    const wbStats = XLSX.utils.book_new();
    const statsData = Object.keys(clusterResult.stats).map(k => ({
      Cluster: `簇 ${k}`,
      ...clusterResult.stats[parseInt(k)]
    }));
    XLSX.utils.book_append_sheet(wbStats, XLSX.utils.json_to_sheet(statsData), "Cluster Centers");
    const outStats = XLSX.write(wbStats, { bookType: 'xlsx', type: 'array' });
    await saveFileWithPicker(new Blob([outStats]), `cluster_stats.xlsx`, 'xlsx');

    // 2. Save clustered_data.xlsx
    const wbData = XLSX.utils.book_new();
    const taggedData = data.map((d, i) => {
      const pcaItem = clusterResult.pcaData[i];
      return { 
        ...d, 
        Cluster_Label: pcaItem.cluster === -1 ? 'Excluded (Outlier)' : pcaItem.cluster,
        Is_Outlier: pcaItem.isOutlier ? 'Yes' : 'No',
        PCA_X: pcaItem.x,
        PCA_Y: pcaItem.y
      };
    });
    XLSX.utils.book_append_sheet(wbData, XLSX.utils.json_to_sheet(taggedData), "Clustered Data");
    const outData = XLSX.write(wbData, { bookType: 'xlsx', type: 'array' });
    await saveFileWithPicker(new Blob([outData]), `clustered_data.xlsx`, 'xlsx');
  };

  const switchClusterMode = (mode: boolean) => {
    if (!clusterResult) return;
    const k = clusterResult.k;
    setClusterResult(performClustering(data, selectedCols, k, mode));
    setShowModeDropdown(false);
  };

  const formattedVarData = useMemo(() => {
    if (!clusterResult) return [];
    return clusterResult.selectedCols.map(col => {
      const item: any = { name: col };
      Object.keys(clusterResult.scaledStats).forEach(k => {
        item[`簇${k}_mean`] = clusterResult.scaledStats[parseInt(k)][col].mean;
        item[`簇${k}_var`] = clusterResult.scaledStats[parseInt(k)][col].variance;
      });
      return item;
    });
  }, [clusterResult]);

  const CustomScatterDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (payload.isOutlier) {
      return (
        <g transform={`translate(${cx},${cy})`}>
          <line x1="-6" y1="-6" x2="6" y2="6" stroke="#ef4444" strokeWidth="2.5" />
          <line x1="-6" y1="6" x2="6" y2="-6" stroke="#ef4444" strokeWidth="2.5" />
        </g>
      );
    }
    const colors = ['#6366f1','#10b981','#f59e0b','#ec4899','#8b5cf6', '#06b6d4', '#f97316'];
    const fill = payload.cluster === -1 ? '#94a3b8' : colors[payload.cluster % colors.length];
    return <circle cx={cx} cy={cy} r={6} fill={fill} stroke="white" strokeWidth="1.5" />;
  };

  return (
    <div className="flex h-screen bg-slate-100 text-slate-900 overflow-hidden font-sans">
      <aside className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-xl z-20">
        <div className="p-6 border-b border-slate-100 bg-gradient-to-br from-slate-800 to-slate-900">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <BrainCircuit size={28} className="text-blue-400" />
            石油数据专家
          </h1>
          <p className="text-slate-400 text-[10px] mt-1 tracking-widest uppercase">Petroleum Intelligence System</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 hide-scrollbar">
          <section>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Database size={14} /> 数据导入
            </h2>
            <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-all">
              <FileSpreadsheet className="w-8 h-8 mb-2 text-slate-400" />
              <p className="text-xs text-slate-500 font-medium">点击导入 Excel 数据</p>
              <input type="file" className="hidden" accept=".xlsx,.csv" onChange={handleFileUpload} />
            </label>
            {fileName && <div className="mt-2 text-[10px] bg-slate-100 p-2 rounded truncate">当前: {fileName}</div>}
          </section>

          {data.length > 0 && (
            <section className="animate-in fade-in slide-in-from-left-4 duration-300">
              <h2 className="text-xs font-bold text-slate-400 uppercase mb-3">特征选择 ({selectedCols.length})</h2>
              <div className="bg-slate-50 rounded-xl p-2 max-h-48 overflow-y-auto border border-slate-200 space-y-1">
                {Object.keys(data[0]).map(col => (
                  <button key={col} onClick={() => setSelectedCols(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col])}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all flex items-center justify-between
                      ${selectedCols.includes(col) ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}
                    `}>
                    <span className="truncate">{col}</span>
                    {selectedCols.includes(col) && <CheckCircle2 size={12} />}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="grid grid-cols-2 gap-2">
            <button disabled={selectedCols.length < 2} onClick={() => { setPearsonResult(calculatePearson(data, selectedCols, fileName)); setShowModal('pearson'); }}
              className="flex flex-col items-center gap-2 p-4 bg-indigo-50 text-indigo-700 rounded-xl hover:bg-indigo-100 transition-all disabled:opacity-50">
              <BarChart4 size={20} /><span className="text-[10px] font-bold">相关性分析</span>
            </button>
            <button disabled={selectedCols.length < 2} onClick={() => { 
                const kInput = prompt(`请输入聚类数量 K (建议 2-6):`, "3");
                const k = parseInt(kInput || "3");
                setClusterResult(performClustering(data, selectedCols, k, false)); 
                setShowModal('cluster'); 
              }}
              className="flex flex-col items-center gap-2 p-4 bg-emerald-50 text-emerald-700 rounded-xl hover:bg-emerald-100 transition-all disabled:opacity-50">
              <LayoutGrid size={20} /><span className="text-[10px] font-bold">聚类分析</span>
            </button>
          </section>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b flex items-center px-6 justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 text-blue-600 p-2 rounded-lg"><Database size={18} /></div>
            <h3 className="font-bold text-slate-800">数据管理看板</h3>
          </div>
          {stats && (
            <div className="flex gap-4 text-xs">
              <div className="text-right"><p className="text-slate-400">样本量</p><p className="font-bold">{stats.totalSamples}</p></div>
              <div className="text-right"><p className="text-slate-400">缺失值</p><p className={`font-bold ${stats.missingCount > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{stats.missingCount}</p></div>
            </div>
          )}
        </header>
        <div className="flex-1 p-6 overflow-hidden"><DataTable data={data} selectedCols={selectedCols} factoryCol={factoryCol} /></div>

        {showModal !== 'none' && (
          <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[60] flex items-center justify-center p-6">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-6xl flex flex-col h-[90vh] overflow-hidden">
              <div className="p-8 border-b bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <h2 className="text-2xl font-black text-slate-800">{showModal === 'pearson' ? `Pearson 相关性报告` : 'K-Means 聚类深度评估报告'}</h2>
                    <p className="text-slate-400 text-sm mt-1">{fileName} | 样本量: {data.length}</p>
                  </div>
                  {showModal === 'cluster' && clusterResult && (
                    <div className="relative">
                      <button 
                        onClick={() => setShowModeDropdown(!showModeDropdown)}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold border flex items-center gap-2 transition-all hover:shadow-md active:scale-95 ${clusterResult.excludeOutliers ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}
                      >
                        {clusterResult.excludeOutliers ? <Eraser size={14} /> : <Layers size={14} />}
                        分析模式: {clusterResult.excludeOutliers ? '去除离群点' : '保留离群点 (原始数据)'}
                        <ChevronDown size={14} className={`transition-transform ${showModeDropdown ? 'rotate-180' : ''}`} />
                      </button>
                      
                      {showModeDropdown && (
                        <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-[70] animate-in slide-in-from-top-2">
                          <button onClick={() => switchClusterMode(false)} className={`w-full px-4 py-3 text-left text-xs font-bold hover:bg-slate-50 flex items-center gap-3 transition-colors ${!clusterResult.excludeOutliers ? 'bg-blue-50 text-blue-600' : 'text-slate-600'}`}>
                            <Layers size={14} /> 模式一: 保留离群点 (原始数据)
                            {!clusterResult.excludeOutliers && <CheckCircle2 size={14} className="ml-auto" />}
                          </button>
                          <button onClick={() => switchClusterMode(true)} className={`w-full px-4 py-3 text-left text-xs font-bold hover:bg-slate-50 flex items-center gap-3 transition-colors ${clusterResult.excludeOutliers ? 'bg-amber-50 text-amber-600' : 'text-slate-600'}`}>
                            <Eraser size={14} /> 模式二: 去除离群点 (孤立森林检测)
                            {clusterResult.excludeOutliers && <CheckCircle2 size={14} className="ml-auto" />}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={showModal === 'pearson' ? savePearsonResults : saveClusterFiles} className="flex items-center gap-2 bg-slate-800 text-white px-6 py-2.5 rounded-full font-bold hover:bg-black transition-all shadow-md">
                    <Download size={18} /> 保存结果数据 (XLSX)
                  </button>
                  <button onClick={() => setShowModal('none')} className="p-2.5 bg-slate-200 text-slate-600 rounded-full hover:bg-rose-100 hover:text-rose-600 transition-all"><XCircle size={24} /></button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-12 hide-scrollbar bg-slate-50/30">
                {showModal === 'pearson' && pearsonResult && (
                  <div ref={pearsonRef} className="bg-white rounded-3xl p-10 border shadow-sm">
                    <div className="flex justify-between mb-8">
                       <h3 className="font-bold text-slate-700">相关性热力图</h3>
                       <button onClick={() => saveElementAsImage(pearsonRef, 'pearson_heatmap.png')} className="text-xs bg-slate-100 px-3 py-1 rounded-full flex items-center gap-1"><ImageIcon size={14} /> 保存图片</button>
                    </div>
                    <div className="flex flex-col items-center overflow-x-auto pb-6">
                      <div className="relative border-l-2 border-b-2 border-slate-300 p-2 ml-24">
                        <div className="grid" style={{ gridTemplateColumns: `repeat(${pearsonResult.columns.length}, 60px)` }}>
                          {pearsonResult.columns.map(row => pearsonResult.columns.map(col => {
                            const val = pearsonResult.matrix[row][col];
                            return <div key={`${row}-${col}`} className="w-[60px] h-[60px] flex items-center justify-center text-[10px] font-bold text-white border border-white/20"
                                      style={{ backgroundColor: val > 0 ? `rgba(79, 70, 229, ${Math.abs(val)})` : `rgba(244, 63, 94, ${Math.abs(val)})` }}>{val.toFixed(2)}</div>
                          }))}
                        </div>
                        <div className="absolute top-2 -left-32 flex flex-col h-full justify-around text-[10px] font-bold text-slate-500 w-28 text-right pr-2">
                          {pearsonResult.columns.map(c => <div key={c} className="truncate">{c}</div>)}
                        </div>
                      </div>
                      <div className="mt-2 flex w-full max-w-max justify-around text-[10px] font-bold text-slate-500 gap-[20px] px-2 ml-24">
                        {pearsonResult.columns.map(c => <div key={c} className="w-[40px] truncate rotate-45 origin-left">{c}</div>)}
                      </div>
                    </div>
                  </div>
                )}

                {showModal === 'cluster' && clusterResult && (
                  <div className="space-y-12 pb-20">
                    {/* Step 1: Quality */}
                    <div className="space-y-6">
                      <div ref={clusterQualityRef} className="bg-white p-8 rounded-3xl border shadow-sm space-y-8">
                        <div className="flex justify-between items-center">
                          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Zap className="text-amber-500" /> 1. 聚类趋势与质量评估</h3>
                          <button onClick={() => saveElementAsImage(clusterQualityRef, 'cluster_quality.png')} className="text-xs bg-slate-100 px-3 py-1 rounded-full flex items-center gap-1"><ImageIcon size={14} /> 保存图片</button>
                        </div>
                        <div className="bg-slate-50 p-6 rounded-3xl border h-80">
                           <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={clusterResult.metrics}>
                                 <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                 <XAxis dataKey="k" label={{ value: 'K 值', position: 'insideBottomRight', offset: -10 }} />
                                 <YAxis domain={[0, 1]} />
                                 <Tooltip />
                                 <Legend />
                                 <Line name="轮廓系数 (越大越好)" type="monotone" dataKey="silhouette" stroke="#10b981" strokeWidth={3} dot={{ r: 6 }} />
                              </LineChart>
                           </ResponsiveContainer>
                        </div>
                        <div className="bg-blue-50 p-4 rounded-xl text-sm text-blue-800 flex gap-3">
                          <AlertCircle className="shrink-0" />
                          <p><strong>离群点状态：</strong> 系统识别到 <strong>{clusterResult.outlierIndices.length}</strong> 个异常样本点。当前模式: <strong>{clusterResult.excludeOutliers ? '已剔除离群点（仅对聚类中心影响）' : '保留离群点（原始全量）'}</strong>。</p>
                        </div>
                      </div>

                      {/* Log displayed right after Step 1 */}
                      <div className="bg-slate-900 text-slate-300 p-8 rounded-3xl font-mono text-[11px] whitespace-pre-wrap max-h-64 overflow-y-auto shadow-2xl">
                        <div className="flex items-center gap-2 mb-4 text-white border-b border-slate-700 pb-2">
                          <FileText size={16} className="text-blue-400" /> 分析运行日志 (analysis_log.txt)
                        </div>
                        {clusterResult.log}
                      </div>
                    </div>

                    {/* Step 2: PCA Plot */}
                    <div ref={clusterPcaRef} className="bg-white p-8 rounded-3xl border shadow-sm space-y-8">
                      <div className="flex justify-between items-center">
                        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Layers className="text-blue-500" /> 2. 簇分布可视化 (PCA 降维)</h3>
                        <button onClick={() => saveElementAsImage(clusterPcaRef, 'cluster_pca_distribution.png')} className="text-xs bg-slate-100 px-3 py-1 rounded-full flex items-center gap-1"><ImageIcon size={14} /> 保存图片</button>
                      </div>
                      <div className="h-[500px] bg-slate-50 rounded-3xl border">
                        <ResponsiveContainer width="100%" height="100%">
                          <ScatterChart margin={{ top: 30, right: 30, bottom: 30, left: 30 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" dataKey="x" name="PCA1" label={{ value: '主成分 1 (PCA1)', position: 'insideBottom', offset: -10 }} />
                            <YAxis type="number" dataKey="y" name="PCA2" label={{ value: '主成分 2 (PCA2)', angle: -90, position: 'insideLeft', offset: 10 }} />
                            <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                               if (active && payload && payload.length) {
                                  const data = payload[0].payload;
                                  return (
                                    <div className="bg-white p-4 border rounded-2xl shadow-2xl text-xs min-w-[150px]">
                                      <p className="font-black border-b border-slate-100 mb-2 pb-2 text-slate-800">样本索引: {data.index}</p>
                                      <p className="flex items-center justify-between mb-1">
                                        <span className="text-slate-500">所属簇:</span>
                                        <span className="font-bold text-blue-600">{data.cluster === -1 ? '未分配' : `簇 ${data.cluster}`}</span>
                                      </p>
                                      <p className="flex items-center justify-between">
                                        <span className="text-slate-500">离群检测:</span>
                                        <span className={data.isOutlier ? 'text-red-500 font-black' : 'text-emerald-500 font-bold'}>{data.isOutlier ? '离群点' : '正常点'}</span>
                                      </p>
                                      <div className="mt-2 pt-2 border-t border-slate-50 grid grid-cols-2 gap-2 text-slate-400 font-mono">
                                        <div>X: {data.x.toFixed(2)}</div>
                                        <div>Y: {data.y.toFixed(2)}</div>
                                      </div>
                                    </div>
                                  );
                               }
                               return null;
                            }} />
                            <Legend verticalAlign="top" height={36} />
                            <Scatter name="样本空间分布 (颜色区分簇，×标识离群点)" data={clusterResult.pcaData} shape={<CustomScatterDot />} />
                          </ScatterChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex justify-center gap-8 text-[11px] font-medium text-slate-500 bg-slate-100/50 p-6 rounded-2xl border border-slate-100">
                         <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full bg-blue-500 shadow-sm" /> 正常簇成员 (Cluster Samples)</div>
                         <div className="flex items-center gap-3"><span className="text-red-500 text-xl font-black">×</span> 异常离群点 (Outliers)</div>
                         <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full bg-slate-400 shadow-sm opacity-50" /> 排除的点 (仅去除模式)</div>
                      </div>
                    </div>

                    {/* Step 3: Stats */}
                    <div ref={clusterVarRef} className="bg-white p-8 rounded-3xl border shadow-sm space-y-8">
                       <div className="flex justify-between items-center">
                          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><BarChart4 className="text-emerald-500" /> 3. 簇均值与方差 (标准化数据)</h3>
                          <button onClick={() => saveElementAsImage(clusterVarRef, 'cluster_variance_stats.png')} className="text-xs bg-slate-100 px-3 py-1 rounded-full flex items-center gap-1"><ImageIcon size={14} /> 保存图片</button>
                       </div>
                       <div className="h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={formattedVarData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis dataKey="name" tick={{fontSize: 10}} />
                              <YAxis tick={{fontSize: 10}} />
                              <Tooltip />
                              <Legend verticalAlign="top" height={36}/>
                              {Array.from({length: clusterResult.k}).map((_, i) => (
                                <Bar key={i} dataKey={`簇${i}_mean`} name={`簇 ${i} 标准化均值`} fill={['#6366f1','#10b981','#f59e0b','#ec4899','#8b5cf6', '#06b6d4', '#f97316'][i % 7]} />
                              ))}
                            </BarChart>
                          </ResponsiveContainer>
                       </div>
                       <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-inner">
                          <table className="min-w-full text-[11px] text-black bg-white">
                            <thead>
                               <tr className="bg-slate-100 border-b border-slate-200">
                                  <th className="px-6 py-4 text-left border-r border-slate-200 font-black text-slate-800">特征指标</th>
                                  {Array.from({length: clusterResult.k}).map((_, i) => (
                                     <React.Fragment key={i}>
                                        <th className="px-6 py-4 text-center border-r border-slate-200 bg-blue-50/20">簇 {i} 均值</th>
                                        <th className="px-6 py-4 text-center border-r border-slate-200 bg-amber-50/20">簇 {i} 方差</th>
                                     </React.Fragment>
                                  ))}
                               </tr>
                            </thead>
                            <tbody>
                               {formattedVarData.map(row => (
                                  <tr key={row.name} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                     <td className="px-6 py-3 border-r border-slate-200 font-bold text-slate-700">{row.name}</td>
                                     {Array.from({length: clusterResult.k}).map((_, i) => (
                                        <React.Fragment key={i}>
                                           <td className="px-6 py-3 text-center border-r border-slate-100">{(row[`簇${i}_mean`] as number).toFixed(4)}</td>
                                           <td className="px-6 py-3 text-center border-r border-slate-100 font-mono text-slate-500">{(row[`簇${i}_var`] as number).toFixed(4)}</td>
                                        </React.Fragment>
                                     ))}
                                  </tr>
                               ))}
                            </tbody>
                          </table>
                       </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
      
      {showSheetSelector && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl animate-in zoom-in duration-200">
            <div className="p-6 bg-slate-800 text-white font-bold flex items-center gap-2">
              <FileSpreadsheet size={20} /> 选择工作表
            </div>
            <div className="p-4 space-y-2">
              {sheets.map(s => (
                <button key={s} onClick={() => loadSheet(rawWorkbook!, s)} className="w-full p-4 text-left border rounded-xl hover:bg-slate-50 hover:border-blue-400 hover:text-blue-600 transition-all font-medium text-slate-700">
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
