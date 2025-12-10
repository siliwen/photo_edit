import React from 'react'
import { useAppStore } from '../../store'

// ✅ 重构后的单一蒙版信息显示
const MaskBindingCard: React.FC = () => {
  const mask = useAppStore(s => s.mask)
  const materials = useAppStore(s => s.materials)

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">标注对象</div>
      </div>
      <div className="card-body">
        {mask.elements.length === 0 && (
          <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af' }}>
            请在主图上添加标注对象
          </div>
        )}
        {mask.elements.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            {mask.elements.map(el => {
              const typeLabel = el.type === 'rectangle' ? '矩形' : el.type === 'circle' ? '圆形' : '画笔'
              return (
                <div key={el.id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #e5e5e5', borderRadius: 8, padding: '6px 8px' }}>
                  <span className="id-badge">{el.name || typeLabel}</span>
                  <span style={{ color: '#666' }}>{typeLabel}</span>
                  <span style={{ marginLeft: 'auto' }} />
                  <button
                    className="button"
                    style={{ background: '#ef4444', color: '#fff' }}
                    onClick={() => {
                      if (confirm(`删除 ${el.name || typeLabel} ?`)) {
                        const s = useAppStore.getState()
                        const newEls = s.mask.elements.filter(e => e.id !== el.id)
                        s.clearMask()
                        newEls.forEach(ne => s.addMaskElement(ne))
                      }
                    }}
                  >🗑️</button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default MaskBindingCard
