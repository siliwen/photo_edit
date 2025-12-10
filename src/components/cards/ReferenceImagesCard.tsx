import React, { useRef, useState } from 'react'
import { useAppStore } from '../../store'
import { uploadToOSS } from '../../utils/upload'

const ReferenceImagesCard: React.FC = () => {
  const addMaterials = useAppStore(s => s.addMaterials)
  const materials = useAppStore(s => s.materials)
  const removeMaterial = useAppStore(s => s.removeMaterial)
  const inputRef = useRef<HTMLInputElement>(null)
  const [hovered, setHovered] = useState<{ id: string; url: string } | null>(null)

  const onSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    
    try {
      // ✅ 批量上传，使用文件名+去重编号
      const nameCounter = new Map<string, number>()  // 记录文件名出现次数
      
      const uploadPromises = Array.from(files).map(async (f, i) => {
        const ossUrl = await uploadToOSS(f)
        console.log(`Material ${i} uploaded:`, ossUrl)
        
        // 提取文件名（去掉扩展名）
        const fileName = f.name.replace(/\.[^.]+$/, '')
        
        // 处理重名：如果重名则加编号
        const count = nameCounter.get(fileName) || 0
        nameCounter.set(fileName, count + 1)
        
        const displayName = count > 0 ? `${fileName}${count}` : fileName
        
        return {
          id: displayName,  // ✅ 使用文件名作为id
          url: ossUrl,
          preprocess: 'none' as const,
          index: i  // ✅ 保存索引用于提示词替换
        }
      })
      
      const assets = await Promise.all(uploadPromises)
      addMaterials(assets)
    } catch (error) {
      console.error('Upload failed:', error)
      alert('图片上传失败，请重试')
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">参考图片</div>
        <span className="tag optional">可选</span>
      </div>
      <div className="card-body">
        <button className="button" onClick={() => inputRef.current?.click()}>选择图片</button>
        <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onSelect} />
        <div className="list" style={{ marginTop: 12, position: 'relative' }}>
          {materials.map(m => (
            <div key={m.id} className="item" onMouseEnter={() => setHovered({ id: m.id, url: m.url })} onMouseLeave={() => setHovered(null)} style={{ position: 'relative' }}>
              <div className="thumb" style={{ backgroundImage: `url(${m.url})`, backgroundSize: 'cover' }} />
              <div style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className="id-badge">{m.id}</span>
                  <span>素材</span>
                </div>
                <button 
                  className="button"
                  onClick={(e) => { e.stopPropagation(); removeMaterial(m.id) }}
                  style={{ padding: '2px 8px', fontSize: 12, background: '#ef4444', color: '#fff' }}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
          {hovered && (
            <div className="preview-pop">
              <img src={hovered.url} style={{ maxWidth: 240, borderRadius: 8 }} />
              <div className="id-badge" style={{ marginTop: 6 }}>{hovered.id}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ReferenceImagesCard
