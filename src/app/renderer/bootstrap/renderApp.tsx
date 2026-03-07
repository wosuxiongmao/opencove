import React from 'react'
import ReactDOM from 'react-dom/client'
import AppShell from '../shell/AppShell'
import '../../../renderer/src/styles.css'

export function renderApp(): void {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <AppShell />
    </React.StrictMode>,
  )
}
