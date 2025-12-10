import { create } from 'zustand'

export type TaskStatus = 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED'

export interface Task {
  id: string
  title: string
  status: TaskStatus
  resultUrl?: string
  createdAt: number
  // ✅ 新增：保存任务参数用于重新生成
  payload?: any
}

// ✅ 预设蒙版颜色
export const MASK_COLORS = [
  { id: 'red', name: '红色', hex: '#FF0000', rgb: [255, 0, 0] },
  { id: 'green', name: '绿色', hex: '#00FF00', rgb: [0, 255, 0] },
  { id: 'blue', name: '蓝色', hex: '#0000FF', rgb: [0, 0, 255] },
  { id: 'yellow', name: '黄色', hex: '#FFFF00', rgb: [255, 255, 0] },
  { id: 'cyan', name: '青色', hex: '#00FFFF', rgb: [0, 255, 255] },
  { id: 'magenta', name: '品红', hex: '#FF00FF', rgb: [255, 0, 255] },
  { id: 'white', name: '白色', hex: '#FFFFFF', rgb: [255, 255, 255] }
] as const

export type MaskColorId = typeof MASK_COLORS[number]['id']

// ✅ 重构：单一蒙版 + 多元素架构
export interface MaskElement {
  id: string
  name?: string
  type: 'brush' | 'rectangle' | 'circle' | 'line'
  color: string
  points: Array<{ x: number; y: number }>
  brushSize: number
  coords?: number[]
}

export interface SingleMask {
  elements: MaskElement[]  // 单一蒙版包含多个元素
  maskDataUrl?: string  // 合成后的蒙版图片
  updatedAt: number
}

interface ReferenceAsset { 
  id: string
  url: string
  preprocess: 'none' | 'foreground_only'
  index?: number  // ✅ 添加索引字段
}

interface AppState {
  baseImage?: string
  baseMeta?: { width: number; height: number }
  materials: ReferenceAsset[]
  outputResolution: string
  tasks: Task[]
  
  // ✅ 新：单一蒙版架构
  mask: SingleMask
  currentMaskColor: string
  setCurrentMaskColor: (color: string) => void
  addMaskElement: (element: MaskElement) => void
  undoLastElement: () => void
  clearMask: () => void
  updateMaskDataUrl: (dataUrl: string) => void
  
  setBaseImage: (url: string) => void
  setBaseMeta: (meta: { width: number; height: number }) => void
  addMaterials: (assets: ReferenceAsset[]) => void
  removeMaterial: (id: string) => void
  setOutputResolution: (res: string) => void
  addTask: (task: Task) => void
  updateTask: (id: string, partial: Partial<Task>) => void
  prompt?: string
  model?: string
  setPrompt: (p: string) => void
  setModel: (m: string) => void
  
  // ✅ 元素高亮状态
  highlightedElementId: string | null
  setHighlightedElementId: (id: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  baseImage: undefined,
  baseMeta: undefined,
  materials: [],
  outputResolution: '3840x2160',
  tasks: [],
  
  // ✅ 单一蒙版初始状态
  mask: { elements: [], updatedAt: Date.now() },
  currentMaskColor: MASK_COLORS[0].hex,
  
  highlightedElementId: null,
  setHighlightedElementId: (id) => set({ highlightedElementId: id }),
  
  setCurrentMaskColor: (color: string) => set({ currentMaskColor: color }),
  
  addMaskElement: (element: MaskElement) => set((s) => ({
    mask: {
      ...s.mask,
      elements: [...s.mask.elements, element],
      updatedAt: Date.now()
    }
  })),
  
  undoLastElement: () => set((s) => ({
    mask: {
      ...s.mask,
      elements: s.mask.elements.slice(0, -1),
      updatedAt: Date.now()
    }
  })),
  
  clearMask: () => set({ 
    mask: { elements: [], maskDataUrl: undefined, updatedAt: Date.now() } 
  }),
  
  updateMaskDataUrl: (dataUrl: string) => set((s) => ({
    mask: { ...s.mask, maskDataUrl: dataUrl, updatedAt: Date.now() }
  })),
  
  setBaseImage: (url: string) => set({ baseImage: url }),
  setBaseMeta: (meta) => set({ baseMeta: meta }),
  addMaterials: (assets) => set((s) => ({ materials: [...s.materials, ...assets] })),
  removeMaterial: (id: string) => set((s) => ({ materials: s.materials.filter(m => m.id !== id) })),
  setOutputResolution: (res) => set({ outputResolution: res }),
  addTask: (task: Task) => set((s) => ({ tasks: [task, ...s.tasks] })),
  updateTask: (id: string, partial: Partial<Task>) => set((s) => ({
    tasks: s.tasks.map(t => t.id === id ? { ...t, ...partial } : t)
  })),
  setPrompt: (p) => set({ prompt: p }),
  setModel: (m) => set({ model: m }),
  prompt: '',
  model: 'banana2-pro',
}))
