// src/components/exam/CaosceExamSession.jsx
// Route: /caosce/exam
//
// Receives via navigate() state: { caseIds: [...], specialty }
//
// Per case:
//   1. Scenario (the main question)
//   2. Procedure checklist — tick every procedure you'd perform.
//      Scored against each procedure's isRequired flag:
//        correct = (ticked & required) + (unticked & not required)
//   3. CBT questions — multiple choice, one correctIndex each.
//
// On finishing the last case: scores are totalled, saved to Firestore
// (`caosceResults`), then a results summary is shown.

import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where, documentId, addDoc, serverTimestamp } from 'firebase/firestore';
import { db }      from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

function scoreCase(c, ticked, cbtAnswers) {
  const procedures = c.procedures || [];
  let procedureCorrect = 0;
  procedures.forEach(p => {
    const isTicked = !!ticked[p.id];
    const shouldBeTicked = !!p.isRequired;
    if (isTicked === shouldBeTicked) procedureCorrect++;
  });

  const cbtQs = c.cbtQuestions || [];
  let cbtCorrect = 0;
  cbtQs.forEach(q => {
    if (cbtAnswers[q.id] === q.correctIndex) cbtCorrect++;
  });

  return {
    procedureCorrect, procedureTotal: procedures.length,
    cbtCorrect,       cbtTotal: cbtQs.length,
  };
}

export default function CaosceExamSession() {
  const { state }  = useLocation();
  const navigate    = useNavigate();
  const { user }    = useAuth();

  const [loading,    setLoading]    = useState(true);
  const [cases,      setCases]      = useState([]);
  const [caseIndex,  setCaseIndex]  = useState(0);
  const [ticked,     setTicked]     = useState({});    // { [caseId]: { [procId]: true } }
  const [cbtAnswers, setCbtAnswers] = useState({});    // { [caseId]: { [qId]: optionIndex } }
  const [finished,   setFinished]   = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [startedAt]  = useState(Date.now());

  const specialty = NURSING_CATEGORIES.find(c => c.id === state?.specialty);

  useEffect(() => {
    const caseIds = state?.caseIds || [];
    if (!caseIds.length) { setLoading(false); return; }
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'caosceCases'), where(documentId(), 'in', caseIds))
        );
        // keep the order the student selected them in
        const byId = Object.fromEntries(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
        setCases(caseIds.map(id => byId[id]).filter(Boolean));
      } catch {
        setCases([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [state]);

  if (loading) {
    return <div style={styles.center}><div style={{ fontSize: 40 }}>⏳</div><div style={{ color: 'var(--text-muted)' }}>Loading case…</div></div>;
  }

  if (!cases.length) {
    return (
      <div style={styles.center}>
        <div style={{ fontSize: 40 }}>⚠️</div>
        <div style={{ color: 'var(--text-muted)', marginBottom: 16 }}>No case data found.</div>
        <button onClick={() => navigate('/caosce')} style={styles.primaryBtn}>← Back to CAOSCE Prep</button>
      </div>
    );
  }

  const current = cases[caseIndex];
  const caseTicked  = ticked[current.id]     || {};
  const caseAnswers = cbtAnswers[current.id] || {};
  const isLast = caseIndex === cases.length - 1;

  const toggleProcedure = (procId) => {
    setTicked(prev => ({
      ...prev,
      [current.id]: { ...(prev[current.id] || {}), [procId]: !prev[current.id]?.[procId] },
    }));
  };

  const selectAnswer = (qId, idx) => {
    setCbtAnswers(prev => ({
      ...prev,
      [current.id]: { ...(prev[current.id] || {}), [qId]: idx },
    }));
  };

  const goNext = () => {
    if (!isLast) { setCaseIndex(i => i + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    else handleFinish();
  };

  const handleExit = () => {
    if (window.confirm('Exit this practical exam? Your progress will not be saved.')) {
      navigate('/caosce');
    }
  };

  const buildResults = () => {
    let totalCorrect = 0, totalItems = 0;
    const caseResults = cases.map(c => {
      const s = scoreCase(c, ticked[c.id] || {}, cbtAnswers[c.id] || {});
      totalCorrect += s.procedureCorrect + s.cbtCorrect;
      totalItems   += s.procedureTotal + s.cbtTotal;
      return {
        caseId: c.id, title: c.title || c.topic || 'Case', topic: c.topic || '', year: c.year || null,
        ...s,
        tickedProcedureIds: Object.keys(ticked[c.id] || {}).filter(id => ticked[c.id][id]),
        cbtAnswers: cbtAnswers[c.id] || {},
      };
    });
    const scorePercent = totalItems > 0 ? Math.round((totalCorrect / totalItems) * 100) : 0;
    return { caseResults, totalCorrect, totalItems, scorePercent };
  };

  const handleFinish = () => setFinished(true);

  const handleSaveExam = async () => {
    if (saving || saved) return;
    setSaving(true);
    try {
      const { caseResults, totalCorrect, totalItems, scorePercent } = buildResults();
      await addDoc(collection(db, 'caosceResults'), {
        userId:        user?.uid,
        specialty:     state?.specialty,
        caseIds:       cases.map(c => c.id),
        cases:         caseResults,
        totalCorrect,
        totalQuestions: totalItems,
        scorePercent,
        durationSeconds: Math.round((Date.now() - startedAt) / 1000),
        createdAt:     serverTimestamp(),
      });
      setSaved(true);
    } catch (e) {
      console.error('Save CAOSCE result error:', e);
      window.alert('Could not save your exam. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Results summary screen ───────────────────────────────────────────────────
  if (finished) {
    const { caseResults, totalCorrect, totalItems, scorePercent } = buildResults();
    const passColor = scorePercent >= 70 ? '#16A34A' : scorePercent >= 50 ? '#D97706' : '#DC2626';

    return (
      <div style={{ padding: '24px', maxWidth: 760, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>{scorePercent >= 70 ? '🏆' : scorePercent >= 50 ? '👍' : '📘'}</div>
          <h2 style={{ fontFamily: H, margin: '0 0 6px', color: 'var(--text-primary)' }}>CAOSCE Result</h2>
          <div style={{ fontSize: 42, fontWeight: 900, color: passColor, fontFamily: H }}>{scorePercent}%</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, fontFamily: F }}>
            {totalCorrect} / {totalItems} correct across {cases.length} case{cases.length !== 1 ? 's' : ''}
          </div>
        </div>

        {caseResults.map(cr => (
          <div key={cr.caseId} className="card" style={{ padding: '16px 18px', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 8 }}>
              {cr.title}{cr.year ? ` · ${cr.year}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 18, fontSize: 12.5, color: 'var(--text-muted)', fontFamily: F }}>
              <span>✅ Procedures: <strong style={{ color: 'var(--text-primary)' }}>{cr.procedureCorrect}/{cr.procedureTotal}</strong></span>
              <span>📝 CBT: <strong style={{ color: 'var(--text-primary)' }}>{cr.cbtCorrect}/{cr.cbtTotal}</strong></span>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
          {!saved ? (
            <button onClick={handleSaveExam} disabled={saving} style={{ ...styles.primaryBtn, opacity: saving ? 0.7 : 1 }}>
              {saving ? '💾 Saving…' : '💾 Save Exam'}
            </button>
          ) : (
            <div style={{
              padding: '13px', borderRadius: 12, textAlign: 'center', fontWeight: 800, fontSize: 14,
              background: 'rgba(13,148,136,0.12)', border: '1.5px solid rgba(13,148,136,0.4)', color: '#0D9488',
            }}>
              ✅ Saved! Great work.
            </div>
          )}
          <button onClick={() => navigate('/caosce')} style={styles.ghostBtn}>← Back to CAOSCE Prep</button>
        </div>
      </div>
    );
  }

  // ── Active exam — scenario + checklist + CBT ────────────────────────────────
  return (
    <div style={{ padding: '24px', maxWidth: 760, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {specialty?.icon} {specialty?.shortLabel || 'CAOSCE'} · Case {caseIndex + 1} of {cases.length}
        </div>
        <button onClick={handleExit} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>
          ✕ Exit
        </button>
      </div>

      <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-tertiary)', marginBottom: 22, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${((caseIndex + 1) / cases.length) * 100}%`, background: 'linear-gradient(90deg,#0D9488,#0F766E)', transition: 'width .3s' }} />
      </div>

      {/* Scenario / question */}
      <div className="card" style={{ padding: '18px 20px', marginBottom: 22, border: '1.5px solid rgba(13,148,136,0.3)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#0D9488', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          🩺 Scenario
        </div>
        <div style={{ fontFamily: F, fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
          {current.scenario}
        </div>
      </div>

      {/* Procedure checklist */}
      {!!(current.procedures?.length) && (
        <div style={{ marginBottom: 22 }}>
          <div style={styles.sectionHead}>✅ Procedure Checklist — tick what you would do</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {current.procedures.map(p => {
              const isOn = !!caseTicked[p.id];
              return (
                <button
                  key={p.id}
                  onClick={() => toggleProcedure(p.id)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12, textAlign: 'left',
                    padding: '12px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: F,
                    border: `1.5px solid ${isOn ? '#0D9488' : 'var(--border)'}`,
                    background: isOn ? 'rgba(13,148,136,0.1)' : 'var(--bg-card)',
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 1,
                    border: `2px solid ${isOn ? '#0D9488' : 'var(--border)'}`,
                    background: isOn ? '#0D9488' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 12, fontWeight: 900,
                  }}>
                    {isOn ? '✓' : ''}
                  </div>
                  <span style={{ fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.5 }}>{p.text}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* CBT questions */}
      {!!(current.cbtQuestions?.length) && (
        <div style={{ marginBottom: 24 }}>
          <div style={styles.sectionHead}>📝 CBT Questions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {current.cbtQuestions.map((q, qi) => (
              <div key={q.id} className="card" style={{ padding: '14px 16px' }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-primary)', marginBottom: 10, fontFamily: F }}>
                  {qi + 1}. {q.question}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {(q.options || []).map((opt, oi) => {
                    const isSel = caseAnswers[q.id] === oi;
                    return (
                      <button
                        key={oi}
                        onClick={() => selectAnswer(q.id, oi)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                          padding: '10px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: F,
                          border: `1.5px solid ${isSel ? '#2563EB' : 'var(--border)'}`,
                          background: isSel ? 'rgba(37,99,235,0.1)' : 'var(--bg-card)',
                        }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                          border: `2px solid ${isSel ? '#2563EB' : 'var(--border)'}`,
                          background: isSel ? '#2563EB' : 'transparent',
                        }} />
                        <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                          {String.fromCharCode(65 + oi)}. {opt}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={goNext} style={styles.primaryBtn}>
        {isLast ? '🏁 Finish Exam' : 'Next Case →'}
      </button>
    </div>
  );
}

const styles = {
  center:     { minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  sectionHead:{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 12 },
  primaryBtn: { width: '100%', padding: '15px', borderRadius: 12, border: 'none', fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: 15, letterSpacing: 0.4, cursor: 'pointer', background: 'linear-gradient(135deg,#0D9488,#0F766E)', color: '#fff' },
  ghostBtn:   { width: '100%', padding: '13px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
};
