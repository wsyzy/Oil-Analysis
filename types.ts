
// 数据表行类型定义
export type DataRow = Record<string, string | number | null>;

// 分析结果类型
export interface PearsonResult {
  matrix: Record<string, Record<string, number>>;
  columns: string[];
  datasetName: string;
}

// 聚类评估指标
export interface KMetric {
  k: number;
  wcss: number;
  silhouette: number;
}

// 聚类分析结果类型
export interface ClusterResult {
  k: number;
  clusters: number[]; 
  centroids: number[][]; 
  pcaData: { x: number; y: number; cluster: number; isOutlier: boolean; index: number }[]; 
  outlierIndices: number[];
  stats: Record<number, Record<string, number>>; 
  // 标准化后的统计信息（均值和方差）
  scaledStats: Record<number, Record<string, { mean: number; variance: number }>>;
  metrics: KMetric[]; // 肘部法则和轮廓系数数据
  silhouetteSamples: { cluster: number; value: number }[]; // 详细轮廓值
  avgSilhouette: number;
  log: string;
  selectedCols: string[];
  excludeOutliers: boolean;
}
