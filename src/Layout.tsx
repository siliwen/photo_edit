import React from 'react'
import TaskList from './components/TaskList'
import SystemPanel from './components/SystemPanel'

function Layout() {
  return (
    <div className="app">
      <main className="center">
        <SystemPanel />
      </main>
      <aside className="right">
        <TaskList />
      </aside>
    </div>
  )
}

export default Layout
