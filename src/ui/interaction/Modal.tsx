import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Modal shell for interactions and detail dialogs. While open the app root is `inert`, Tab cycles inside the panel,
 * and on close focus goes back to whatever opened it.
 */
export default function Modal({ title, onClose, canClose = true, className, children }: { title: string; onClose: () => void; canClose?: boolean; className?: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const close = useRef({ onClose, canClose })
  close.current = { onClose, canClose }

  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const p = panel.current
    ;(p?.querySelector<HTMLElement>('[data-autofocus]') ?? p)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (!p) return
      if (e.key === 'Escape') {
        e.preventDefault()
        if (close.current.canClose) close.current.onClose()
        return
      }
      if (e.key !== 'Tab') return
      const items = [...p.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (!items.length) {
        e.preventDefault()
        p.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const at = document.activeElement
      if (!p.contains(at) || at === p) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      } else if (e.shiftKey && at === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && at === last) {
        e.preventDefault()
        first.focus()
      }
    }
    // A button that disables itself (submit) drops focus to <body>; pull it back into the panel.
    const onFocusOut = (e: FocusEvent) => {
      if (p && !e.relatedTarget) requestAnimationFrame(() => document.activeElement === document.body && p.focus())
    }
    document.addEventListener('keydown', onKey)
    p?.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('keydown', onKey)
      p?.removeEventListener('focusout', onFocusOut)
      root?.removeAttribute('inert')
      document.body.style.overflow = overflow
      trigger?.focus()
    }
  }, [])

  return createPortal(
    <div className="ix-backdrop">
      <div className={className ? `ix-panel ${className}` : 'ix-panel'} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={panel}>
        <header className="ix-head">
          <h2 id={titleId}>{title}</h2>
          <button className="btn ghost ix-close" onClick={onClose} disabled={!canClose} aria-label="关闭">
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  )
}
