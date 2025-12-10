/**
 * 重新生成任务的工具函数
 */

export const resubmitTask = async (
  originalTaskId: string,
  payload: any,
  addTask: (task: any) => void,
  updateTask: (id: string, partial: any) => void
) => {
  const id = `job_${Date.now()}_retry`
  
  console.log('[==== 重新生成任务 ====]')
  console.log('[原任务ID]', originalTaskId)
  console.log('[复用参数]', JSON.stringify(payload, null, 2))
  
  // 添加新任务到列表
  addTask({ 
    id, 
    title: `重新生成（${payload.resolution}）`, 
    status: 'PROCESSING', 
    createdAt: Date.now(),
    payload: payload
  })
  
  try {
    const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:3001'
    const res = await fetch(`${API_BASE}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    }
    
    const responseData = await res.json()
    console.log('[重新生成] 服务器响应:', responseData)
    
    const { taskId } = responseData
    
    // 轮询任务状态（5秒间隔，最多60次）
    let pollCount = 0
    const maxPolls = 60
    const pollInterval = 5000
    
    console.log(`[轮询开始] 任务ID: ${taskId}`)
    
    const pollTask = setInterval(async () => {
      pollCount++
      console.log(`[轮询 ${pollCount}/${maxPolls}]`)
      
      try {
        const statusRes = await fetch(`${API_BASE}/api/task/${taskId}`)
        const task = await statusRes.json()
        
        console.log(`[轮询 ${pollCount}] 状态: ${task.status}`)
        
        if (task.status === 'COMPLETE') {
          clearInterval(pollTask)
          console.log('[✅ 重新生成完成]', task)
          updateTask(id, { status: 'COMPLETE', resultUrl: task.result })
          alert('重新生成完成！')
        } else if (task.status === 'FAILED') {
          clearInterval(pollTask)
          console.error('[❌ 重新生成失败]', task)
          updateTask(id, { status: 'FAILED' })
          alert(`重新生成失败：${task.error || '未知错误'}`)
        } else if (pollCount >= maxPolls) {
          clearInterval(pollTask)
          console.warn('[⏱️ 轮询超时]')
          updateTask(id, { status: 'FAILED' })
          alert('重新生成超时')
        }
      } catch (pollError) {
        console.error(`[轮询 ${pollCount}] 错误:`, pollError)
      }
    }, pollInterval)
  } catch (err) {
    console.error('[重新生成错误]', err)
    updateTask(id, { status: 'FAILED' })
    alert(`重新生成失败：${err}`)
  }
}
