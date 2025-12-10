import React from 'react'
import BaseImageCard from './cards/BaseImageCard_New'
import ReferenceImagesCard from './cards/ReferenceImagesCard'
import PromptAndModelCard from './cards/PromptAndModelCard'
import ActionBar from './cards/SubmitBar'

const SystemPanel: React.FC = () => {
  return (
    <div className="system-panel">
      <div className="cards-grid">
        <BaseImageCard />
        <ReferenceImagesCard />
      </div>
      <PromptAndModelCard />
      <ActionBar />
    </div>
  )
}

export default SystemPanel
