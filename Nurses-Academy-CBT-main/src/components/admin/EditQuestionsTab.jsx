// src/components/admin/EditQuestionsTab.jsx
// Inline multi-question editor. Load questions by filter, edit any field
// directly in the row, then "Save All Changes" in one Firestore batch.

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection, query, where, orderBy, getDocs,
  writeBatch, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { NURSING_CATEGORIES } from '../../data/categories';

const F = "'Times New Roman',Times,serif";
const H = "'Arial Black',Arial,sans-serif";
const TEAL   = '#0D9488';
const GOLD   = '#F59E0B';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const PAGE_SZ = 30;

// ── tiny helper ─────────────────────────────────────────────────────────────
function badge(text, color) {
  return (
    <span style={{
      display:'inline-block', padding:'2px 8px', borderRadius:20,
      fontSize:10, fontWeight:800, fontFamily:H,
      background:`${color}18`, color, border:`1px solid ${color}40`,
    }}>{text}</span>
  );
}

// ── inline text cell ─────────────────────────────────────────────────────────
function Cell({ value, onChange, multiline = false, mono = false, placeholder = '', style = {} }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(value);
  const ref = useRef();

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);

  const commit = () => { setEditing(false); if (draft !== value) onChange(draft); };
  const cancel = () => { setEditing(false); setDraft(value); };

  const shared = {
    value: draft,
    onChange: e => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: e => {
      if (!multiline && e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') cancel();
    },
    ref,
    style: {
      width:'100%', background:'var(--bg-primary)', color:'var(--text-primary)',
      border:'1.5px solid '+TEAL, borderRadius:6, padding:'5px 8px',
      fontFamily: mono ? 'monospace' : 'inherit', fontSize:13,
      resize: multiline ? 'vertical' : 'none', minHeight: multiline ? 60 : undefined,
      outline:'none',
      ...style,
    },
  };

  if (editing) {
    return multiline
      ? <textarea {...shared} />
      : <input {...shared} placeholder={placeholder} />;
  }

  return (
    <div
      onClick={() => setEditing(true)}
      title="Click to edit"
      style={{
        cursor:'text', padding:'4px 6px', borderRadius:6, minHeight:28,
        border:'1.5px solid transparent', fontSize:13, lineHeight:1.5,
        color: value ? 'var(--text-primary)' : 'var(--text-muted)',
        transition:'border-color .15s, background .15s',
        wordBreak:'break-word', whiteSpace:'pre-wrap',
        ...style,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(13,148,136,0.4)'; e.currentTarget.style.background='rgba(13,148,136,0.06)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor='transparent'; e.currentTarget.style.background='transparent'; }}
    >
      {value || <span style={{ fontStyle:'italic', fontSize:11 }}>{placeholder || 'click to edit…'}</span>}
    </div>
  );
}

// ── CorrectRadio row ─────────────────────────────────────────────────────────
function OptionsEditor({ options, correctIndex, onOptionsChange, onCorrectChange }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      {options.map((opt, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
          <input
            type="radio"
            name={`ci_${Math.random()}`}
            checked={correctIndex === i}
            onChange={() => onCorrectChange(i)}
            title="Mark as correct answer"
            style={{ accentColor: GREEN, cursor:'pointer', flexShrink:0 }}
          />
          <span style={{
            width:18, fontSize:12, fontWeight:800, flexShrink:0,
            color: correctIndex===i ? GREEN : 'var(--text-muted)',
          }}>{String.fromCharCode(65+i)}.</span>
          <Cell
            value={opt}
            onChange={v => { const o=[...options]; o[i]=v; onOptionsChange(o); }}
            placeholder={`Option ${String.fromCharCode(65+i)}`}
            style={{ flex:1 }}
          />
        </div>
      ))}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export default function EditQuestionsTab({ firestoreCourses, toast }) {
  const [filterCat,  setFilterCat]  = useState('');
  const [filterCourse, setFilterCourse] = useState('');
  const [filterTopic,  setFilterTopic]  = useState('');
  const [search,     setSearch]     = useState('');
  const [page,       setPage]       = useState(0);
  const [jumpPageInput, setJumpPageInput] = useState('');
  const [loading,    setLoading]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [questions,  setQuestions]  = useState([]);   // original from Firestore
  const [edits,      setEdits]      = useState({});   // { [id]: { ...changedFields } }
  const [selected,   setSelected]   = useState(new Set());
  const [expandedId, setExpandedId] = useState(null); // full-row expanded editor

  const dirtyCount = Object.keys(edits).length;
  const paged = questions.slice(page * PAGE_SZ, (page + 1) * PAGE_SZ);

  // ── load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setEdits({});
    setSelected(new Set());
    try {
      const constraints = [orderBy('createdAt', 'desc')];
      if (filterCat)    constraints.unshift(where('category', '==', filterCat));
      if (filterCourse) constraints.unshift(where('course',   '==', filterCourse));
      const snap = await getDocs(query(collection(db, 'questions'), ...constraints));
      let qs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (filterTopic) qs = qs.filter(q => (q.topic || '').toLowerCase().includes(filterTopic.toLowerCase()));
      if (search)      qs = qs.filter(q => (q.question||'').toLowerCase().includes(search.toLowerCase()));
      setQuestions(qs);
      setPage(0);
    } catch(e) { toast('Load failed: '+e.message, 'error'); }
    finally { setLoading(false); }
  }, [filterCat, filterCourse, filterTopic, search, toast]);

  useEffect(() => { load(); }, []); // eslint-disable-line

  // ── field change helper ───────────────────────────────────────────────────
  const change = useCallback((id, field, value) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, [field]: value } : q));
  }, []);

  // ── save all ─────────────────────────────────────────────────────────────
  const saveAll = async () => {
    const ids = Object.keys(edits);
    if (!ids.length) { toast('Nothing changed.', 'info'); return; }
    setSaving(true);
    try {
      const batch = writeBatch(db);
      ids.forEach(id => {
        batch.update(doc(db, 'questions', id), {
          ...edits[id],
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
      setEdits({});
      toast(`✅ ${ids.length} question${ids.length>1?'s':''} saved!`, 'success');
    } catch(e) { toast('Save failed: '+e.message, 'error'); }
    finally { setSaving(false); }
  };

  // ── discard ───────────────────────────────────────────────────────────────
  const discardAll = () => {
    if (!window.confirm('Discard all unsaved changes?')) return;
    load();
  };

  // ── row data (merged with unsaved edits) ─────────────────────────────────
  const rowData = (q) => ({ ...q, ...(edits[q.id] || {}) });

  return (
    <div>
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', marginBottom:16 }}>
        <select className="form-input" style={{ height:36, width:170 }}
          value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="">All Categories</option>
          {NURSING_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.shortLabel}</option>)}
        </select>

        <select className="form-input" style={{ height:36, width:200 }}
          value={filterCourse} onChange={e => setFilterCourse(e.target.value)}>
          <option value="">All Courses</option>
          {firestoreCourses.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>

        <input className="form-input" style={{ height:36, width:140 }}
          placeholder="Topic filter…" value={filterTopic}
          onChange={e => setFilterTopic(e.target.value)} />

        <input className="form-input" style={{ height:36, width:200 }}
          placeholder="🔍 Search question text…" value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()} />

        <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          {loading ? '…' : '↻ Load'}
        </button>

        {dirtyCount > 0 && (
          <>
            <button
              onClick={saveAll} disabled={saving}
              style={{
                padding:'8px 20px', borderRadius:10, border:'none', cursor:'pointer',
                background: GREEN, color:'#fff', fontWeight:900, fontSize:13, fontFamily:H,
                display:'flex', alignItems:'center', gap:7,
                boxShadow:`0 4px 14px ${GREEN}40`,
                animation:'savePulse 1.5s ease infinite',
              }}
            >
              <style>{`@keyframes savePulse{0%,100%{box-shadow:0 4px 14px ${GREEN}40}50%{box-shadow:0 4px 22px ${GREEN}70}}`}</style>
              {saving ? '⏳ Saving…' : `💾 Save ${dirtyCount} Change${dirtyCount>1?'s':''}`}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={discardAll}>✕ Discard</button>
          </>
        )}

        <span style={{ marginLeft:'auto', fontSize:12, color:'var(--text-muted)', fontFamily:F, fontWeight:700 }}>
          {questions.length} questions loaded
          {dirtyCount > 0 && <span style={{ color:GOLD, marginLeft:8 }}>• {dirtyCount} unsaved</span>}
        </span>
      </div>

      {/* ── Legend ──────────────────────────────────────────────────────── */}
      <div style={{
        display:'flex', gap:16, padding:'8px 14px', borderRadius:8, marginBottom:14,
        background:'rgba(13,148,136,0.06)', border:'1px solid rgba(13,148,136,0.2)',
        fontSize:12, color:'var(--text-muted)', flexWrap:'wrap', alignItems:'center',
      }}>
        <span>💡 <strong>Click any cell</strong> to edit inline.</span>
        <span>🔘 <strong>Radio button</strong> = correct answer.</span>
        <span>🔽 <strong>Expand (▸)</strong> to see full question with explanation.</span>
        <span>💾 <strong>Save</strong> commits all changes in one batch.</span>
      </div>

      {loading
        ? <div style={{ textAlign:'center', padding:60 }}><div className="spinner" /></div>
        : questions.length === 0
        ? (
          <div style={{ textAlign:'center', padding:60, color:'var(--text-muted)' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🔍</div>
            <div style={{ fontWeight:700, marginBottom:6 }}>No questions found</div>
            <div style={{ fontSize:13 }}>Adjust filters and click Load</div>
          </div>
        )
        : (
          <>
            {/* ── Table ─────────────────────────────────────────────────── */}
            {/* scroll hint on mobile */}
            <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:6, display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:14 }}>↔</span> Scroll horizontally to see all columns
            </div>
            <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch', borderRadius:12, border:'1px solid var(--border)', position:'relative' }}>
            <div style={{ display:'flex', flexDirection:'column', gap:6, minWidth:'960px', padding:4 }}>

              {/* Header row */}
              <div style={{
                display:'grid',
                gridTemplateColumns:'30px 24px minmax(220px,1fr) minmax(240px,1fr) 130px 100px 80px 44px',
                gap:8, padding:'6px 10px',
                fontSize:11, fontWeight:800, color:'var(--text-muted)', fontFamily:H,
                textTransform:'uppercase', letterSpacing:0.5,
                minWidth:'960px',
              }}>
                <span><input type="checkbox"
                  onChange={e => setSelected(e.target.checked ? new Set(paged.map(q=>q.id)) : new Set())}
                /></span>
                <span></span>
                <span>Question</span>
                <span>Options (click to edit • radio = correct)</span>
                <span>Course / Topic</span>
                <span>Category</span>
                <span>Difficulty</span>
                <span></span>
              </div>

              {paged.map((q, idx) => {
                const r       = rowData(q);
                const isDirty = !!edits[q.id];
                const expanded = expandedId === q.id;
                const cat  = NURSING_CATEGORIES.find(c => c.id === r.category);
                const course = firestoreCourses.find(c => c.id === r.course);

                return (
                  <div key={q.id} style={{
                    background:'var(--bg-card)',
                    border:`1.5px solid ${isDirty ? GOLD+'80' : 'var(--border)'}`,
                    borderRadius:12,
                    boxShadow: isDirty ? `0 2px 12px ${GOLD}20` : 'none',
                    transition:'border-color .2s, box-shadow .2s',
                    minWidth:'960px',
                  }}>

                    {/* ── Compact row ─────────────────────────────────── */}
                    <div style={{
                      display:'grid',
                      gridTemplateColumns:'30px 24px minmax(220px,1fr) minmax(240px,1fr) 130px 100px 80px 44px',
                      gap:8, padding:'10px 12px', alignItems:'start',
                      minWidth:'960px',
                    }}>

                      {/* Checkbox */}
                      <div style={{ paddingTop:4 }}>
                        <input type="checkbox"
                          checked={selected.has(q.id)}
                          onChange={e => {
                            const s = new Set(selected);
                            e.target.checked ? s.add(q.id) : s.delete(q.id);
                            setSelected(s);
                          }}
                        />
                      </div>

                      {/* Dirty indicator */}
                      <div style={{ paddingTop:6 }}>
                        {isDirty
                          ? <span title="Unsaved changes" style={{ color:GOLD, fontSize:16 }}>●</span>
                          : <span style={{ color:'var(--border)', fontSize:16 }}>○</span>}
                      </div>

                      {/* Question text */}
                      <div>
                        <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', marginBottom:3, fontFamily:H }}>
                          #{page*PAGE_SZ + idx+1}
                          {isDirty && badge(' EDITED', GOLD)}
                        </div>
                        <Cell
                          value={r.question}
                          onChange={v => change(q.id, 'question', v)}
                          multiline
                          placeholder="Question text…"
                        />
                      </div>

                      {/* Options */}
                      <OptionsEditor
                        options={r.options || ['','','','']}
                        correctIndex={r.correctIndex ?? 0}
                        onOptionsChange={v => change(q.id, 'options', v)}
                        onCorrectChange={v => change(q.id, 'correctIndex', v)}
                      />

                      {/* Course / Topic */}
                      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                        <select
                          className="form-input"
                          style={{ height:30, fontSize:12, padding:'2px 6px' }}
                          value={r.course || ''}
                          onChange={e => change(q.id, 'course', e.target.value)}
                        >
                          <option value="">— course —</option>
                          {firestoreCourses.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                        <Cell
                          value={r.topic || ''}
                          onChange={v => change(q.id, 'topic', v)}
                          placeholder="topic…"
                          style={{ fontSize:12 }}
                        />
                      </div>

                      {/* Category */}
                      <select
                        className="form-input"
                        style={{ height:30, fontSize:12, padding:'2px 6px' }}
                        value={r.category || ''}
                        onChange={e => change(q.id, 'category', e.target.value)}
                      >
                        {NURSING_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.shortLabel}</option>)}
                      </select>

                      {/* Difficulty */}
                      <select
                        className="form-input"
                        style={{ height:30, fontSize:12, padding:'2px 6px' }}
                        value={r.difficulty || 'medium'}
                        onChange={e => change(q.id, 'difficulty', e.target.value)}
                      >
                        <option value="easy">🟢 Easy</option>
                        <option value="medium">🟡 Medium</option>
                        <option value="hard">🔴 Hard</option>
                      </select>

                      {/* Expand toggle */}
                      <button
                        onClick={() => setExpandedId(expanded ? null : q.id)}
                        title={expanded ? 'Collapse' : 'Expand explanation + image fields'}
                        style={{
                          background: expanded ? 'rgba(13,148,136,0.15)' : 'var(--bg-tertiary)',
                          border:'1px solid var(--border)', borderRadius:8,
                          cursor:'pointer', padding:'6px 8px', fontSize:14,
                          color: expanded ? TEAL : 'var(--text-muted)',
                          transition:'all .15s',
                        }}
                      >
                        {expanded ? '▾' : '▸'}
                      </button>
                    </div>

                    {/* ── Expanded section: explanation + images ─────── */}
                    {expanded && (
                      <div style={{
                        borderTop:'1px solid var(--border)',
                        padding:'14px 12px',
                        background:'var(--bg-primary)',
                        display:'grid',
                        gridTemplateColumns:'1fr 1fr',
                        gap:14,
                      }}>
                        <div>
                          <div style={{ fontSize:11, fontWeight:800, color:'var(--text-muted)', fontFamily:H, marginBottom:4 }}>💡 EXPLANATION</div>
                          <Cell
                            value={r.explanation || ''}
                            onChange={v => change(q.id, 'explanation', v)}
                            multiline
                            placeholder="Explain why the correct answer is right…"
                            style={{ minHeight:70 }}
                          />
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                          <div>
                            <div style={{ fontSize:11, fontWeight:800, color:'var(--text-muted)', fontFamily:H, marginBottom:4 }}>📷 QUESTION IMAGE URL</div>
                            <Cell
                              value={r.imageUrl || ''}
                              onChange={v => change(q.id, 'imageUrl', v)}
                              placeholder="https://… (optional)"
                              style={{ fontSize:12 }}
                            />
                          </div>
                          <div>
                            <div style={{ fontSize:11, fontWeight:800, color:'var(--text-muted)', fontFamily:H, marginBottom:4 }}>🖼 EXPLANATION IMAGE URL</div>
                            <Cell
                              value={r.explanationImageUrl || ''}
                              onChange={v => change(q.id, 'explanationImageUrl', v)}
                              placeholder="https://… (optional)"
                              style={{ fontSize:12 }}
                            />
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize:11, fontWeight:800, color:'var(--text-muted)', fontFamily:H, marginBottom:4 }}>🏷 TAGS (comma-separated)</div>
                          <Cell
                            value={Array.isArray(r.tags) ? r.tags.join(', ') : (r.tags || '')}
                            onChange={v => change(q.id, 'tags', v.split(',').map(t=>t.trim()).filter(Boolean))}
                            placeholder="fluid, electrolytes, renal…"
                            style={{ fontSize:12 }}
                          />
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <input
                            type="checkbox"
                            id={`active_${q.id}`}
                            checked={r.active !== false}
                            onChange={e => change(q.id, 'active', e.target.checked)}
                            style={{ accentColor: TEAL, width:16, height:16, cursor:'pointer' }}
                          />
                          <label htmlFor={`active_${q.id}`} style={{ fontSize:13, fontWeight:700, cursor:'pointer', color:'var(--text-secondary)' }}>
                            Active (visible to students)
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </div>

            {/* ── Pagination ────────────────────────────────────────── */}
            <div style={{ display:'flex', gap:10, marginTop:16, alignItems:'center', flexWrap:'wrap' }}>
              <button className="btn btn-ghost btn-sm" disabled={page===0} onClick={()=>setPage(p=>p-1)}>← Prev</button>
              <span style={{ fontSize:13, color:'var(--text-muted)' }}>
                Page {page+1} of {Math.max(1,Math.ceil(questions.length/PAGE_SZ))} ({questions.length} total)
              </span>
              <button className="btn btn-ghost btn-sm"
                disabled={(page+1)*PAGE_SZ>=questions.length}
                onClick={()=>setPage(p=>p+1)}>Next →</button>

              {/* ── Jump to page ──────────────────────────────────────── */}
              {(() => {
                const totalPages = Math.max(1, Math.ceil(questions.length / PAGE_SZ));
                const goToPage = () => {
                  const n = parseInt(jumpPageInput, 10);
                  if (!Number.isNaN(n) && n >= 1 && n <= totalPages) {
                    setPage(n - 1);
                  }
                  setJumpPageInput('');
                };
                return (
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:4 }}>
                    <span style={{ fontSize:12, color:'var(--text-muted)' }}>Go to:</span>
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      placeholder="#"
                      value={jumpPageInput}
                      onChange={e => setJumpPageInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') goToPage(); }}
                      style={{
                        width:56, padding:'6px 8px', borderRadius:8,
                        border:'1.5px solid var(--border)', background:'var(--bg-card)',
                        color:'var(--text-primary)', fontSize:13, textAlign:'center',
                      }}
                    />
                    <button className="btn btn-ghost btn-sm" onClick={goToPage}>Go</button>
                  </div>
                );
              })()}

              {dirtyCount > 0 && (
                <button
                  onClick={saveAll} disabled={saving}
                  style={{
                    marginLeft:'auto', padding:'8px 22px', borderRadius:10, border:'none',
                    cursor:'pointer', background:GREEN, color:'#fff',
                    fontWeight:900, fontSize:13, fontFamily:H,
                  }}
                >
                  {saving ? '⏳ Saving…' : `💾 Save ${dirtyCount} Change${dirtyCount>1?'s':''}`}
                </button>
              )}
            </div>
          </>
        )
      }
    </div>
  );
}
