// src/components/exam/DailyReviewStoragePage.jsx
//
// Archive of all past exams taken by this student.
// Loads from the `examSessions` collection
// filtered by the current user's uid.
// Students can review answers or retake any exam.
//
// Route: /daily-reviews  AND  /daily-practice-archive

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, getDocs, query, where, orderBy,
  doc, getDoc,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES, ALL_EXAM_TYPES } from '../../data/categories';

export default function DailyReviewStoragePage() {
  const { user, profile } = useAuth();
  const navigate          = useNavigate();

  const [results,   setResults]   = useState([]);   // exam attempt records
  const [loading,   setLoading]   = useState(true);
  const [filterType, setFilterType] = useState('');
  const [filterCat,  setFilterCat]  = useState('');
  const [search,     setSearch]     = useState('');
  const [activeTab,  setActiveTab]  = useState('all'); // 'all' | 'passed' | 'failed'

  useEffect(() => {
    if (!user?.uid) return;
    const load = async () => {
      setLoading(true);
      try {
        // FIX 1: Query 'examSessions' — this is where ExamSession.jsx saves results
        const q = query(
          collection(db, 'examSessions'),
          where('userId', '==', user.uid),
          orderBy('completedAt', 'desc'),
        );
        const snap = await getDocs(q);
        const attempts = snap.docs.map(d => ({ resultId: d.id, ...d.data() }));

        // For each attempt, enrich with exam metadata if not already stored
        const enriched = await Promise.all(
          attempts.map(async (attempt) => {
            if (attempt.examName) return attempt; // already has name
            if (!attempt.examId)  return attempt;
            try {
              const examSnap = await getDoc(doc(db, 'exams', attempt.examId));
              if (examSnap.exists()) {
                const e = examSnap.data();
                return { ...attempt, examName: e.name, examType: e.examType, category: e.category, totalQuestions: e.totalQuestions };
              }
            } catch { /* ignore */ }
            return attempt;
          })
        );

        setResults(enriched);
      } catch (e) {
        console.error('DailyReviewStoragePage error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.uid]);

  // ── Derived stats ────────────────────────────────────────────────
  // FIX 2: Use `scorePercent` — that's the field ExamSession.jsx saves
  const passed     = results.filter(r => (r.scorePercent ?? 0) >= 50);
  const failed     = results.filter(r => (r.scorePercent ?? 0) < 50);
  const avgScore   = results.length > 0
    ? Math.round(results.reduce((s, r) => s + (r.scorePercent ?? 0), 0) / results.length)
    : null;

  // ── Filter ───────────────────────────────────────────────────────
  const filtered = results.filter(r => {
    if (filterType && r.examType !== filterType) return false;
    if (filterCat  && r.category !== filterCat)  return false;
    if (search && !r.examName?.toLowerCase().includes(search.toLowerCase())) return false;
    if (activeTab === 'passed') return (r.scorePercent ?? 0) >= 50;
    if (activeTab === 'failed') return (r.scorePercent ?? 0) < 50;
    return true;
  });

  const getCat  = (id) => NURSING_CATEGORIES.find(c => c.id === id);
  const getType = (id) => ALL_EXAM_TYPES.find(t => t.id === id);

  const scoreColor = (score) =>
    score >= 70 ? 'var(--green)' : score >= 50 ? '#F59E0B' : '#EF4444';

  const handleReview = (r) => {
    const p = new URLSearchParams({
      resultId: r.resultId,
      examId:   r.examId   || '',
      examName: r.examName || 'Exam Review',
      mode:     'review',
    });
    navigate(`/exam/review?${p.toString()}`);
  };

  const handleRetake = (r) => {
    const p = new URLSearchParams({
      examId:    r.examId   || '',
      examName:  r.examName || 'Retake',
      examType:  r.examType || 'past_questions',
      category:  r.category || 'general_nursing',
      count:     r.totalQuestions || 20,
      shuffle:   'true',
      showExpl:  'true',
      retake:    'true',
    });
    navigate(`/exam/session?${p.toString()}`);
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ padding: '24px', maxWidth: 960 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 32 }}>📖</span>
          <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
            Exam Archive
          </h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          All your past exams — review your answers or retake any of them.
        </p>
      </div>

      {/* Stats strip */}
      {results.length > 0 && (
        <div style={styles.statsStrip}>
          <StatCard emoji="📚" label="Total Taken"  value={results.length} />
          <StatCard emoji="✅" label="Passed (≥50%)" value={passed.length}  color="var(--green)" />
          <StatCard emoji="❌" label="Failed (<50%)" value={failed.length}  color="#EF4444" />
          <StatCard
            emoji="📊" label="Avg Score"
            value={avgScore !== null ? `${avgScore}%` : '—'}
            color={avgScore >= 70 ? 'var(--green)' : avgScore >= 50 ? '#F59E0B' : '#EF4444'}
          />
        </div>
      )}

      {/* Tabs */}
      <div style={styles.tabBar}>
        {[
          { id: 'all',    label: '📋 All',    count: results.length },
          { id: 'passed', label: '✅ Passed',  count: passed.length  },
          { id: 'failed', label: '❌ Failed',  count: failed.length  },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            ...styles.tabBtn,
            background: activeTab === t.id ? 'var(--teal)' : 'transparent',
            color:      activeTab === t.id ? '#fff'        : 'var(--text-muted)',
          }}>
            {t.label}
            <span style={{
              marginLeft: 6, fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '1px 7px',
              background: activeTab === t.id ? 'rgba(255,255,255,0.25)' : 'var(--bg-secondary)',
              color:      activeTab === t.id ? '#fff' : 'var(--text-muted)',
            }}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={styles.filterBar}>
        <input
          className="form-input"
          style={{ maxWidth: 240, height: 38 }}
          placeholder="🔍 Search exams…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="form-input" style={{ maxWidth: 190, height: 38 }}
          value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          {ALL_EXAM_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <select className="form-input" style={{ maxWidth: 190, height: 38 }}
          value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="">All Categories</option>
          {NURSING_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.shortLabel}</option>)}
        </select>
        {(search || filterType || filterCat) && (
          <button className="btn btn-ghost btn-sm"
            onClick={() => { setSearch(''); setFilterType(''); setFilterCat(''); }}>
            ✕ Clear
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div style={styles.emptyState}><span className="spinner" /> Loading your exam history…</div>

      ) : results.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>📭</div>
          <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text-primary)', marginBottom: 8 }}>
            No exams taken yet
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 340, margin: '0 auto 24px' }}>
            Your completed exams will appear here so you can review or retake them anytime.
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/exams')}>
            ⚡ Start an Exam
          </button>
        </div>

      ) : filtered.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: 'var(--text-primary)' }}>
            No matches found
          </div>
          <button className="btn btn-ghost"
            onClick={() => { setSearch(''); setFilterCat(''); setFilterType(''); setActiveTab('all'); }}>
            Clear filters
          </button>
        </div>

      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.map(r => {
            const cat   = getCat(r.category);
            const type  = getType(r.examType);
            // FIX 3: Use scorePercent field
            const score = r.scorePercent ?? null;
            const sc    = score !== null ? scoreColor(score) : 'var(--border)';

            return (
              <div key={r.resultId} style={{ ...styles.card, borderLeft: `4px solid ${sc}` }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>

                  {/* Icon */}
                  <div style={{
                    width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                    background: cat ? `${cat.color}20` : 'var(--bg-tertiary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
                  }}>
                    {cat?.icon || '📝'}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                        {r.examName || 'Exam'}
                      </span>
                      {score !== null && (
                        <span style={badge(sc)}>
                          {score >= 50 ? '✅' : '❌'} {score}%
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      {cat  && <span style={styles.meta}>{cat.icon} {cat.shortLabel}</span>}
                      {type && <span style={styles.meta}>🏷 {type.label}</span>}
                      {r.totalQuestions && <span style={styles.meta}>❓ {r.totalQuestions} questions</span>}
                      {r.correct !== undefined && r.totalQuestions && (
                        <span style={styles.meta}>✔ {r.correct}/{r.totalQuestions} correct</span>
                      )}
                      <span style={styles.meta}>🕐 {formatDate(r.completedAt)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => handleReview(r)}>
                      👁 Review
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleRetake(r)}>
                      🔁 Retake
                    </button>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────
function StatCard({ emoji, label, value, color }) {
  return (
    <div style={styles.statCard}>
      <span style={{ fontSize: 20 }}>{emoji}</span>
      <div>
        <div style={{ fontWeight: 800, fontSize: 18, color: color || 'var(--text-primary)', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
      </div>
    </div>
  );
}

const badge = (color) => ({
  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
  background: `${color}18`, color, border: `1px solid ${color}40`,
});

const styles = {
  statsStrip: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 },
  statCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '12px 18px',
    display: 'flex', alignItems: 'center', gap: 10,
    flex: '1 1 110px', minWidth: 100,
  },
  tabBar: {
    display: 'flex', gap: 4, flexWrap: 'wrap',
    background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
    borderRadius: 12, padding: 4, marginBottom: 20, width: 'fit-content',
  },
  tabBtn: {
    padding: '7px 16px', borderRadius: 9, border: 'none',
    cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
    fontWeight: 700, transition: 'all 0.2s', display: 'flex', alignItems: 'center',
  },
  filterBar: { display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' },
  card: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 14, padding: '16px 20px', transition: 'box-shadow 0.2s',
  },
  emptyState: { textAlign: 'center', padding: '60px 24px', color: 'var(--text-muted)', fontSize: 14 },
  meta: { fontSize: 12, color: 'var(--text-muted)' },
};