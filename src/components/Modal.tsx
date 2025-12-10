import React from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}

const Modal: React.FC<ModalProps> = ({ open, onClose, children }) => {
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 1000 }}>
      <div style={{ background: '#171923', border: '1px solid #2d3340', borderRadius: 10, width: '80vw', height: '80vh', overflow: 'auto' }}>
        <div style={{ padding: 10, borderBottom: '1px solid #2d3340', display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 600 }}>任务结果预览</div>
          <button className="button" onClick={onClose}>关闭</button>
        </div>
        <div style={{ padding: 12 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

export default Modal
