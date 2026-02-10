
import React from 'react';
import { DataRow } from '../types';

interface DataTableProps {
  data: DataRow[];
  selectedCols: string[];
  factoryCol?: string;
}

/**
 * 类 Excel 的表格展示组件
 */
export const DataTable: React.FC<DataTableProps> = ({ data, selectedCols, factoryCol }) => {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400">
        <div className="text-6xl mb-4">📊</div>
        <p>暂无数据，请先导入文件</p>
      </div>
    );
  }

  const columns = Object.keys(data[0]);

  return (
    <div className="w-full h-full overflow-auto border border-slate-200 rounded-lg bg-white shadow-inner hide-scrollbar">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-slate-700 border-r border-slate-200">#</th>
            {columns.map(col => (
              <th 
                key={col} 
                className={`px-4 py-3 text-left font-semibold border-r border-slate-200 transition-colors
                  ${selectedCols.includes(col) ? 'bg-blue-100 text-blue-700' : 'text-slate-700'}
                  ${col === factoryCol ? 'bg-amber-50' : ''}
                `}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-slate-100">
          {data.map((row, idx) => (
            <tr key={idx} className="hover:bg-slate-50 transition-colors">
              <td className="px-4 py-2 text-slate-400 bg-slate-50/50 border-r border-slate-100">{idx + 1}</td>
              {columns.map(col => (
                <td 
                  key={col} 
                  className={`px-4 py-2 border-r border-slate-100 whitespace-nowrap
                    ${selectedCols.includes(col) ? 'bg-blue-50/30 text-blue-900 font-medium' : 'text-slate-600'}
                  `}
                >
                  {row[col] ?? '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
