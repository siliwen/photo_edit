import React from 'react'
import ReferenceBar from './components/ReferenceBar'
import MainCanvas from './components/MainCanvas'
import BindingPanel from './components/BindingPanel'

function App() {
  return (
    <div className="app">
      <aside className="left">
        <ReferenceBar />
      </aside>
      <main className="center">
        <MainCanvas />
      </main>
      <aside className="right">
        <BindingPanel />
      </aside>
    </div>
  )
}

export default App
