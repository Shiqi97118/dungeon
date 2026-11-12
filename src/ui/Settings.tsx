import { useState } from 'react'
import { AI_PRESETS, aiTest, type AiConfig } from '../net/customAi'

interface Props {
  config: AiConfig
  onChange: (c: AiConfig) => void
  onClose: () => void
  builtin: { available: boolean; enabled: boolean; onToggle: (v: boolean) => void }
}

export default function Settings({ config, onChange, onClose, builtin }: Props) {
  const [c, setC] = useState<AiConfig>(config)
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const save = () => {
    onChange(c)
    onClose()
  }

  const runTest = async () => {
    setTesting(true)
    setTest(null)
    try {
      const line = await aiTest({ ...c, enabled: true })
      setTest({ ok: true, text: line })
    } catch (e) {
      setTest({ ok: false, text: String((e as Error).message ?? e) })
    }
    setTesting(false)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-kicker">可选功能</div>
        <h3>AI 主持人</h3>
        <p className="dim">
          不配置也能完整游玩：所有场景、线索、检定和结局都由内置规则主持。
          接入一个兼容 OpenAI 格式的大模型后，你写下的<strong>任何自由行动</strong>都会由 AI 主持人按模组的主持规范即兴裁定与叙述。
        </p>
        <div className={`builtin-ai ${builtin.available ? 'ok' : ''}`}>
          <div className="builtin-ai-head">
            <b>内置 AI 主持人</b>
            <span className={`badge ${builtin.available ? 'on' : ''}`}>{builtin.available ? '服务器已配置' : '未配置'}</span>
          </div>
          <p className="dim small">
            {builtin.available
              ? '由服务器代为调用大模型，密钥只保存在服务器上，玩家无需填写任何东西。联机房间始终使用它。'
              : '应用的服务器还没有配置 OPENAI_API_KEY。发布者在 Cursor 的密钥设置里填入后即可启用；在那之前联机与单人都会使用离线规则主持。'}
          </p>
          {builtin.available && (
            <label className="toggle small">
              <input type="checkbox" checked={builtin.enabled} onChange={(e) => builtin.onToggle(e.target.checked)} />
              <span>单人模式也使用内置 AI 主持人</span>
            </label>
          )}
        </div>
        <label className="toggle">
          <input type="checkbox" checked={c.enabled} onChange={(e) => setC({ ...c, enabled: e.target.checked })} />
          <span>改用我自己的大模型密钥（仅单人模式，优先于内置主持人）</span>
        </label>
        <div className="field">
          <div className="field-label">服务商预设</div>
          <div className="seg-row wrap">
            {AI_PRESETS.map((p) => (
              <button key={p.name} className={`seg ${c.baseUrl === p.baseUrl ? 'on' : ''}`} onClick={() => setC({ ...c, baseUrl: p.baseUrl, model: p.model })}>{p.name}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <div className="field-label">接口地址（Base URL）</div>
          <input className="input" value={c.baseUrl} onChange={(e) => setC({ ...c, baseUrl: e.target.value })} placeholder="https://api.example.com/v1" />
        </div>
        <div className="field">
          <div className="field-label">模型</div>
          <input className="input" value={c.model} onChange={(e) => setC({ ...c, model: e.target.value })} />
        </div>
        <div className="field">
          <div className="field-label">API Key</div>
          <input className="input" type="password" value={c.apiKey} onChange={(e) => setC({ ...c, apiKey: e.target.value })} placeholder="sk-..." autoComplete="off" />
          <small className="dim">密钥只保存在你这台设备的浏览器里，由浏览器直接发送给你选择的服务商。</small>
        </div>
        {test && <div className={`test ${test.ok ? 'ok' : 'bad'}`}>{test.ok ? `连接成功：“${test.text}”` : test.text}</div>}
        <div className="row end">
          <button className="btn ghost" onClick={runTest} disabled={testing || !c.apiKey}>{testing ? '测试中…' : '测试连接'}</button>
          <button className="btn primary" onClick={save}>保存</button>
        </div>
      </div>
    </div>
  )
}
