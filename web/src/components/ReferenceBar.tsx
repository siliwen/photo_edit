import React, { useRef, useState } from 'react'
import { useAppStore } from '../store'

const ReferenceBar: React.FC = () => {
  const fileRef = useRef<HTMLInputElement>(null)
  const setBaseImage = useAppStore(s => s.setBaseImage)
  const [assets, setAssets] = useState<Array<{ id: string; url: string; preprocess: 'none' | 'foreground_only' }>>([])

  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const next = Array.from(files).map((f, i) => ({
      id: `ref_${String(Date.now())}_${i}`,
      url: URL.createObjectURL(f),
      preprocess: 'none' as const,
    }))
    // 将第一张设置为当前编辑底图
    if (next[0]) setBaseImage(next[0].url)
  }

  return (
    <div>
      <div className="panel-header">编辑器与上传</div>
      <div className="panel-body">
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="button" onClick={() => fileRef.current?.click()}>上传底图（当前图片）</button>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onSelect} />
        </div>
        <div style={{ marginTop: 12, color: '#9ca3af' }}>选择图片后立即作为当前底图显示，可继续在右侧创建任务处理。</div>
      </div>
    </div>
  )
}

export default ReferenceBar
