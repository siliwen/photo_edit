import React from 'react'
import { useAppStore } from '../../store'
import { uploadDataURL } from '../../utils/upload'

const SubmitBar: React.FC = () => {
  const addTask = useAppStore(s => s.addTask)
  const updateTask = useAppStore(s => s.updateTask)
  const baseImage = useAppStore(s => s.baseImage)
  const baseMeta = useAppStore(s => s.baseMeta)
  const materials = useAppStore(s => s.materials)
  const outputResolution = useAppStore(s => s.outputResolution)
  const prompt = useAppStore(s => s.prompt)
  const model = useAppStore(s => s.model)
  const mask = useAppStore(s => s.mask)

  const submit = async () => {
    const id = `job_${Date.now()}`
    const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:3001'
    
    try {
      let processedPrompt = prompt || ''
      
      // ✅ 提取元素颜色信息用于提示词（虽然我们已经转为坐标，但保留此数据可能对调试有用，或者后端仍需 reference）
      // 但为了确保"generated images completely free of mask color data"，我们不应发送 mask_elements 吗？
      // 后端逻辑中，如果 mask_url 为空，但 mask_elements 存在，会怎样？
      // 后端 check: if (payload.mask_elements && payload.mask_elements.length > 0) -> 生成 "蒙版中的Color区域..."
      // 如果我们已经把 prompt 中的 @Color 换成了 @rect，那么后端就找不到 @Color 了。
      // 所以后端的 "蒙版颜色引用" 处理 (Step 2) 将不会匹配到任何东西。
      // 这样是安全的。
      
      // 将标注元素转换为坐标标签并追加到提示词
      const elements = (mask?.elements || [])
      const toRect = (pts: Array<{ x: number; y: number }>) => {
        const xs = pts.map(p => p.x)
        const ys = pts.map(p => p.y)
        const minX = Math.round(Math.min(...xs))
        const minY = Math.round(Math.min(...ys))
        const maxX = Math.round(Math.max(...xs))
        const maxY = Math.round(Math.max(...ys))
        const w = Math.max(1, maxX - minX)
        const h = Math.max(1, maxY - minY)
        return `@rect(${minX},${minY},${w},${h})`
      }
      const toCircle = (pts: Array<{ x: number; y: number }>) => {
        const p1 = pts[0]
        const p2 = pts[pts.length - 1]
        const cx = Math.round(p1.x)
        const cy = Math.round(p1.y)
        const r = Math.max(1, Math.round(Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2))))
        return `@circle(${cx},${cy},${r})`
      }
      if (elements.length > 0) {
        const coordTags = elements.map(el => {
          if (el.type === 'circle') return toCircle(el.points)
          return toRect(el.points)
        })
        processedPrompt = `${processedPrompt}\n${coordTags.join(' ')}`
      }

      const payload = {
        project_id: String(Date.now()),
        base_image: baseImage,
        reference_assets: materials.map(a => ({ id: a.id, url: a.url, preprocess: a.preprocess })),
        global_params: { output_resolution: outputResolution, seed: 42, model },
        prompt: processedPrompt, // ✅ 使用转换后的提示词
      }
      
      console.log('[==== 提交请求 ====]')
      console.log('[请求负载] payload:', JSON.stringify(payload, null, 2))
      console.log('[请求参数]')
      console.log('  - 输出分辨率:', outputResolution)
      console.log('  - 主图 URL:', baseImage)
      console.log('  - 标注坐标来源: 元素数量', elements.length)
      console.log('  - 提示词:', prompt)
      console.log('[==== 请求提交中 ====]')
      
      // ✅ 添加任务到列表，并保存payload用于重新生成
      addTask({ 
        id, 
        title: `生成任务（${outputResolution}）`, 
        status: 'PROCESSING', 
        createdAt: Date.now(),
        payload: payload  // 保存完整参数
      })
      
      const res = await fetch(`${API_BASE}/api/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }
      
      const responseData = await res.json()
      console.log('[==== 服务器响应 ====]')
      console.log('[响应数据]', JSON.stringify(responseData, null, 2))
      console.log('[任务ID]', responseData.taskId)
      
      const { taskId } = responseData
      
      // ✅ 优化轮询：5秒间隔，最多60次（共5分钟）
      let pollCount = 0
      const maxPolls = 60
      const pollInterval = 5000  // 5秒
      let pollTask: number | null = null
      const stopAll = () => {
        if (pollTask) {
          clearInterval(pollTask)
          pollTask = null
        }
      }
      
      console.log(`[轮询开始] 任务ID: ${taskId}, 间隔: ${pollInterval}ms, 最大次数: ${maxPolls}`)
      
      // ✅ WebSocket 优先：实时接收服务端进度
      let wsConnected = false
      try {
        const wsUrl = API_BASE.replace('http', 'ws') + '/ws'
        const ws = new WebSocket(wsUrl)
        ws.onopen = () => {
          wsConnected = true
          ws.send(JSON.stringify({ taskId }))
        }
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data)
            if (msg?.taskId === taskId) {
              if (msg.status === 'COMPLETE') {
                updateTask(id, { status: 'COMPLETE', resultUrl: msg.result })
                stopAll()
                ws.close()
              } else if (msg.status === 'FAILED') {
                updateTask(id, { status: 'FAILED' })
                stopAll()
                ws.close()
              } else {
                updateTask(id, { status: msg.status })
              }
            }
          } catch {}
        }
        ws.onerror = () => {
          wsConnected = false
          try { ws.close() } catch {}
        }
        ws.onclose = () => {
          wsConnected = false
        }
      } catch {
        wsConnected = false
      }

      // ✅ 轮询降级：WS 不可用时按固定间隔查询
      pollTask = setInterval(async () => {
        pollCount++
        console.log(`[轮询 ${pollCount}/${maxPolls}] 查询任务状态...`)
        
        try {
          if (wsConnected) return
          const statusRes = await fetch(`${API_BASE}/api/task/${taskId}`)
          const task = await statusRes.json()
          
          console.log(`[轮询 ${pollCount}] 状态: ${task.status}`, task)
          
          if (task.status === 'COMPLETE') {
            stopAll()
            console.log('[✅ 任务完成]', task)
            updateTask(id, { status: 'COMPLETE', resultUrl: task.result })
            alert('任务完成！')
          } else if (task.status === 'FAILED') {
            stopAll()
            console.error('[❌ 任务失败]', task)
            updateTask(id, { status: 'FAILED' })
            alert(`任务失败：${task.error || '未知错误'}`)
          } else if (pollCount >= maxPolls) {
            stopAll()
            console.warn('[⏱️ 轮询超时] 已达最大轮询次数')
            updateTask(id, { status: 'FAILED' })
            alert('任务超时，请稍后查看或重新提交')
          }
        } catch (pollError) {
          console.error(`[轮询 ${pollCount}] 错误:`, pollError)
          // 继续轮询，不因单次错误而终止
        }
      }, pollInterval)
    } catch (err) {
      console.error('Submit error:', err)
      updateTask(id, { status: 'FAILED' })
      alert('提交失败: ' + (err as Error).message)
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <button className="button" onClick={submit} disabled={!baseImage || !prompt}>提交生成</button>
    </div>
  )
}

export default SubmitBar
