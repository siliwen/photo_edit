import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Stage, Layer, Image as KonvaImage, Line } from 'react-konva'
import { useAppStore, MASK_COLORS, MaskElement } from '../../store'
import { uploadFile } from '../../utils/upload'

const BaseImageCard: React.FC = () => {
  const baseImage = useAppStore(s => s.baseImage)
  const setBaseImage = useAppStore(s => s.setBaseImage)
  const baseMeta = useAppStore(s => s.baseMeta)
  const setBaseMeta = useAppStore(s => s.setBaseMeta)
  const setOutputResolution = useAppStore(s => s.setOutputResolution)
  const mask = useAppStore(s => s.mask)
  const currentMaskColor = useAppStore(s => s.currentMaskColor)
  const setCurrentMaskColor = useAppStore(s => s.setCurrentMaskColor)
  const addMaskElement = useAppStore(s => s.addMaskElement)
  const undoLastElement = useAppStore(s => s.undoLastElement)
  const clearMask = useAppStore(s => s.clearMask)
  // 已移除蒙版合成，保留标注坐标收集
  const highlightedElementId = useAppStore(s => s.highlightedElementId)
  const setHighlightedElementId = useAppStore(s => s.setHighlightedElementId)

  // ✅ 简化状态管理
  const [drawMode, setDrawMode] = useState<'brush' | 'rectangle' | 'circle'>('brush')
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  const [drawingPoints, setDrawingPoints] = useState<Array<{ x: number; y: number }>>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [brushSize, setBrushSize] = useState(20)
  const [showMasks, setShowMasks] = useState(true)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<any>(null)
  const [containerWidth, setContainerWidth] = useState<number>(800)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const resize = () => {
      if (containerRef.current) setContainerWidth(containerRef.current.clientWidth)
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useEffect(() => {
    if (!baseImage) { setImgEl(null); return }
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.src = baseImage
    img.onload = () => setImgEl(img)
  }, [baseImage])

  // 移除蒙版合成逻辑（统一采用标注坐标作为核心概念）

  const onSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    
    try {
      const localUrl = URL.createObjectURL(f)
      setBaseImage(localUrl)
      
      const ossUrl = await uploadFile(f)
      console.log('[图片上传] OSS URL:', ossUrl)
      setBaseImage(ossUrl)
      
      const img = new Image()
      img.onload = () => {
        setBaseMeta({ width: img.width, height: img.height })
        setOutputResolution(`${img.width}x${img.height}`)
      }
      img.src = ossUrl
    } catch (error) {
      console.error('[图片上传] 失败:', error)
      alert('图片上传失败，请重试')
    }
  }

  const meta = baseMeta || { width: imgEl?.width || 1024, height: imgEl?.height || 768 }
  const viewScale = useMemo(() => {
    if (!meta.width) return 1
    const maxW = containerWidth - 24
    return Math.min(1, maxW / meta.width)
  }, [containerWidth, meta.width])

  const smoothPoints = (pts: Array<{ x: number; y: number }>, window = 5) => {
    if (pts.length <= window) return pts
    const out: Array<{ x: number; y: number }> = []
    
    for (let i = 0; i < pts.length; i++) {
      const start = Math.max(0, i - Math.floor(window / 2))
      const end = Math.min(pts.length, i + Math.ceil(window / 2))
      const slice = pts.slice(start, end)
      const x = slice.reduce((s, p) => s + p.x, 0) / slice.length
      const y = slice.reduce((s, p) => s + p.y, 0) / slice.length
      out.push({ x, y })
    }
    
    if (out.length > 10) {
      const simplified: Array<{ x: number; y: number }> = [out[0]]
      const tolerance = 2
      
      for (let i = 1; i < out.length - 1; i++) {
        const prev = simplified[simplified.length - 1]
        const curr = out[i]
        const dist = Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2))
        
        if (dist > tolerance) {
          simplified.push(curr)
        }
      }
      simplified.push(out[out.length - 1])
      return simplified
    }
    
    return out
  }

  const handleMouseDown = () => {
    if (!stageRef.current) return
    const p = stageRef.current.getPointerPosition()
    const original = { x: p.x / viewScale, y: p.y / viewScale }
    setDrawingPoints([original])
    setIsDrawing(true)
  }
  
  const handleMouseMove = () => {
    if (!isDrawing || !stageRef.current) return
    const p = stageRef.current.getPointerPosition()
    const original = { x: p.x / viewScale, y: p.y / viewScale }
    
    if (drawMode === 'rectangle' || drawMode === 'circle') {
      setDrawingPoints([drawingPoints[0], original])
    } else {
      // 画笔模式：实时平滑
      setDrawingPoints(prev => {
        const newPoints = [...prev, original]
        if (newPoints.length > 10) {
          const smoothed = smoothPoints(newPoints.slice(0, -3), 5)
          return [...smoothed, ...newPoints.slice(-3)]
        }
        return newPoints
      })
    }
  }
  
  // ✅ 自动保存：鼠标松开时保存元素
  const handleMouseUp = () => {
    setIsDrawing(false)
    
    if (drawingPoints.length < 2) {
      setDrawingPoints([])
      return
    }
    
    // 最终平滑
    const finalPoints = drawMode === 'brush' ? smoothPoints(drawingPoints, 5) : drawingPoints
    
    // 自动保存元素
    const toChinese = (n: number) => {
      const map = ['一','二','三','四','五','六','七','八','九','十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十']
      return map[n - 1] || String(n)
    }
    const rectCount = mask.elements.filter(e => e.type === 'rectangle').length + (drawMode === 'rectangle' ? 1 : 0)
    const circleCount = mask.elements.filter(e => e.type === 'circle').length + (drawMode === 'circle' ? 1 : 0)
    const brushCount = mask.elements.filter(e => e.type === 'brush').length + (drawMode === 'brush' ? 1 : 0)
    const element: MaskElement = {
      id: `element_${Date.now()}`,
      type: drawMode,
      color: currentMaskColor,
      points: finalPoints,
      brushSize: brushSize,
      name: drawMode === 'rectangle'
        ? `矩形${toChinese(rectCount)}`
        : drawMode === 'circle'
        ? `圆形${toChinese(circleCount)}`
        : `画笔${toChinese(brushCount)}`
    }
    
    addMaskElement(element)
    setDrawingPoints([])
    
    console.log('[自动保存] 元素已添加:', element.type, element.color)
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">原始图片</div>
        <span className="tag required">必填</span>
      </div>
      <div className="card-body" ref={containerRef} style={{ touchAction: 'none', userSelect: 'none' }}>
        {/* 工具栏 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="button" onClick={() => inputRef.current?.click()}>选择图片</button>
          <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onSelect} />
          
          {baseImage && (
            <>
              <div style={{ width: 1, height: 20, background: '#e5e5e5' }} />
              
              {/* 绘制工具 */}
              <button 
                className="button" 
                onClick={() => setDrawMode('brush')}
                style={{ background: drawMode === 'brush' ? '#3b82f6' : undefined, color: drawMode === 'brush' ? 'white' : undefined }}
              >
                🖌️ 画笔
              </button>
              <button 
                className="button"
                onClick={() => setDrawMode('rectangle')}
                style={{ background: drawMode === 'rectangle' ? '#3b82f6' : undefined, color: drawMode === 'rectangle' ? 'white' : undefined }}
              >
                ■ 矩形
              </button>
              <button 
                className="button"
                onClick={() => setDrawMode('circle')}
                style={{ background: drawMode === 'circle' ? '#3b82f6' : undefined, color: drawMode === 'circle' ? 'white' : undefined }}
              >
                ● 圆形
              </button>
              
              <div style={{ width: 1, height: 20, background: '#e5e5e5' }} />
              
              {/* 笔刷大小 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <label style={{ fontSize: 12, color: '#666' }}>笔刷:</label>
                <input 
                  type="range" 
                  min="5" 
                  max="50" 
                  value={brushSize} 
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  style={{ width: 80 }}
                />
                <span style={{ fontSize: 12, color: '#666' }}>{brushSize}px</span>
              </div>
              
              {/* 颜色选择 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ fontSize: 12, color: '#666' }}>颜色:</label>
                {MASK_COLORS.map(color => (
                  <button
                    key={color.id}
                    onClick={() => setCurrentMaskColor(color.hex)}
                    title={color.name}
                    style={{
                      width: 28,
                      height: 28,
                      backgroundColor: color.hex,
                      border: currentMaskColor === color.hex ? '3px solid #000' : '2px solid #e5e5e5',
                      borderRadius: 4,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      boxShadow: currentMaskColor === color.hex ? '0 0 0 2px #fff, 0 0 8px rgba(0,0,0,0.3)' : 'none'
                    }}
                  />
                ))}
              </div>
              
              <div style={{ width: 1, height: 20, background: '#e5e5e5' }} />
              
              {/* 蒙版操作 */}
              {mask.elements.length > 0 && (
                <>
                  <button className="button" onClick={undoLastElement}>
                    ↶ 撤销
                  </button>
                  <button 
                    className="button" 
                    onClick={() => {
                      if (confirm('确定清空所有标注吗？')) {
                        clearMask()
                      }
                    }}
                  >
                    🗑️ 清空标注
                  </button>
                  <button className="button" onClick={() => setShowMasks(!showMasks)}>
                    {showMasks ? '隐藏标注' : '显示标注'}
                  </button>
                  <span style={{ fontSize: 12, color: '#666' }}>
                    ({mask.elements.length} 个元素)
                  </span>
                </>
              )}
            </>
          )}
        </div>
        
        {/* Canvas */}
        {baseImage && (
          <Stage
            ref={stageRef}
            width={meta.width * viewScale}
            height={meta.height * viewScale}
            draggable={false}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            <Layer>
              {imgEl && <KonvaImage image={imgEl} x={0} y={0} scaleX={viewScale} scaleY={viewScale} draggable={false} listening={false} />}
              
              {/* 已保存的元素 */}
  {showMasks && mask.elements.map(element => {
    if (element.type === 'brush') {
      return (
                    <Line 
                      key={element.id}
                      points={element.points.flatMap(p => [p.x * viewScale, p.y * viewScale])} 
                      stroke={highlightedElementId === element.id ? '#2563eb' : element.color}
                      strokeWidth={element.brushSize * viewScale}
                      lineCap="round"
                      lineJoin="round"
                      draggable={false}
                    />
      )
    } else if (element.type === 'rectangle') {
      const p1 = element.points[0]
      const p2 = element.points[element.points.length - 1]
      const x = Math.min(p1.x, p2.x)
      const y = Math.min(p1.y, p2.y)
      const w = Math.abs(p2.x - p1.x)
      const h = Math.abs(p2.y - p1.y)
      return (
                    <Line
                      key={element.id}
                      points={[
                        x * viewScale, y * viewScale,
                        (x + w) * viewScale, y * viewScale,
                        (x + w) * viewScale, (y + h) * viewScale,
                        x * viewScale, (y + h) * viewScale
                      ]}
                      closed
                      stroke={highlightedElementId === element.id ? '#2563eb' : element.color}
                      strokeWidth={highlightedElementId === element.id ? 3 : 2}
                      fill={`${element.color}40`}
                      draggable={false}
                    />
      )
    } else if (element.type === 'circle') {
      const p1 = element.points[0]
      const p2 = element.points[element.points.length - 1]
      const radius = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2))
      const circlePoints: Array<{ x: number; y: number }> = []
      for (let i = 0; i <= 32; i++) {
        const angle = (i / 32) * Math.PI * 2
        circlePoints.push({
          x: p1.x + radius * Math.cos(angle),
          y: p1.y + radius * Math.sin(angle)
        })
      }
      return (
                    <Line
                      key={element.id}
                      points={circlePoints.flatMap(p => [p.x * viewScale, p.y * viewScale])}
                      closed
                      stroke={highlightedElementId === element.id ? '#2563eb' : element.color}
                      strokeWidth={highlightedElementId === element.id ? 3 : 2}
                      fill={`${element.color}40`}
                      draggable={false}
                    />
      )
    }
    return null
  })}
              
              {/* 实时绘制预览 */}
              {drawingPoints.length > 1 && (
                drawMode === 'brush' ? (
                  <Line 
                    points={drawingPoints.flatMap(p => [p.x * viewScale, p.y * viewScale])} 
                    stroke={currentMaskColor}
                    strokeWidth={brushSize * viewScale}
                    lineCap="round"
                    lineJoin="round"
                  />
                ) : drawMode === 'rectangle' ? (
                  <>
                    {(() => {
                      const p1 = drawingPoints[0]
                      const p2 = drawingPoints[drawingPoints.length - 1]
                      const x = Math.min(p1.x, p2.x)
                      const y = Math.min(p1.y, p2.y)
                      const w = Math.abs(p2.x - p1.x)
                      const h = Math.abs(p2.y - p1.y)
                      return (
                        <Line 
                          points={[
                            x * viewScale, y * viewScale,
                            (x + w) * viewScale, y * viewScale,
                            (x + w) * viewScale, (y + h) * viewScale,
                            x * viewScale, (y + h) * viewScale
                          ]}
                          closed
                          stroke={currentMaskColor}
                          strokeWidth={2}
                          fill={`${currentMaskColor}20`}
                        />
                      )
                    })()}
                  </>
                ) : (
                  <>
                    {(() => {
                      const p1 = drawingPoints[0]
                      const p2 = drawingPoints[drawingPoints.length - 1]
                      const radius = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2))
                      const circlePoints: Array<{ x: number; y: number }> = []
                      for (let i = 0; i <= 32; i++) {
                        const angle = (i / 32) * Math.PI * 2
                        circlePoints.push({
                          x: p1.x + radius * Math.cos(angle),
                          y: p1.y + radius * Math.sin(angle)
                        })
                      }
                      return (
                        <Line 
                          points={circlePoints.flatMap(p => [p.x * viewScale, p.y * viewScale])} 
                          closed
                          stroke={currentMaskColor}
                          strokeWidth={2}
                          fill={`${currentMaskColor}20`}
                        />
                      )
                    })()}
                  </>
                )
              )}
          </Layer>
          </Stage>
        )}

        {mask.elements.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, color: '#374151', marginBottom: 6 }}>标注对象选择</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {mask.elements.map(el => {
                const typeLabel = el.type === 'rectangle' ? '矩形' : el.type === 'circle' ? '圆形' : '画笔'
                const selected = highlightedElementId === el.id
                return (
                  <div key={el.id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #e5e5e5', borderRadius: 8, padding: '8px 10px', background: selected ? '#eff6ff' : 'transparent', transition: 'background 0.2s' }} onMouseEnter={() => setHighlightedElementId(el.id)} onMouseLeave={() => setHighlightedElementId(null)} onClick={() => setHighlightedElementId(el.id)}>
                    <span className="id-badge">{el.name || `${typeLabel}`}</span>
                    <span style={{ width: 20, height: 20, borderRadius: 4, border: '1px solid #d1d5db', background: el.color }} />
                    <span style={{ color: '#666' }}>{typeLabel}</span>
                    <span style={{ marginLeft: 'auto' }} />
                    <button
                      className="button"
                      onClick={(e) => { e.stopPropagation(); setHighlightedElementId(el.id) }}
                    >编辑</button>
                    <button
                      className="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        let tag = ''
                        if (el.type === 'rectangle' || el.type === 'brush') {
                          const xs = el.points.map(p => p.x); const ys = el.points.map(p => p.y)
                          const minX = Math.round(Math.min(...xs)); const minY = Math.round(Math.min(...ys))
                          const maxX = Math.round(Math.max(...xs)); const maxY = Math.round(Math.max(...ys))
                          const w = Math.max(1, maxX - minX); const h = Math.max(1, maxY - minY)
                          tag = `@rect(${minX},${minY},${w},${h})`
                        } else if (el.type === 'circle') {
                          const p1 = el.points[0]
                          const p2 = el.points[el.points.length - 1]
                          const cx = Math.round(p1.x)
                          const cy = Math.round(p1.y)
                          const r = Math.max(1, Math.round(Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2))))
                          tag = `@circle(${cx},${cy},${r})`
                        }
                        if (!tag) return
                        const s = useAppStore.getState()
                        const value = s.prompt || ''
                        s.setPrompt((value ? value + ' ' : '') + tag)
                      }}
                    >插入坐标</button>
                    <button
                      className="button"
                      style={{ background: '#ef4444', color: '#fff' }}
                      onClick={() => {
                        if (confirm(`删除 ${el.name || typeLabel} ?`)) {
                          const s = useAppStore.getState()
                          const newEls = s.mask.elements.filter(e => e.id !== el.id)
                          s.clearMask()
                          newEls.forEach(ne => s.addMaskElement(ne))
                          if (highlightedElementId === el.id) setHighlightedElementId(null)
                        }
                      }}
                    >🗑️</button>
                  </div>
                )
              })}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
              提示：标注颜色仅用于视觉区分，坐标标注以对象位置为准
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default BaseImageCard
