import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore, Task } from '../store'
import Modal from './Modal'
import { resubmitTask } from '../utils/resubmitTask'

const statusColor: Record<string, string> = {
  PENDING: '#9ca3af',
  PROCESSING: '#f59e0b',
  COMPLETE: '#10b981',
  FAILED: '#ef4444',
}

const TaskList: React.FC = () => {
  const tasks = useAppStore(s => s.tasks)
  const addTask = useAppStore(s => s.addTask)
  const updateTask = useAppStore(s => s.updateTask)
  const [preview, setPreview] = useState<{ open: boolean; task?: Task }>({ open: false })
  const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:3001'
  const socketsRef = useRef<Record<string, WebSocket>>({})

  const sorted = useMemo(() => tasks.sort((a, b) => b.createdAt - a.createdAt), [tasks])

  // 处理重新生成
  const handleResubmit = (task: Task) => {
    if (!task.payload) {
      alert('该任务无法重新生成，缺少原始参数')
      return
    }
    resubmitTask(task.id, task.payload, addTask, updateTask)
  }

  // 实时状态更新：为未完成任务建立 WS 订阅
  useEffect(() => {
    sorted.forEach(t => {
      const terminal = t.status === 'COMPLETE' || t.status === 'FAILED'
      if (terminal) {
        if (socketsRef.current[t.id]) {
          try { socketsRef.current[t.id].close() } catch {}
          delete socketsRef.current[t.id]
        }
        return
      }
      if (!socketsRef.current[t.id]) {
        try {
          const wsUrl = API_BASE.replace('http', 'ws') + '/ws'
          const ws = new WebSocket(wsUrl)
          socketsRef.current[t.id] = ws
          ws.onopen = () => ws.send(JSON.stringify({ taskId: t.id }))
          ws.onmessage = (ev) => {
            try {
              const msg = JSON.parse(ev.data)
              if (msg?.taskId === t.id) {
                updateTask(t.id, { status: msg.status, resultUrl: msg.result || undefined })
              }
            } catch {}
          }
          ws.onerror = () => { try { ws.close() } catch {} }
        } catch {}
      }
    })
    return () => {
      Object.values(socketsRef.current).forEach(ws => { try { (ws as WebSocket).close() } catch {} })
      socketsRef.current = {}
    }
  }, [sorted])

  return (
    <div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <div className="panel-header">任务列表</div>
      <div className="panel-body">
        <div className="list">
          {sorted.length === 0 && <div style={{ color: '#9ca3af' }}>暂无任务</div>}
          {sorted.map(t => (
            <div key={t.id} className="task-item" style={{ 
              display: 'flex', 
              gap: 12, 
              alignItems: 'center',
              padding: 12,
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              marginBottom: 8
            }}>
              {/* 缩略图 */}
              <div style={{ 
                width: 60, 
                height: 60, 
                borderRadius: 6, 
                overflow: 'hidden', 
                flexShrink: 0,
                background: '#f3f4f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {t.resultUrl ? (
                  <img 
                    src={t.resultUrl} 
                    alt="预览" 
                    style={{ 
                      width: '100%', 
                      height: '100%', 
                      objectFit: 'cover',
                      cursor: 'pointer'
                    }} 
                    onClick={() => setPreview({ open: true, task: t })}
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    {t.status === 'PROCESSING' ? (
                      <>
                        <div style={{ width: 24, height: 24, border: '3px solid #e5e7eb', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                        <div style={{ fontSize: 12, color: '#9ca3af' }}>生成中...</div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>暂无结果</div>
                    )}
                  </div>
                )}
              </div>
              
              {/* 任务信息 */}
              <div style={{ flex: 1, display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>
                  {new Date(t.createdAt).toLocaleTimeString()}
                </span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</span>
                <span style={{ fontSize: 12, color: statusColor[t.status] }}>
                  {t.status === 'PROCESSING' ? '生成中' : t.status === 'COMPLETE' ? '已完成' : t.status === 'FAILED' ? '失败' : '待处理'}
                </span>
              </div>
              
              {/* 操作按钮 */}
              <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                {t.status === 'COMPLETE' && t.resultUrl && (
                  <button 
                    className="button" 
                    style={{ 
                      padding: '6px 12px',
                      fontSize: 12,
                      background: '#7c3aed',
                      color: 'white',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer'
                    }}
                    onClick={() => setPreview({ open: true, task: t })}
                  >
                    查看大图
                  </button>
                )}
                {(t.status === 'FAILED' || t.status === 'COMPLETE') && t.payload && (
                  <button 
                    className="button-secondary" 
                    style={{ 
                      padding: '6px 12px',
                      fontSize: 12,
                      background: '#f3f4f6',
                      color: '#374151',
                      border: '1px solid #d1d5db',
                      borderRadius: 6,
                      cursor: 'pointer'
                    }}
                    onClick={() => handleResubmit(t)}
                  >
                    重新生成
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <Modal open={preview.open} onClose={() => setPreview({ open: false })}>
        {preview.task?.resultUrl ? (
          <img src={preview.task.resultUrl} style={{ maxWidth: '100%', height: 'auto', borderRadius: 8 }} />
        ) : (
          <div style={{ color: '#9ca3af' }}>暂无预览</div>
        )}
      </Modal>
    </div>
  )
}

export default TaskList
