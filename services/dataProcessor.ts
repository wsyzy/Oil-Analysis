
import * as ss from 'simple-statistics';
import { kmeans } from 'ml-kmeans';
import { PCA } from 'ml-pca';
import { DataRow, PearsonResult, ClusterResult, KMetric } from '../types';

/**
 * 厂名补全逻辑
 */
export const fixFactoryNames = (data: DataRow[], factoryCol: string): DataRow[] => {
  const newData = [...data];
  for (let i = 1; i < newData.length; i++) {
    const currentVal = String(newData[i][factoryCol] || '').trim();
    const prevVal = String(newData[i - 1][factoryCol] || '').trim();
    if (currentVal.startsWith('(') && currentVal.length <= 5) {
      const prefix = prevVal.split('(')[0].trim();
      newData[i][factoryCol] = `${prefix} ${currentVal}`;
    }
  }
  return newData;
};

/**
 * 计算相关性
 */
export const calculatePearson = (data: DataRow[], selectedCols: string[], fileName: string): PearsonResult => {
  const matrix: Record<string, Record<string, number>> = {};
  selectedCols.forEach(col1 => {
    matrix[col1] = {};
    const val1 = data.map(d => Number(d[col1]) || 0);
    selectedCols.forEach(col2 => {
      const val2 = data.map(d => Number(d[col2]) || 0);
      try {
        matrix[col1][col2] = ss.sampleCorrelation(val1, val2);
      } catch (e) {
        matrix[col1][col2] = col1 === col2 ? 1 : 0;
      }
    });
  });
  return { matrix, columns: selectedCols, datasetName: fileName.split('.')[0] };
};

/**
 * 欧氏距离
 */
const euclideanDistance = (a: number[], b: number[]) => 
  Math.sqrt(a.reduce((acc, val, i) => acc + Math.pow(val - b[i], 2), 0));

/**
 * 离群点检测 (基于 PCA 投影后的局部密度/距离，模拟孤立森林效果)
 */
export const detectOutliers = (matrix: number[][]): number[] => {
  if (matrix.length < 5) return [];
  // 使用 PCA 降维到 2D 来评估分布
  const pca = new PCA(matrix);
  const projected = pca.predict(matrix).to2DArray();
  
  // 计算每个点到所有其他点的平均距离（简化版离群得分）
  const scores = projected.map((p1, i) => {
    const dists = projected.map(p2 => euclideanDistance(p1, p2));
    dists.sort((a, b) => a - b);
    // 取前 5 个近邻的平均距离作为局部稀疏度
    return ss.mean(dists.slice(1, 6));
  });

  const meanScore = ss.mean(scores);
  const stdScore = ss.standardDeviation(scores);
  const threshold = meanScore + 2 * stdScore; // 2倍标准差作为离群阈值

  return scores.map((s, i) => s > threshold ? i : -1).filter(i => i !== -1);
};

/**
 * 计算轮廓系数
 */
const calculateSilhouette = (matrix: number[][], clusters: number[]) => {
  const n = matrix.length;
  if (n <= 1) return { avg: 0, samples: [] };
  
  const samples = matrix.map((point, i) => {
    const clusterI = clusters[i];
    const sameClusterIndices = clusters.map((c, idx) => c === clusterI && idx !== i ? idx : -1).filter(idx => idx !== -1);
    const ai = sameClusterIndices.length > 0 
      ? sameClusterIndices.reduce((acc, idx) => acc + euclideanDistance(point, matrix[idx]), 0) / sameClusterIndices.length
      : 0;

    const otherClusters = Array.from(new Set(clusters)).filter(c => c !== clusterI);
    let bi = Infinity;
    otherClusters.forEach(otherC => {
      const otherClusterIndices = clusters.map((c, idx) => c === otherC ? idx : -1).filter(idx => idx !== -1);
      const avgDist = otherClusterIndices.reduce((acc, idx) => acc + euclideanDistance(point, matrix[idx]), 0) / otherClusterIndices.length;
      bi = Math.min(bi, avgDist);
    });

    const si = (bi - ai) / Math.max(ai, bi);
    return { cluster: clusterI, value: isNaN(si) ? 0 : si };
  });

  const avg = samples.reduce((acc, s) => acc + s.value, 0) / n;
  return { avg, samples };
};

/**
 * 获取建议的最佳 K 值
 */
export const getSuggestedK = (matrix: number[][]): { bestK: number; metrics: KMetric[] } => {
  const metrics: KMetric[] = [];
  let maxSilhouette = -Infinity;
  let bestK = 2;

  for (let testK = 2; testK <= Math.min(10, matrix.length - 1); testK++) {
    const res = kmeans(matrix, testK, { initialization: 'kmeans++' });
    const sil = calculateSilhouette(matrix, res.clusters).avg;
    metrics.push({ k: testK, wcss: res.inertia, silhouette: sil });
    if (sil > maxSilhouette) {
      maxSilhouette = sil;
      bestK = testK;
    }
  }

  return { bestK, metrics };
};

/**
 * 执行聚类分析
 */
export const performClustering = (
  data: DataRow[], 
  selectedCols: string[], 
  excludeOutliers: boolean = false
): ClusterResult => {
  let log = `[${new Array(30).fill('=').join('')}]\n`;
  log += `开始执行 K-Means 聚类分析...\n模式: ${excludeOutliers ? '去除离群点' : '保留离群点'}\n特征列: ${selectedCols.join(', ')}\n`;

  // 1. 数据准备与标准化 (基于全量数据)
  const fullMatrix = data.map(d => selectedCols.map(col => Number(d[col]) || 0));
  const fullMeans = selectedCols.map((_, i) => ss.mean(fullMatrix.map(row => row[i])));
  const fullStds = selectedCols.map((_, i) => ss.standardDeviation(fullMatrix.map(row => row[i])) || 1);
  const fullScaledMatrix = fullMatrix.map(row => row.map((val, i) => (val - fullMeans[i]) / fullStds[i]));

  // 2. 检测离群点
  const outlierIndices = detectOutliers(fullScaledMatrix);
  log += `离群点检测完成。共发现 ${outlierIndices.length} 个离群点。\n`;

  // 3. 根据选项筛选数据
  let finalMatrix: number[][];
  let finalData: DataRow[];
  let mappingIndices: number[]; // 映射回原数据的索引

  if (excludeOutliers) {
    const outlierSet = new Set(outlierIndices);
    mappingIndices = data.map((_, i) => i).filter(i => !outlierSet.has(i));
    finalMatrix = fullScaledMatrix.filter((_, i) => !outlierSet.has(i));
    finalData = data.filter((_, i) => !outlierSet.has(i));
    log += `已剔除离群点，参与聚类样本数: ${finalMatrix.length}\n`;
  } else {
    mappingIndices = data.map((_, i) => i);
    finalMatrix = fullScaledMatrix;
    finalData = data;
    log += `全量参与聚类样本数: ${finalMatrix.length}\n`;
  }

  // 4. 评估 K 值
  const { metrics, bestK } = getSuggestedK(finalMatrix);
  log += `轮廓系数评估完成。建议最佳 K 值为: ${bestK}。\n`;

  // 5. 最终聚类
  const ans = kmeans(finalMatrix, bestK, { initialization: 'kmeans++' });
  const { avg: avgSilhouette, samples: silhouetteSamples } = calculateSilhouette(finalMatrix, ans.clusters);
  log += `聚类完成。平均轮廓系数: ${avgSilhouette.toFixed(4)}\n`;

  // 6. PCA 投影 (全量点用于可视化，包括标记出的离群点)
  const pca = new PCA(fullScaledMatrix);
  const fullProjected = pca.predict(fullScaledMatrix).to2DArray();
  
  // 构建 PCA 可视化数据
  const pcaData = fullProjected.map((p, i) => {
    const isOutlier = outlierIndices.includes(i);
    // 找到该点在聚类结果中的簇标签，如果被排除了则是 -1
    const finalIdx = mappingIndices.indexOf(i);
    const cluster = finalIdx !== -1 ? ans.clusters[finalIdx] : -1;
    return { x: p[0], y: p[1], cluster, isOutlier, index: i };
  });

  // 7. 簇统计
  const stats: Record<number, Record<string, number>> = {};
  const scaledStats: Record<number, Record<string, { mean: number; variance: number }>> = {};

  for (let i = 0; i < bestK; i++) {
    stats[i] = {};
    scaledStats[i] = {};
    const clusterPointsRaw = finalData.filter((_, idx) => ans.clusters[idx] === i);
    const clusterPointsScaled = finalMatrix.filter((_, idx) => ans.clusters[idx] === i);

    selectedCols.forEach((col, colIdx) => {
      stats[i][col] = clusterPointsRaw.length > 0 ? ss.mean(clusterPointsRaw.map(d => Number(d[col]) || 0)) : 0;
      const colValuesScaled = clusterPointsScaled.map(row => row[colIdx]);
      if (colValuesScaled.length > 0) {
          scaledStats[i][col] = {
              mean: ss.mean(colValuesScaled),
              variance: colValuesScaled.length > 1 ? ss.variance(colValuesScaled) : 0
          };
      } else {
          scaledStats[i][col] = { mean: 0, variance: 0 };
      }
    });
  }

  log += `[${new Array(30).fill('=').join('')}]\n分析成功结束。`;

  return {
    k: bestK,
    clusters: ans.clusters,
    centroids: ans.centroids,
    pcaData,
    outlierIndices,
    stats,
    scaledStats,
    metrics,
    silhouetteSamples,
    avgSilhouette,
    log,
    selectedCols,
    excludeOutliers
  };
};
