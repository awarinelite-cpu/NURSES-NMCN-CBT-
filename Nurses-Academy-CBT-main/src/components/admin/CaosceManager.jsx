// src/components/admin/CaosceManager.jsx
// Route: /admin/caosce
//
// LAYOUT:
//   Level 0 — Specialty cards (case count per specialty)
//   Level 1 — Cases for that specialty: list + Add/Edit form + Bulk JSON Import
//
// FIRESTORE: caosceCases collection
//   {
//     specialty, topic, year, title, scenario,
//     procedures:   [{ id, text, isRequired }],
//     cbtQuestions: [{ id, question, options:[4], correctIndex, explanation }],
//     active, createdAt, updatedAt
//   }

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection, getDocs, addDoc, deleteDoc, updateDoc,
  doc, serverTimestamp, query, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { NURSING_CATEGORIES } from '../../data/categories';
import { useToast } from '../shared/Toast';
import { readCaosceCsvFile, generateCaosceCsvTemplate } from '../../utils/caosceCsvImport';

const uid = () => Math.random().toString(36).slice(2, 9);

const BLANK_PROCEDURE = () => ({ id: uid(), text: '', isRequired: true });
const BLANK_CBT_Q     = () => ({ id: uid(), question: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' });

const EXAMPLE_JSON = `[
  {
    "specialty": "paediatric",
    "topic": "Neonatal Resuscitation",
    "year": 2024,
    "title": "Station 2 — Neonatal Resuscitation",
    "scenario": "A baby is born at term and is not breathing spontaneously...",
    "procedures": [
      { "text": "Dry and stimulate the baby", "isRequired": true },
      { "text": "Call for senior help immediately", "isRequired": true },
      { "text": "Give the baby to the mother for skin-to-skin first", "isRequired": false }
    ],
    "cbtQuestions": [
      {
        "question": "What is the first step in neonatal resuscitation?",
        "options": ["Dry and stimulate", "Give oxygen", "Chest compressions", "Call doctor"],
        "correctIndex": 0,
        "explanation": "Drying and stimulating often initiates breathing."
      }
    ]
  }
]`;

export default function CaosceManager() {
  const { toast } = useToast();

  const [selectedSpecialty, setSelectedSpecialty] = useState(null);
  const [cases,             setCases]             = useState([]);
  const [caseCounts,        setCaseCounts]        = useState({});
  const [loading,           setLoading]           = useState(true);
  const [saving,            setSaving]            = useState(false);
  const [deletingId,        setDeletingId]        = useState(null);
  const [togglingId,        setTogglingId]        = useState(null);
  const [showAddForm,       setShowAddForm]       = useState(false);
  const [editId,            setEditId]            = useState(null);
  const [search,            setSearch]            = useState('');
  const [showBulk,          setShowBulk]          = useState(false);
  const [bulkText,          setBulkText]          = useState('');
  const [bulkBusy,          setBulkBusy]          = useState(false);
  const [csvBusy,           setCsvBusy]           = useState(false);
  const csvInputRef = useRef(null);

  // Form state
  const [fTopic,    setFTopic]    = useState('');
  const [fYear,     setFYear]     = useState('');
  const [fTitle,    setFTitle]    = useState('');
  const [fScenario, setFScenario] = useState('');
  const [fActive,   setFActive]   = useState(true);
  const [fProcedures,    setFProcedures]    = useState([BLANK_PROCEDURE()]);
  const [fCbtQuestions,  setFCbtQuestions]  = useState([BLANK_CBT_Q()]);

  // ── Load all case counts (for specialty grid) ───────────────────────────────
  const loadCounts = useCallback(async () => {
    const snap = await getDocs(collection(db, 'caosceCases'));
    const counts = {};
    snap.docs.forEach(d => {
      const sp = d.data().specialty;
      counts[sp] = (counts[sp] || 0) + 1;
    });
    setCaseCounts(counts);
  }, []);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  // ── Load cases for selected specialty ───────────────────────────────────────
  const loadCases = useCallback(async (specialtyId) => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'caosceCases'), where('specialty', '==', specialtyId)));
      setCases(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch {
      toast?.('Failed to load cases', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (selectedSpecialty) loadCases(selectedSpecialty.id);
  }, [selectedSpecialty, loadCases]);

  const resetForm = () => {
    setFTopic(''); setFYear(''); setFTitle(''); setFScenario(''); setFActive(true);
    setFProcedures([BLANK_PROCEDURE()]); setFCbtQuestions([BLANK_CBT_Q()]);
    setEditId(null);
  };

  const startEdit = (c) => {
    setFTopic(c.topic || ''); setFYear(c.year ? String(c.year) : ''); setFTitle(c.title || '');
    setFScenario(c.scenario || ''); setFActive(c.active !== false);
    setFProcedures(c.procedures?.length ? c.procedures.map(p => ({ ...p })) : [BLANK_PROCEDURE()]);
    setFCbtQuestions(c.cbtQuestions?.length ? c.cbtQuestions.map(q => ({ ...q, options: [...q.options] })) : [BLANK_CBT_Q()]);
    setEditId(c.id);
    setShowAddForm(true);
  };

  const handleSave = async () => {
    if (!fScenario.trim()) { toast?.('Scenario is required', 'error'); return; }
    const cleanProcedures = fProcedures.filter(p => p.text.trim()).map(p => ({ id: p.id || uid(), text: p.text.trim(), isRequired: !!p.isRequired }));
    const cleanCbt = fCbtQuestions
      .filter(q => q.question.trim())
      .map(q => ({
        id: q.id || uid(),
        question: q.question.trim(),
        options: q.options.map(o => o.trim()),
        correctIndex: q.correctIndex,
        explanation: (q.explanation || '').trim(),
      }));

    setSaving(true);
    try {
      const payload = {
        specialty: selectedSpecialty.id,
        topic: fTopic.trim(),
        year: fYear ? Number(fYear) : null,
        title: fTitle.trim(),
        scenario: fScenario.trim(),
        procedures: cleanProcedures,
        cbtQuestions: cleanCbt,
        active: fActive,
        updatedAt: serverTimestamp(),
      };
      if (editId) {
        await updateDoc(doc(db, 'caosceCases', editId), payload);
        toast?.('Case updated', 'success');
      } else {
        await addDoc(collection(db, 'caosceCases'), { ...payload, createdAt: serverTimestamp() });
        toast?.('Case added', 'success');
      }
      resetForm();
      setShowAddForm(false);
      loadCases(selectedSpecialty.id);
      loadCounts();
    } catch (e) {
      console.error(e);
      toast?.('Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this case permanently?')) return;
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, 'caosceCases', id));
      setCases(prev => prev.filter(c => c.id !== id));
      loadCounts();
      toast?.('Case deleted', 'success');
    } catch {
      toast?.('Delete failed', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (c) => {
    setTogglingId(c.id);
    try {
      await updateDoc(doc(db, 'caosceCases', c.id), { active: !c.active });
      setCases(prev => prev.map(x => x.id === c.id ? { ...x, active: !c.active } : x));
    } catch {
      toast?.('Update failed', 'error');
    } finally {
      setTogglingId(null);
    }
  };

  // ── Bulk JSON import ─────────────────────────────────────────────────────────
  const handleBulkImport = async () => {
    let parsed;
    try {
      parsed = JSON.parse(bulkText);
      if (!Array.isArray(parsed)) throw new Error('Top level JSON must be an array');
    } catch (e) {
      toast?.(`Invalid JSON: ${e.message}`, 'error');
      return;
    }

    setBulkBusy(true);
    let success = 0, failed = 0;
    try {
      // Firestore batches cap at 500 writes — chunk just in case.
      for (let i = 0; i < parsed.length; i += 400) {
        const chunk = parsed.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach(item => {
          if (!item.specialty || !item.scenario) { failed++; return; }
          const ref = doc(collection(db, 'caosceCases'));
          batch.set(ref, {
            specialty: item.specialty,
            topic: item.topic || '',
            year: item.year ? Number(item.year) : null,
            title: item.title || item.topic || '',
            scenario: item.scenario,
            procedures: (item.procedures || []).map(p => ({ id: uid(), text: p.text || '', isRequired: !!p.isRequired })),
            cbtQuestions: (item.cbtQuestions || []).map(q => ({
              id: uid(), question: q.question || '', options: q.options || ['', '', '', ''],
              correctIndex: q.correctIndex ?? 0, explanation: q.explanation || '',
            })),
            active: item.active !== false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          success++;
        });
        await batch.commit();
      }
      toast?.(`Imported ${success} case${success !== 1 ? 's' : ''}${failed ? `, skipped ${failed} invalid` : ''}`, failed ? 'warning' : 'success');
      setBulkText('');
      setShowBulk(false);
      if (selectedSpecialty) loadCases(selectedSpecialty.id);
      loadCounts();
    } catch (e) {
      console.error(e);
      toast?.('Bulk import failed', 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  // ── CSV file upload → populates the same bulk textarea as JSON paste ───────
  const handleCsvFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvBusy(true);
    try {
      const { cases, warnings, rowCount } = await readCaosceCsvFile(file, selectedSpecialty?.id);
      if (cases.length === 0) {
        toast?.(warnings[0] || 'No valid cases found in CSV', 'error');
        return;
      }
      setBulkText(JSON.stringify(cases, null, 2));
      const totalQuestions = cases.reduce((sum, c) => sum + (c.cbtQuestions?.length || 0), 0);
      const msg = `Loaded ${cases.length} case${cases.length !== 1 ? 's' : ''} (${totalQuestions} CBT question${totalQuestions !== 1 ? 's' : ''}) from ${rowCount} row${rowCount !== 1 ? 's' : ''} — review below, then click Import Cases`;
      toast?.(warnings.length ? `${msg}. ${warnings[0]}` : msg, warnings.length ? 'warning' : 'success');
    } catch (err) {
      console.error(err);
      toast?.(err.message || 'Failed to read CSV file', 'error');
    } finally {
      setCsvBusy(false);
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  };

  const downloadCsvTemplate = () => {
    const blob = generateCaosceCsvTemplate();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'caosce_cases_template.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // ── Procedure/CBT row helpers ────────────────────────────────────────────────
  const updateProcedure = (idx, patch) => setFProcedures(prev => prev.map((p, i) => i === idx ? { ...p, ...patch } : p));
  const addProcedureRow = () => setFProcedures(prev => [...prev, BLANK_PROCEDURE()]);
  const removeProcedureRow = (idx) => setFProcedures(prev => prev.filter((_, i) => i !== idx));

  const updateCbtQ = (idx, patch) => setFCbtQuestions(prev => prev.map((q, i) => i === idx ? { ...q, ...patch } : q));
  const updateCbtOption = (qIdx, optIdx, val) => setFCbtQuestions(prev => prev.map((q, i) => {
    if (i !== qIdx) return q;
    const options = [...q.options]; options[optIdx] = val;
    return { ...q, options };
  }));
  const addCbtRow = () => setFCbtQuestions(prev => [...prev, BLANK_CBT_Q()]);
  const removeCbtRow = (idx) => setFCbtQuestions(prev => prev.filter((_, i) => i !== idx));

  const filteredCases = cases.filter(c => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (c.topic || '').toLowerCase().includes(s) || (c.title || '').toLowerCase().includes(s) || String(c.year || '').includes(s);
  });

  // ── LEVEL 0 — Specialty grid ─────────────────────────────────────────────────
  if (!selectedSpecialty) {
    return (
      <div style={{ padding: 24, maxWidth: 900 }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontFamily: "'Playfair Display',serif", margin: '0 0 6px', color: 'var(--text-primary)' }}>
            🩺 CAOSCE Prep Manager
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
            Create and manage OSCE practical exam cases — scenario, procedure checklist, CBT questions.
          </p>
        </div>

        <div style={styles.catGrid}>
          {NURSING_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedSpecialty(cat)}
              style={{ ...styles.catCard, borderColor: `${cat.color}50`, background: `${cat.color}0D` }}
            >
              <div style={{ ...styles.catIconBox, background: `${cat.color}20` }}>
                <span style={{ fontSize: 24 }}>{cat.icon}</span>
              </div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-primary)' }}>{cat.shortLabel}</div>
                <div style={{ fontSize: 11, color: cat.color, fontWeight: 600 }}>
                  {caseCounts[cat.id] || 0} case{(caseCounts[cat.id] || 0) !== 1 ? 's' : ''}
                </div>
              </div>
              <span style={{ color: cat.color, fontSize: 18, fontWeight: 900 }}>→</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── LEVEL 1 — Cases for this specialty ──────────────────────────────────────
  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <button onClick={() => { setSelectedSpecialty(null); resetForm(); setShowAddForm(false); setShowBulk(false); setSearch(''); }} style={styles.backBtn}>
        ← Back to Specialties
      </button>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20,
        padding: '16px 20px', background: `${selectedSpecialty.color}12`,
        border: `1.5px solid ${selectedSpecialty.color}30`, borderRadius: 14,
      }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: `${selectedSpecialty.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
          {selectedSpecialty.icon}
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
            {selectedSpecialty.label}
          </h2>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{cases.length} case{cases.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => { setShowBulk(v => !v); setShowAddForm(false); }}>
          {showBulk ? '✕ Cancel' : '📥 Bulk Import'}
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => { resetForm(); setShowAddForm(v => !v); setShowBulk(false); }}>
          {showAddForm && !editId ? '✕ Cancel' : '➕ Add Case'}
        </button>
      </div>

      {/* ── Bulk JSON import panel ── */}
      {showBulk && (
        <div className="card" style={{ padding: 20, marginBottom: 24, border: `2px solid ${selectedSpecialty.color}40` }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 10 }}>📥 Bulk Import (paste JSON array)</div>
          <details style={{ marginBottom: 12 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--teal)', fontWeight: 600 }}>View expected JSON format</summary>
            <pre style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 8, fontSize: 11, overflowX: 'auto', marginTop: 8, color: 'var(--text-muted)' }}>{EXAMPLE_JSON}</pre>
          </details>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            background: 'var(--bg-secondary)', borderRadius: 10, padding: 12, marginBottom: 14,
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>📄 Or upload a CSV (add extra question rows below a case to stack as many CBT questions as you need):</span>
            <button
              className="btn btn-secondary btn-sm"
              disabled={csvBusy}
              onClick={() => csvInputRef.current?.click()}
            >
              {csvBusy ? 'Reading…' : '📤 Choose CSV File'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={downloadCsvTemplate}>
              ⬇️ Download CSV Template
            </button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvFile}
              style={{ display: 'none' }}
            />
          </div>
          <textarea
            className="form-input"
            rows={10}
            placeholder="Paste your JSON array of cases here…"
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, marginBottom: 12 }}
          />
          <button className="btn btn-primary" disabled={bulkBusy || !bulkText.trim()} onClick={handleBulkImport}>
            {bulkBusy ? 'Importing…' : '📥 Import Cases'}
          </button>
        </div>
      )}

      {/* ── Add / Edit form ── */}
      {showAddForm && (
        <div className="card" style={{ padding: 20, marginBottom: 24, border: `2px solid ${selectedSpecialty.color}40` }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16 }}>
            {editId ? '✏️ Edit Case' : '➕ Add New Case'}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Topic</label>
              <input className="form-input" placeholder="e.g. Wound Dressing" value={fTopic} onChange={e => setFTopic(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Year</label>
              <input className="form-input" type="number" placeholder="e.g. 2024" value={fYear} onChange={e => setFYear(e.target.value)} />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Case Title</label>
            <input className="form-input" placeholder="e.g. Station 3 — Post-operative Wound Care" value={fTitle} onChange={e => setFTitle(e.target.value)} />
          </div>

          <div className="form-group" style={{ marginBottom: 18 }}>
            <label className="form-label">Scenario *</label>
            <textarea className="form-input" rows={4} placeholder="Describe the clinical scenario the student will read…" value={fScenario} onChange={e => setFScenario(e.target.value)} style={{ width: '100%' }} />
          </div>

          {/* Procedures */}
          <div style={{ marginBottom: 18 }}>
            <div style={styles.formLabel}>Procedure Checklist</div>
            {fProcedures.map((p, i) => (
              <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input
                  className="form-input" placeholder={`Procedure ${i + 1}…`} value={p.text}
                  onChange={e => updateProcedure(i, { text: e.target.value })} style={{ flex: 1 }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={!!p.isRequired} onChange={e => updateProcedure(i, { isRequired: e.target.checked })} />
                  Required
                </label>
                <button onClick={() => removeProcedureRow(i)} style={styles.removeBtn} disabled={fProcedures.length === 1}>✕</button>
              </div>
            ))}
            <button className="btn btn-secondary btn-sm" onClick={addProcedureRow}>➕ Add Procedure</button>
          </div>

          {/* CBT Questions */}
          <div style={{ marginBottom: 18 }}>
            <div style={styles.formLabel}>CBT Questions</div>
            {fCbtQuestions.map((q, qi) => (
              <div key={q.id} style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <input
                    className="form-input" placeholder={`CBT Question ${qi + 1}…`} value={q.question}
                    onChange={e => updateCbtQ(qi, { question: e.target.value })} style={{ flex: 1 }}
                  />
                  <button onClick={() => removeCbtRow(qi)} style={styles.removeBtn} disabled={fCbtQuestions.length === 1}>✕</button>
                </div>
                {q.options.map((opt, oi) => (
                  <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <input
                      type="radio" name={`correct-${q.id}`} checked={q.correctIndex === oi}
                      onChange={() => updateCbtQ(qi, { correctIndex: oi })}
                    />
                    <input
                      className="form-input" placeholder={`Option ${String.fromCharCode(65 + oi)}`} value={opt}
                      onChange={e => updateCbtOption(qi, oi, e.target.value)} style={{ flex: 1 }}
                    />
                  </div>
                ))}
                <input
                  className="form-input" placeholder="Explanation (optional)" value={q.explanation}
                  onChange={e => updateCbtQ(qi, { explanation: e.target.value })} style={{ marginTop: 6 }}
                />
              </div>
            ))}
            <button className="btn btn-secondary btn-sm" onClick={addCbtRow}>➕ Add CBT Question</button>
          </div>

          {/* Active toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--bg-secondary)', borderRadius: 10, padding: '12px 16px', marginBottom: 18,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Visible to Students</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {fActive ? 'Students can find and take this case' : 'Hidden from students'}
              </div>
            </div>
            <button onClick={() => setFActive(v => !v)} style={{
              width: 46, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
              background: fActive ? 'var(--teal)' : 'var(--border)', position: 'relative', flexShrink: 0,
            }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: fActive ? 23 : 3, transition: 'left 0.2s' }} />
            </button>
          </div>

          <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : editId ? '💾 Update Case' : '💾 Save Case'}
          </button>
        </div>
      )}

      {/* Search */}
      <input className="form-input" placeholder="🔍 Search cases by topic or year…" value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 16, maxWidth: 400 }} />

      {/* Case list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading…</div>
      ) : filteredCases.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No cases yet — add one above.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredCases.map(c => (
            <div key={c.id} style={styles.caseRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-primary)' }}>
                  {c.title || c.topic || 'Untitled'} {c.active === false && <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}> · hidden</span>}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                  {c.topic}{c.year ? ` · ${c.year}` : ''} · {c.procedures?.length || 0} procedures · {c.cbtQuestions?.length || 0} CBT Qs
                </div>
              </div>
              <button className="btn btn-secondary btn-sm" disabled={togglingId === c.id} onClick={() => handleToggleActive(c)}>
                {c.active === false ? '👁️ Show' : '🙈 Hide'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => startEdit(c)}>✏️ Edit</button>
              <button className="btn btn-danger btn-sm" disabled={deletingId === c.id} onClick={() => handleDelete(c.id)}>
                {deletingId === c.id ? '…' : '🗑️'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  backBtn:    { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', fontWeight: 700, fontSize: 13, padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 },
  catGrid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 },
  catCard:    { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12, border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit', background: 'var(--bg-card)' },
  catIconBox: { width: 42, height: 42, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  caseRow:    { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 },
  formLabel:  { fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 },
  removeBtn:  { background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)', color: '#DC2626', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontWeight: 700, flexShrink: 0 },
};
