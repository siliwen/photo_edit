import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Stage, Layer, Image as KonvaImage, Line } from 'react-konva'
import { useAppStore, MASK_COLORS, MaskElement } from '../../store'
import { uploadToOSS } from '../../utils/upload'

const BaseImageCard: React.FC = () => {
  const baseImage = useAppStore(s => s.baseImage)
  const setBaseImage = useAppStore(s => s.setBaseImage)
  const baseMeta = useAppStore(s => s.baseMeta)
  const setBaseMeta = useAppStore(s => s.setBaseMeta)
  const setOutputResolution = useAppStore(s => s.setOutputResolution)  // ✅ 添加
  const mask = useAppStore(s => s.mask)
  const currentMaskColor = useAppStore(s => s.currentMaskColor)
  const setCurrentMaskColor = useAppStore(s => s.setCurrentMaskColor)
  const addMaskElement = useAppStore(s => s.addMaskElement)
  const undoLastElement = useAppStore(s => s.undoLastElement)
  const clearMask = useAppStore(s => s.clearMask)
  const updateMaskDataUrl = useAppStore(s => s.updateMaskDataUrl)
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
  const startPointRef = useRef<{ x: number; y: number } | null>(null)  // ✅ 保存起点

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
    
    // 自动判断是否需要代理（OSS域名自动走代理）
    let finalUrl = baseImage
    try {
      const urlObj = new URL(baseImage)
      if (urlObj.hostname.includes('aliyuncs.com')) {
        finalUrl = `/oss-proxy${urlObj.pathname}${urlObj.search}`
        console.log('[图片加载] 检测到OSS链接，使用代理:', finalUrl)
      }
    } catch (e) {
      console.warn('[图片加载] URL解析失败:', e)
    }

    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.src = finalUrl
    
    img.onload = () => setImgEl(img)
    img.onerror = (e) => {
      console.error('[图片加载] 失败:', finalUrl, e)
      // 如果代理失败，尝试原始链接（作为兜底，虽然可能跨域）
      if (finalUrl !== baseImage) {
        console.log('[图片加载] 代理失败，尝试原始链接...')
        img.src = baseImage
      }
    }
  }, [baseImage])

  // ✅ 已移除：蒙版图片生成逻辑 (响应"移除蒙版颜色渲染"要求)
  // 我们不再生成 colored mask 或 bw mask，而是直接使用坐标参数提交给后端

  const onSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    
    try {
      const localUrl = URL.createObjectURL(f)
      setBaseImage(localUrl)
      
      const ossUrl = await uploadToOSS(f)
      console.log('[图片上传] OSS URL:', ossUrl)
      
      const img = new Image()
      img.onload = () => {
        setBaseMeta({ width: img.width, height: img.height })
        setBaseImage(ossUrl)
        
        // ✅ 自动设置输出分辨率与主图比例一致
        const ratio = img.width / img.height
        let outputWidth = img.width
        let outputHeight = img.height
        
        // 如果超过4K，按比例缩放到4K以内
        const maxDim = 3840
        if (outputWidth > maxDim || outputHeight > maxDim) {
          if (ratio >= 1) {
            // 横图或正方形
            outputWidth = maxDim
            outputHeight = Math.round(maxDim / ratio)
          } else {
            // 竖图
            outputHeight = maxDim
            outputWidth = Math.round(maxDim * ratio)
          }
        }
        
        setOutputResolution(`${outputWidth}x${outputHeight}`)
        console.log(`[主图上传] 原始尺寸: ${img.width}x${img.height}`)
        console.log(`[主图上传] 输出尺寸: ${outputWidth}x${outputHeight}`)
        console.log(`[主图上传] 比例: ${ratio.toFixed(2)}`)
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
    startPointRef.current = original  // ✅ 保存起点到ref
    setDrawingPoints([original])
    setIsDrawing(true)
  }
  
  const handleMouseMove = () => {
    if (!isDrawing || !stageRef.current) return
    const p = stageRef.current.getPointerPosition()
    const original = { x: p.x / viewScale, y: p.y / viewScale }
    
    if (drawMode === 'rectangle' || drawMode === 'circle') {
      // ✅ 使用ref中保存的起点，避免闭包问题
      if (startPointRef.current) {
        setDrawingPoints([startPointRef.current, original])
      }
    } else {
      // ✅ 画笔模式：直接添加点，不进行实时平滑（避免线条漂移）
      setDrawingPoints(prev => [...prev, original])
    }
  }
  
  // ✅ 自动保存：鼠标松开时保存元素
  const handleMouseUp = () => {
    setIsDrawing(false)
    startPointRef.current = null  // ✅ 清空起点引用
    
    if (drawingPoints.length < 2) {
      setDrawingPoints([])
      return
    }
    
    // 最终平滑
    const finalPoints = drawMode === 'brush' ? smoothPoints(drawingPoints, 5) : drawingPoints
    
    // 自动保存元素
    const id = `element_${Date.now()}`
    const type = drawMode
    const element: MaskElement = {
      id,
      type,
      color: '#00A2FF',
      points: finalPoints,
      brushSize: 12
    }
    
    // 自动命名（类型 + 序号）
    const typeLabel = type === 'rectangle' ? '矩形' : type === 'circle' ? '圆形' : '画笔'
    const sameTypeCount = mask.elements.filter(el => el.type === type).length + 1
    const cnIndex = ['一','二','三','四','五','六','七','八','九','十'][sameTypeCount - 1] || String(sameTypeCount)
    element.name = `${typeLabel}${cnIndex}`

    // 计算坐标数组
    if (type === 'rectangle') {
      const p1 = finalPoints[0]
      const p2 = finalPoints[finalPoints.length - 1]
      const x = Math.min(p1.x, p2.x)
      const y = Math.min(p1.y, p2.y)
      const w = Math.abs(p2.x - p1.x)
      const h = Math.abs(p2.y - p1.y)
      element.coords = [
        Math.round(x), Math.round(y),
        Math.round(x + w), Math.round(y),
        Math.round(x + w), Math.round(y + h),
        Math.round(x), Math.round(y + h)
      ]
    } else if (type === 'brush') {
      element.coords = finalPoints.flatMap(p => [Math.round(p.x), Math.round(p.y)])
    }

    addMaskElement(element)
    setDrawingPoints([])
    
    console.log('[自动保存] 元素已添加:', element.type, element.color)

    // 即时反馈：高亮新元素 1.5s
    setHighlightedElementId(id)
    setTimeout(() => setHighlightedElementId(null), 1500)
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">原始图片</div>
        <span className="tag required">必填</span>
      </div>
      <div className="card-body" ref={containerRef}>
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
              
              
              
              <div style={{ width: 1, height: 20, background: '#e5e5e5' }} />
              
              {/* 标注对象列表 */}
              {mask.elements.length > 0 && (
                <div style={{ display: 'grid', gap: 6, flex: 1 }}>
                  <div style={{ fontSize: 12, color: '#666' }}>标注对象（{mask.elements.length}）</div>
                  <div style={{ display: 'grid', gap: 4, maxHeight: 160, overflow: 'auto' }}>
                    {mask.elements.map(el => {
                      const typeLabel = el.type === 'rectangle' ? '矩形' : el.type === 'circle' ? '圆形' : '画笔'
                      const coords = el.coords || (el.type === 'rectangle' ? (() => {
                        const p1 = el.points[0]; const p2 = el.points[el.points.length - 1]
                        const x = Math.min(p1.x, p2.x); const y = Math.min(p1.y, p2.y)
                        const w = Math.abs(p2.x - p1.x); const h = Math.abs(p2.y - p1.y)
                        return [x, y, x + w, y, x + w, y + h, x, y + h].map(n => Math.round(n))
                      })() : el.type === 'brush' ? el.points.flatMap(p => [Math.round(p.x), Math.round(p.y)]) : [])
                      const coordText = coords && coords.length > 0 ? coords.join(',') : '—'
                      return (
                        <div
                          key={el.id}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', border: '1px solid #e5e5e5', borderRadius: 6 }}
                          onMouseEnter={() => setHighlightedElementId(el.id)}
                          onMouseLeave={() => setHighlightedElementId(null)}
                        >
                          
                          <span className="id-badge">{el.name || typeLabel}</span>
                          <span style={{ color: '#666' }}>{typeLabel}</span>
                          
                          <button
                            className="button"
                            style={{ marginLeft: 'auto', background: '#ef4444', color: '#fff' }}
                            onClick={() => {
                              if (confirm(`删除 ${el.name || typeLabel} ?`)) {
                                const idx = mask.elements.findIndex(e => e.id === el.id)
                                if (idx >= 0) {
                                  // 简易删除：通过撤销直到删除该元素或清空重建
                                  // 这里直接重建 elements 列表
                                  const newEls = mask.elements.filter(e => e.id !== el.id)
                                  // 使用 clear + 逐个添加以沿用现有API
                                  clearMask()
                                  newEls.forEach(ne => addMaskElement(ne))
                                }
                              }
                            }}
                          >🗑️</button>
                        </div>
                      )
                    })}
                  </div>
                </div>
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
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            <Layer>
              {imgEl && <KonvaImage image={imgEl} x={0} y={0} scaleX={viewScale} scaleY={viewScale} />}
              
              {/* 已保存的元素 */}
              {showMasks && mask.elements.map(element => {
                const isHighlighted = element.id === highlightedElementId
                const strokeColor = isHighlighted ? '#FFFF00' : element.color
                const strokeWidth = isHighlighted ? (element.brushSize * viewScale + 4) : (element.brushSize * viewScale)
                const shadowProps = isHighlighted ? { shadowColor: 'black', shadowBlur: 10, shadowOpacity: 0.8 } : {}

                if (element.type === 'brush') {
                  return (
                    <Line 
                      key={element.id}
                      points={element.points.flatMap(p => [p.x * viewScale, p.y * viewScale])} 
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      lineCap="round"
                      lineJoin="round"
                      {...shadowProps}
                    />
                  )
                } else if (element.type === 'rectangle') {
                  const coords = element.coords && element.coords.length === 8
                    ? element.coords
                    : (() => {
                        const p1 = element.points[0]
                        const p2 = element.points[element.points.length - 1]
                        const x = Math.min(p1.x, p2.x)
                        const y = Math.min(p1.y, p2.y)
                        const w = Math.abs(p2.x - p1.x)
                        const h = Math.abs(p2.y - p1.y)
                        return [x, y, x + w, y, x + w, y + h, x, y + h].map(n => Math.round(n))
                      })()
                  const polyPoints = [
                    coords[0] * viewScale, coords[1] * viewScale,
                    coords[2] * viewScale, coords[3] * viewScale,
                    coords[4] * viewScale, coords[5] * viewScale,
                    coords[6] * viewScale, coords[7] * viewScale
                  ]
                  return (
                    <Line
                      key={element.id}
                      points={polyPoints}
                      closed
                      stroke={strokeColor}
                      strokeWidth={isHighlighted ? 4 : 2}
                      fill={`${element.color}40`}
                      {...shadowProps}
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
                      stroke={strokeColor}
                      strokeWidth={isHighlighted ? 4 : 2}
                      fill={`${element.color}40`}
                      {...shadowProps}
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
                    stroke={'#00A2FF'}
                    strokeWidth={12 * viewScale}
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
      </div>
    </div>
  )
}

export default BaseImageCard
