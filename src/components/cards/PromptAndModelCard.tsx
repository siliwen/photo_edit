import React, { useMemo, useState } from 'react'
import { useAppStore, MASK_COLORS } from '../../store'

export const isValidRectTag = (tag: string) => {
  return /^@rect\(\d{1,5},\d{1,5},\d{1,5},\d{1,5}\)$/.test(tag)
}

export const isValidCircleTag = (tag: string) => {
  return /^@circle\(\d{1,5},\d{1,5},\d{1,5}\)$/.test(tag)
}

export const elementRect = (points: Array<{ x: number; y: number }>) => {
  const xs = points.map(p => p.x)
  const ys = points.map(p => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  const w = Math.max(1, Math.round(maxX - minX))
  const h = Math.max(1, Math.round(maxY - minY))
  return { x: Math.round(minX), y: Math.round(minY), w, h }
}

export const elementCircle = (points: Array<{ x: number; y: number }>) => {
  const p1 = points[0]
  const p2 = points[points.length - 1]
  const cx = Math.round(p1.x)
  const cy = Math.round(p1.y)
  const r = Math.max(1, Math.round(Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2))))
  return { cx, cy, r }
}

const PromptAndModelCard: React.FC = () => {
  const prompt = useAppStore(s => s.prompt)
  const setPrompt = useAppStore(s => s.setPrompt)
  const model = useAppStore(s => s.model)
  const setModel = useAppStore(s => s.setModel)
  const baseMeta = useAppStore(s => s.baseMeta)
  const outputResolution = useAppStore(s => s.outputResolution)
  const setOutputResolution = useAppStore(s => s.setOutputResolution)
  const materials = useAppStore(s => s.materials)
  const mask = useAppStore(s => s.mask)  // ✅ 单一蒙版
  const setHighlightedElementId = useAppStore(s => s.setHighlightedElementId) // ✅
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [validationMsg, setValidationMsg] = useState<string>('')
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const parseRes = (res: string) => { const [w, h] = res.split('x').map(Number); return { w: w || 3840, h: h || 2160 } }
  const [width, setWidth] = useState<number>(parseRes(outputResolution).w)
  const [height, setHeight] = useState<number>(parseRes(outputResolution).h)  // ✅ 高度也可编辑
  
  // ✅ 同步更新 outputResolution
  React.useEffect(() => {
    setOutputResolution(`${width}x${height}`)
  }, [width, height, setOutputResolution])
  
  // ✅ 响应 outputResolution 的外部变化（主图上传时自动设置）
  React.useEffect(() => {
    const parsed = parseRes(outputResolution)
    setWidth(parsed.w)
    setHeight(parsed.h)
  }, [outputResolution])

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    const pos = e.target.selectionStart
    setPrompt(value)
    setCursorPosition(pos)

    const labelPattern = /@?(矩形|圆形|画笔)(一|二|三|四|五|六|七|八|九|十|\d+)/g
    const hasAt = value.includes('@')
    const labels = value.match(labelPattern) || []
    let msg = hasAt && labels.length === 0 ? '形状标识应为 @矩形一 / @圆形二 / @画笔三 等格式' : ''

    const rectTags = value.match(/@rect\([^\)]*\)/g) || []
    const circleTags = value.match(/@circle\([^\)]*\)/g) || []
    const invalidRect = rectTags.find(t => !isValidRectTag(t))
    const invalidCircle = circleTags.find(t => !isValidCircleTag(t))
    if (invalidRect) msg = `坐标标签格式错误：${invalidRect}，应为 @rect(x,y,w,h)`
    else if (invalidCircle) msg = `坐标标签格式错误：${invalidCircle}，应为 @circle(cx,cy,r)`
    setValidationMsg(msg)
    
    // 检测 @ 触发智能选择
    const textBefore = value.slice(0, pos)
    const lastAt = textBefore.lastIndexOf('@')
    
    if (lastAt !== -1) {
      const afterSymbol = textBefore.slice(lastAt + 1)
      // 如果符号后没有空格，显示提示
      if (!/\s/.test(afterSymbol)) {
        setShowSuggestions(true)
        return
      }
    }
    setShowSuggestions(false)
  }

  const insertReference = (ref: string, type: 'material' | 'color') => {
    if (!textareaRef.current) return
    const value = prompt || ''
    const pos = cursorPosition
    const textBefore = value.slice(0, pos)
    const textAfter = value.slice(pos)
    
    // 找到最后一个 @
    const lastAt = textBefore.lastIndexOf('@')
    const newValue = value.slice(0, lastAt) + `@${ref}` + ' ' + textAfter
    setPrompt(newValue)
    setShowSuggestions(false)
    
    // 聚焦回输入框
    setTimeout(() => {
      textareaRef.current?.focus()
      const newPos = lastAt + ref.length + 2
      textareaRef.current?.setSelectionRange(newPos, newPos)
    }, 0)
  }

  

  // 将坐标标签插入到当前光标位置或最后一个 @ 的位置
  const insertCoordTag = (tag: string) => {
    if (!textareaRef.current) return
    const value = prompt || ''
    const pos = cursorPosition
    const textBefore = value.slice(0, pos)
    const textAfter = value.slice(pos)
    const lastAt = textBefore.lastIndexOf('@')
    const insertPos = lastAt !== -1 ? lastAt : pos
    const newValue = value.slice(0, insertPos) + tag + ' ' + textAfter
    setPrompt(newValue)
    setShowSuggestions(false)
    setTimeout(() => {
      textareaRef.current?.focus()
      const newPos = insertPos + tag.length + 1
      textareaRef.current?.setSelectionRange(newPos, newPos)
    }, 0)
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">效果描述与模型选择</div>
      </div>
      <div className="card-body" style={{ display: 'grid', gap: 12 }}>
        {/* ✅ 提示词辅助说明 */}
        <div style={{ 
          padding: '12px', 
          background: '#eff6ff', 
          border: '1px solid #bfdbfe', 
          borderRadius: 6,
          fontSize: 13,
          lineHeight: 1.6
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: '#1e40af' }}>
            💡 提示词编写建议：
          </div>
          <div style={{ color: '#1e40af' }}>
            <div>• <strong>明确目标</strong>：说明想要什么效果（如：改为卡通风格、添加蓝天白云）</div>
            <div>• <strong>使用坐标标注</strong>：用 @rect(x,y,w,h) 或形状标签标注局部区域</div>
            <div>• <strong>引用参考</strong>：用 @文件名 引用参考图风格（如：参考@sunset的色调）</div>
            <div>• <strong>细节描述</strong>：说明光照、色彩、纹理等细节要求</div>
          </div>
        </div>
        
        <label style={{ display: 'grid', gap: 6, position: 'relative' }}>
          <span>效果描述（必填）</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#666' }}>可用标注类型：</span>
            <span className="id-badge">矩形</span>
            <span className="id-badge">圆形</span>
            <span className="id-badge">画笔</span>
          </div>
          <textarea 
            ref={textareaRef}
            className="input" 
            rows={4} 
            maxLength={2000} 
            value={prompt || ''} 
            onChange={handlePromptChange}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="例如：保持构图，改为卡通风格。使用 @ 选择素材或标注坐标" 
          />
          <span style={{ fontSize: 12, color: '#9ca3af' }}>{prompt?.length || 0}/2000 字符 | 提示：输入 @ 选择素材或标注坐标</span>
          {validationMsg && (
            <span style={{ fontSize: 12, color: '#ef4444' }}>{validationMsg}</span>
          )}
          
          {/* ✅ 提示词模板快捷选项 */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
            <span style={{ fontSize: 12, color: '#666' }}>快捷模板：</span>
            {[
              { label: '风格转换', text: '保持原始构图和内容，改为卡通风格，色彩明亮，线条清晰' },
              { label: '场景更换', text: '保持主体不变，将背景改为蓝天白云的户外场景，光照自然' },
              { label: '局部修改', text: '在 @rect(100,120,300,240) 区域替换为绿色草地，纹理真实，与周围环境自然融合' },
              { label: '质感提升', text: '提高画面质感，增强细节和清晰度，保持自然光照和色彩' },
            ].map((template, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPrompt(template.text)}
                style={{
                  padding: '4px 8px',
                  fontSize: 11,
                  background: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: 4,
                  cursor: 'pointer',
                  color: '#374151'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#e5e7eb'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#f3f4f6'}
              >
                {template.label}
              </button>
            ))}
          </div>
          
          {/* 智能选择面板 */}
          {showSuggestions && (materials.length > 0 || (mask.elements && mask.elements.length > 0)) && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: 4,
              background: '#fff',
              border: '1px solid #e5e5e5',
              borderRadius: 8,
              padding: 8,
              maxHeight: 200,
              overflow: 'auto',
              zIndex: 1000,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}>
              {materials.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 4, fontWeight: 600 }}>🖼️ 参考素材 (使用 @)</div>
                  {materials.map(m => (
                    <div 
                      key={m.id}
                      onClick={() => insertReference(m.id, 'material')}
                      style={{
                        padding: '6px 8px',
                        cursor: 'pointer',
                        borderRadius: 4,
                        fontSize: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* ✅ 缩略图预览 */}
                      <img 
                        src={m.url} 
                        alt={m.id}
                        style={{
                          width: 24,
                          height: 24,
                          objectFit: 'cover',
                          borderRadius: 2,
                          border: '1px solid #e5e5e5'
                        }}
                      />
                      <span className="id-badge">{m.id}</span>
                      <span style={{ color: '#666' }}>素材</span>
                      {/* ✅ 同步状态指示：如果提示词中已包含该引用，显示对勾 */}
                      {prompt?.includes(`@${m.id}`) && (
                        <span style={{ marginLeft: 'auto', color: '#10b981', fontSize: 12 }}>✓</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {mask.elements && mask.elements.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, color: '#666', margin: '8px 0 4px', fontWeight: 600 }}>📐 标注坐标 (使用 @)</div>
                  {mask.elements.map(el => {
                    const typeLabel = el.type === 'rectangle' ? '矩形' : el.type === 'circle' ? '圆形' : '画笔'
                    const tag = (() => {
                      if (el.type === 'rectangle' || el.type === 'brush') {
                        const { x, y, w, h } = elementRect(el.points)
                        return `@rect(${x},${y},${w},${h})`
                      } else if (el.type === 'circle') {
                        const { cx, cy, r } = elementCircle(el.points)
                        return `@circle(${cx},${cy},${r})`
                      }
                      return ''
                    })()
                    return (
                      <div 
                        key={el.id}
                        onClick={() => insertCoordTag(tag)}
                        style={{
                          padding: '6px 8px',
                          cursor: 'pointer',
                          borderRadius: 4,
                          fontSize: 12,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <span className="id-badge">{el.name || typeLabel}</span>
                        <span style={{ color: '#666' }}>{typeLabel}</span>
                        <span style={{ marginLeft: 'auto', color: '#374151' }}>{tag}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>可引用素材编号（在提示词中使用）</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {materials.map(m => (
              <span key={m.id} className="id-badge">{m.id}</span>
            ))}
            {materials.length === 0 && <span style={{ color: '#9ca3af' }}>无素材</span>}
          </div>
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>输出尺寸</span>
          
          {/* ✅ 预设比例选择器 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select 
              className="input" 
              style={{ flex: 1 }}
              onChange={(e) => {
                const value = e.target.value
                if (value === 'custom') return
                
                // 解析比例
                const [w, h] = value.split(':').map(Number)
                const ratio = w / h
                
                // ✅ 默认宽度 3840，按比例计算高度
                const newWidth = 3840
                const newHeight = Math.round(newWidth / ratio)
                setWidth(newWidth)
                setHeight(newHeight)
              }}
            >
              <option value="custom">自定义比例</option>
              <option value="16:9">16:9 横屏 (推荐)</option>
              <option value="9:16">9:16 竖屏</option>
              <option value="1:1">1:1 正方形</option>
              <option value="4:3">4:3 传统横屏</option>
              <option value="3:4">3:4 传统竖屏</option>
              <option value="21:9">21:9 超宽屏</option>
              <option value="2:3">2:3 竖向海报</option>
            </select>
            <button 
              className="button" 
              type="button" 
              onClick={() => { 
                // ✅ 上传图片后自动计算比例
                if (baseMeta) {
                  const ratio = baseMeta.width / baseMeta.height
                  // 限制最大边为 3840
                  let newWidth = baseMeta.width
                  let newHeight = baseMeta.height
                  
                  if (newWidth > 3840 || newHeight > 3840) {
                    if (ratio >= 1) {
                      // 横图或正方形
                      newWidth = 3840
                      newHeight = Math.round(3840 / ratio)
                    } else {
                      // 竖图
                      newHeight = 3840
                      newWidth = Math.round(3840 * ratio)
                    }
                  }
                  
                  setWidth(newWidth)
                  setHeight(newHeight)
                } else {
                  setWidth(3840)
                  setHeight(2160)
                }
              }}
              disabled={!baseMeta}
            >
              匹配主图比例
            </button>
            <button 
              className="button" 
              type="button" 
              onClick={() => { 
                // ✅ 同比生成4K图：最长边设为3840
                if (baseMeta) {
                  const ratio = baseMeta.width / baseMeta.height
                  let newWidth: number
                  let newHeight: number
                  
                  if (ratio >= 1) {
                    // 横图或正方形：宽度为3840
                    newWidth = 3840
                    newHeight = Math.round(3840 / ratio)
                  } else {
                    // 竖图：高度为3840
                    newHeight = 3840
                    newWidth = Math.round(3840 * ratio)
                  }
                  
                  setWidth(newWidth)
                  setHeight(newHeight)
                  console.log(`[同比生成4K] 原始: ${baseMeta.width}x${baseMeta.height}, 输出: ${newWidth}x${newHeight}, 比例: ${ratio.toFixed(2)}`)
                } else {
                  alert('请先上传主图')
                }
              }}
              disabled={!baseMeta}
              style={{ background: '#8b5cf6' }}
            >
              同比生成4K图
            </button>
          </div>
          
          {/* ✅ 自定义宽高输入 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: '#666', minWidth: 60 }}>宽度：</label>
            <input 
              className="input" 
              type="number" 
              min={256} 
              max={3840}
              step={1} 
              value={width} 
              onChange={(e) => { 
                const v = Math.max(256, Math.min(3840, Number(e.target.value) || 0))
                setWidth(v)
              }} 
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 12, color: '#666' }}>px</span>
          </div>
          
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: '#666', minWidth: 60 }}>高度：</label>
            <input 
              className="input" 
              type="number" 
              min={256} 
              max={3840}
              step={1} 
              value={height} 
              onChange={(e) => { 
                const v = Math.max(256, Math.min(3840, Number(e.target.value) || 0))
                setHeight(v)
              }} 
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 12, color: '#666' }}>px</span>
          </div>
          
          {/* ✅ 主图尺寸信息显示 */}
          {baseMeta && (
            <div style={{ 
              fontSize: 12, 
              color: '#6b7280', 
              padding: '8px 12px', 
              background: '#f9fafb', 
              borderRadius: 6,
              border: '1px solid #e5e7eb'
            }}>
              <span>🖼️ 主图尺寸：{baseMeta.width} × {baseMeta.height} px</span>
              <span style={{ marginLeft: 16 }}>
                📏 宽高比：{(baseMeta.width / baseMeta.height).toFixed(2)}:1
              </span>
            </div>
          )}
          
          <div style={{ fontSize: 12, color: '#9ca3af' }}>
            当前输出：{outputResolution} {baseMeta && `(主图：${baseMeta.width}x${baseMeta.height})`}
          </div>
        </label>
      </div>
    </div>
  )
}

export default PromptAndModelCard
