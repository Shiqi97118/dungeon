import { useEffect, useRef, useState } from 'react'
import type { ChatMsg } from '../net/api'

export default function ChatDock({ chat, meId, onSend }: { chat: ChatMsg[]; meId: string; onSend: (text: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const lastId = chat[chat.length - 1]?.id ?? 0
  const [readId, setReadId] = useState(lastId)
  const end = useRef<HTMLDivElement>(null)
  const unread = open ? 0 : chat.filter((m) => m.id > readId && m.pid !== meId).length

  useEffect(() => {
    if (open) {
      setReadId(lastId)
      end.current?.scrollIntoView({ block: 'end' })
    }
  }, [open, lastId])

  const submit = async () => {
    const t = text.trim()
    if (!t || sending) return
    setSending(true)
    try {
      await onSend(t)
      setText('')
    } finally {
      setSending(false)
    }
  }

  const latest = chat.filter((m) => m.pid !== meId).slice(-1)[0]

  return (
    <div className={`chat-dock ${open ? 'open' : ''}`}>
      {open ? (
        <div className="chat-panel">
          <div className="chat-head">
            <b>桌边聊天</b><small>不会写进故事</small>
            <button className="icon-btn" onClick={() => setOpen(false)}>×</button>
          </div>
          <div className="chat-list">
            {chat.length === 0 && <div className="empty">还没有人说话。</div>}
            {chat.map((m) => (
              <div key={m.id} className={`chat-msg ${m.pid === meId ? 'me' : ''} ${m.pid ? '' : 'sys'}`}>
                {m.pid && <span className="chat-name">{m.name}</span>}
                <span className="chat-text">{m.text}</span>
              </div>
            ))}
            <div ref={end} />
          </div>
          <form className="chat-form" onSubmit={(e) => { e.preventDefault(); submit() }}>
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="和队友商量一下……" />
            <button className="btn primary small" disabled={!text.trim() || sending}>发送</button>
          </form>
        </div>
      ) : (
        <button className="chat-toggle" onClick={() => setOpen(true)}>
          <span className="chat-glyph">✎</span><span>聊天</span>
          {unread > 0 && <span className="chat-badge">{unread}</span>}
          {unread > 0 && latest && <span className="chat-peek">{latest.name}：{latest.text}</span>}
        </button>
      )}
    </div>
  )
}
