import { useEffect } from 'react'

interface Props {
  message: string
  onUndo: () => void
  onDismiss: () => void
}

const TIMEOUT_MS = 5000

export function UndoToast({ message, onUndo, onDismiss }: Props) {
  useEffect(() => {
    const t = setTimeout(onDismiss, TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [message, onDismiss])

  return (
    <div className="toast" role="status">
      <span className="toast-message">{message}</span>
      <button className="toast-action" onClick={onUndo}>
        Undo
      </button>
    </div>
  )
}
