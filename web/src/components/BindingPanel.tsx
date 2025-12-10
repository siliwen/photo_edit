import React, { useMemo, useState } from 'react'
import { useAppStore } from '../store'

const BindingPanel: React.FC = () => {
  const addTask = useAppStore(s => s.addTask)
  const baseImage = useAppStore(s => s.baseImage)
  const updateTask = useAppStore(s => s.updateTask)
  const baseMeta = useAppStore(s => s.baseMeta)
  const outputResolution = useAppStore(s => s.outputResolution)
  const setOutputResolution = useAppStore(s => s.setOutputResolution)
  const parseRes = (res: string) => { const [w, h] = res.split('x').map(Number); return { w: w || 3840, h: h || 2160 } }
  const [width, setWidth] = useState<number>(parseRes(outputResolution).w)
  const height = useMemo(() => {
    const r = baseMeta ? baseMeta.width / baseMeta.height : (parseRes(outputResolution).w / parseRes(outputResolution).h)
    return Math.round(width / r)
  }, [width, baseMeta])
  const materials = useAppStore(s => s.materials)
  const mask = useAppStore(s => s.mask)  // ✅ 单一蒙版

  const submitTask = () => {
    const id = `job_${Date.now()}`
    addTask({ id, title: `图像生成任务 ${outputResolution}`, status: 'PROCESSING', createdAt: Date.now() })
    const payload = {
      project_id: String(Date.now()),
      base_image: baseImage,
      reference_assets: materials.map(a => ({ id: a.id, image: a.url, preprocess: a.preprocess })),
      // mask_regions: masks.map(m => ({ mask_data: m.maskData, action: m.action, reference_link: m.referenceLink ?? null, control_mode: m.controlMode, strength: m.strength, prompt_suffix: m.promptSuffix })),
      global_params: { output_resolution: outputResolution, seed: 42 },
    }
    console.log('submit payload', payload)
    setTimeout(() => {
      updateTask(id, { status: 'COMPLETE', resultUrl: baseImage })
      alert('任务完成')
    }, 3000)
  }
  return (
    <div>
      <div className="panel-header">属性与绑定</div>
      <div className="panel-body">
        <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>控制模式</span>
            <select className="input">
              <option value="content">Content（内容迁移）</option>
              <option value="style">Style（风格迁移）</option>
              <option value="structure">Structure（结构迁移）</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>强度</span>
            <input className="input" type="range" min={0} max={1} step={0.05} defaultValue={0.8} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>输出宽度（按底图比例自动计算高度）</span>
            <input className="input" type="number" min={256} step={1} value={width} onChange={(e) => { const v = Math.max(256, Number(e.target.value) || 0); setWidth(v); setOutputResolution(`${v}x${height}`) }} />
            <div style={{ fontSize: 12, color: '#9ca3af' }}>高度将自动设为：{height}，当前输出：{outputResolution}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="button" type="button" onClick={() => { const r = baseMeta ? (baseMeta.width / baseMeta.height) : (16/9); const h = Math.round(3840 / r); setWidth(3840); setOutputResolution(`3840x${h}`) }}>默认4K</button>
            </div>
          </label>
          <button className="button" onClick={submitTask}>提交生成任务</button>
        </div>
      </div>
    </div>
  )
}

export default BindingPanel
