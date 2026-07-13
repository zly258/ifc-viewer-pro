const zh = {
  // App
  app: {
    brand: 'BIMVision',
    pro: 'PRO',
    openModel: '打开 BIM 模型',
    supportFormat: '支持 IFC 格式',
    dragHint: '点击底部工具栏「加载」导入，或直接',
    dragHere: '拖放文件',
    dragEnd: '到此处',
    releaseToLoad: '释放以加载模型',
    supportedFormat: '支持 IFC 格式',
    isolationBanner: '隔离模式激活 — 点击退出',
    clearScene: '清空当前场景',
    clearSceneDesc: '此操作将清除所有已加载模型与测量记录，且无法撤销。',
    confirmClear: '清空场景',
    cancel: '取消',
    loading: '正在读取文件…',
    parsing: '解析模型数据…',
    buildingGeometry: '正在构建几何体与属性索引',
    uploadingSample: '正在拉取案例模型...',
    downloadSampleFailed: '下载案例模型失败，请检查网络！',
    activeModels: '个活动模型',
    unnamedModel: '未命名模型',
  },

  // Toolbar
  toolbar: {
    load: '加载',
    sample: '案例',
    selectSample: '选择预设案例',
    model: '模型',
    properties: '属性',
    annotations: '批注',
    report: '报表',
    walk: '漫游',
    measure: '测量',
    section: '剖切',
    fit: '充满',
    view: '视图',
    clear: '清空',
    distance: '距离测量',
    angle: '角度测量',
    coordinate: '坐标拾取',
    measureList: '测量结果列表',
    clearAllMeasure: '清除全部测量',
    resetSection: '重置并关闭所有剖切面',
  },

  // Views
  views: {
    top: '顶视图',
    bottom: '底视图',
    front: '前视图',
    back: '后视图',
    left: '左视图',
    right: '右视图',
    isoNE: '东北等轴测',
    isoNW: '西北等轴测',
    isoSE: '东南等轴测',
    isoSW: '西南等轴测',
    orthographic: '正投影',
    isometric: '等轴测',
  },

  // Samples
  samples: {
    structureModel: '结构体系模型 (0.7MB)',
    ledScreen: 'LED大屏结构 (5.2MB)',
    energyTower: '能源大楼 (10.6MB)',
    wellnessCenter: '康体中心 (21.3MB)',
  },

  // Measurement Panel
  measurement: {
    title: '测量结果',
    empty: '暂无测量记录',
    emptyDesc: '在下方工具栏中选择测量工具，并在模型表面单击取点进行测量。',
    panelTitle: '测量结果列表',
    clearAll: '清空所有测量记录',
    exportReport: '导出 HTML 报告 (含三维快照)',
    deleteSingle: '删除单条测量',
    locateHint: '双击定位到该测量记录',
    distance: '距离测距',
    angle: '角度测量',
    coordinate: '坐标拾取',
  },

  // Model Tree
  modelTree: {
    title: '模型结构',
  },

  // Properties
  properties: {
    title: '属性详情',
  },

  // BCF
  bcf: {
    title: '视点与批注',
  },

  // Report
  report: {
    title: '工程量报表',
  },

  // Tips
  tips: {
    clickStart: '点击起点',
    clickEnd: '点击终点',
    clickVertex: '点击顶点',
    clickNext: '点击下一个点 (双击结束)',
    clickCorner1: '点击角点 1',
    clickCorner2: '点击角点 2',
    clickAnyPoint: '点击任意点获取坐标',
  },

  // Theme
  theme: {
    switchToLight: '切换为浅色主题',
    switchToDark: '切换为深色主题',
  },

  // Screenshot
  screenshot: {
    save: '截图保存',
  },

  // About
  about: {
    title: '关于软件与操作说明',
  },

  // Report export
  reportExport: {
    title: 'BIMVision Pro 测量与分析报告',
    measureRecords: '测量记录列表',
    snapshot: '视点快照',
    printPdf: '打印报告 / 导出 PDF',
    footer: '此报告由 BIMVision Pro 平台自动生成。版权所有 © 2026.',
    index: '序号',
    type: '测量类型',
    value: '测量值',
    fileName: '文件名称',
    exportTime: '导出时间',
    reportNo: '报告编号',
  },
};

export default zh;
export type LocaleMessages = typeof zh;
