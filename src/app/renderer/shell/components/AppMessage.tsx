import React from 'react'
import type { WorkspaceCanvasMessageTone } from '@contexts/workspace/presentation/renderer/components/workspaceCanvas/types'

const APP_MESSAGE_LABEL: Record<WorkspaceCanvasMessageTone, string> = {
  info: 'Info',
  warning: 'Warning',
  error: 'Error',
}

export function AppMessage({
  tone,
  text,
}: {
  tone: WorkspaceCanvasMessageTone
  text: string
}): React.JSX.Element {
  return (
    <div
      className={`app-message app-message--${tone}`}
      data-testid="app-message"
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      <span className="app-message__label">{APP_MESSAGE_LABEL[tone]}</span>
      <span className="app-message__text">{text}</span>
    </div>
  )
}
