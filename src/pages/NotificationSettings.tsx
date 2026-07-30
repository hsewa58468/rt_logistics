import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

interface Warehouse {
  warehouse_id: string
  warehouse_name: string
}

interface HintMsg {
  id: number
  warehouse: string
  title: string
  content: string
  priority: 'normal' | 'high' | 'urgent'
  created_at: string
}

type FormState = {
  warehouse: string
  title: string
  content: string
  priority: 'normal' | 'high' | 'urgent'
}

const EMPTY_FORM: FormState = { warehouse: '', title: '', content: '', priority: 'normal' }

const PRIORITY_META = {
  normal: { label: '普通', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.3)' },
  high:   { label: '重要', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.35)' },
  urgent: { label: '緊急', color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.35)' },
}

export default function NotificationSettings() {
  const { isSuper } = useAuth()

  const [msgs, setMsgs] = useState<HintMsg[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)

  // modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<HintMsg | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [formErr, setFormErr] = useState('')

  // delete confirm
  const [deleteId, setDeleteId] = useState<number | null>(null)

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: wData }, { data: mData }] = await Promise.all([
      supabase.from('warehouses').select('warehouse_id, warehouse_name').order('warehouse_name'),
      supabase.from('hint_msg').select('*').order('created_at', { ascending: false }),
    ])
    setWarehouses(wData ?? [])
    setMsgs(mData ?? [])
    setLoading(false)
  }

  function openAdd() {
    setEditTarget(null)
    setForm({ ...EMPTY_FORM, warehouse: warehouses[0]?.warehouse_name ?? '' })
    setFormErr('')
    setModalOpen(true)
  }

  function openEdit(msg: HintMsg) {
    setEditTarget(msg)
    setForm({ warehouse: msg.warehouse, title: msg.title, content: msg.content, priority: msg.priority })
    setFormErr('')
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditTarget(null)
    setFormErr('')
  }

  async function handleSubmit() {
    if (!form.warehouse) { setFormErr('請選擇倉庫'); return }
    if (!form.title.trim()) { setFormErr('請填入標題'); return }
    if (!form.content.trim()) { setFormErr('請填入內容'); return }
    setSubmitting(true)
    setFormErr('')

    if (editTarget) {
      const { error } = await supabase
        .from('hint_msg')
        .update({ warehouse: form.warehouse, title: form.title.trim(), content: form.content.trim(), priority: form.priority })
        .eq('id', editTarget.id)
      if (error) { setFormErr('儲存失敗：' + error.message); setSubmitting(false); return }
    } else {
      const { error } = await supabase
        .from('hint_msg')
        .insert({ warehouse: form.warehouse, title: form.title.trim(), content: form.content.trim(), priority: form.priority })
      if (error) { setFormErr('新增失敗：' + error.message); setSubmitting(false); return }
    }

    setSubmitting(false)
    closeModal()
    fetchAll()
  }

  async function handleDelete(id: number) {
    const { error } = await supabase.from('hint_msg').delete().eq('id', id)
    if (!error) {
      setMsgs((prev) => prev.filter((m) => m.id !== id))
    }
    setDeleteId(null)
  }

  return (
    <div className="settings-page">
      {/* Header */}
      <div className="settings-page-header">
        <div>
          <h1 className="settings-title">推播訊息設定</h1>
          <p className="settings-subtitle">管理各倉庫的跑馬燈公告訊息</p>
        </div>
        {isSuper && (
          <button className="btn-hint-add" onClick={openAdd}>
            ＋ 新增訊息
          </button>
        )}
      </div>

      {/* List */}
      <section className="settings-card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="hint-list-empty">
            <div className="loading-spinner" />
          </div>
        ) : msgs.length === 0 ? (
          <div className="hint-list-empty">尚無推播訊息</div>
        ) : (
          <table className="hint-table">
            <thead>
              <tr>
                <th>優先度</th>
                <th>倉庫</th>
                <th>標題</th>
                <th>內容</th>
                <th>建立時間</th>
                {isSuper && <th />}
              </tr>
            </thead>
            <tbody>
              {msgs.map((msg) => {
                const p = PRIORITY_META[msg.priority]
                return (
                  <tr key={msg.id}>
                    <td>
                      <span
                        className="priority-pill"
                        style={{ color: p.color, background: p.bg, border: `1px solid ${p.border}` }}
                      >
                        {p.label}
                      </span>
                    </td>
                    <td className="hint-td-warehouse">{msg.warehouse}</td>
                    <td className="hint-td-title">{msg.title}</td>
                    <td className="hint-td-content">{msg.content}</td>
                    <td className="hint-td-date">
                      {new Date(msg.created_at).toLocaleString('zh-TW', {
                        timeZone: 'Asia/Taipei',
                        year: 'numeric', month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    {isSuper && (
                      <td>
                        <div className="hint-row-actions">
                          <button className="btn-edit-history" onClick={() => openEdit(msg)}>編輯</button>
                          <button className="btn-delete-history" onClick={() => setDeleteId(msg.id)}>刪除</button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content glass-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                {editTarget ? '編輯訊息' : '新增推播訊息'}
              </h2>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>

            <div className="modal-form" style={{ marginTop: 20 }}>
              {/* 倉庫 */}
              <div className="form-group">
                <label>倉庫</label>
                <select
                  className="form-select"
                  value={form.warehouse}
                  onChange={(e) => setForm((f) => ({ ...f, warehouse: e.target.value }))}
                >
                  <option value="">— 請選擇 —</option>
                  {warehouses.map((w) => (
                    <option key={w.warehouse_id} value={w.warehouse_name}>
                      {w.warehouse_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 優先度 */}
              <div className="form-group">
                <label>優先度</label>
                <div className="priority-selector">
                  {(['normal', 'high', 'urgent'] as const).map((pv) => {
                    const p = PRIORITY_META[pv]
                    const active = form.priority === pv
                    return (
                      <button
                        key={pv}
                        type="button"
                        className="priority-option"
                        style={{
                          color: active ? p.color : 'var(--text-muted)',
                          background: active ? p.bg : 'transparent',
                          borderColor: active ? p.border : 'var(--glass-border)',
                          fontWeight: active ? 700 : 400,
                        }}
                        onClick={() => setForm((f) => ({ ...f, priority: pv }))}
                      >
                        {p.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 標題 */}
              <div className="form-group">
                <label>標題</label>
                <input
                  className="form-group input"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '10px 14px', color: 'white', outline: 'none', fontSize: '0.875rem' }}
                  placeholder="簡短標題…"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>

              {/* 內容 */}
              <div className="form-group">
                <label>內容</label>
                <textarea
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '10px 14px', color: 'white', outline: 'none', fontSize: '0.875rem', resize: 'vertical', minHeight: 90, fontFamily: 'inherit' }}
                  placeholder="訊息內容…"
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                />
              </div>

              {formErr && (
                <p style={{ color: '#f87171', fontSize: '0.825rem', margin: 0 }}>{formErr}</p>
              )}

              <button
                className="btn-primary btn-full"
                onClick={handleSubmit}
                disabled={submitting}
                style={{ marginTop: 8 }}
              >
                {submitting ? '儲存中…' : editTarget ? '儲存變更' : '新增訊息'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId !== null && (
        <div className="modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="modal-content glass-card" style={{ maxWidth: 360, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <p style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 8 }}>確定刪除此訊息？</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 24 }}>此動作無法復原</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button className="btn-delete-history" style={{ padding: '8px 24px', fontSize: '0.875rem' }} onClick={() => handleDelete(deleteId)}>刪除</button>
              <button className="btn-settings-action" onClick={() => setDeleteId(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
