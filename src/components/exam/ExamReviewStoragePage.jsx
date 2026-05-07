// src/components/exam/ExamReviewStoragePage.jsx
//
// Review Storage — lists all exams the student has completed.
// From here they can:
//   • Review  → navigate to /exam/review?scheduledExamId=... (read-only, shows answers + AI explain)
//   • Retake  → navigate to /exam/session?... (fresh attempt)
//
// Firestore reads:
//   collection: scheduledExams   (same as DailyPracticePage / MockExamPage)
//   completed IDs  : profile.completedExams[]
//   scores         : profile.examScores[examId]   (0-100 number)
//   attempt details: collection 'examAttempts' — doc per attempt (optional, wired up below)
//
// Route suggestion:  /exam/reviews
// Add to your router:
//   <Route path="/exam/reviews" element={<ExamReviewStoragePage />} />

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, getDocs, query, orderBy, where,
  doc, getDoc,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

export default function ExamReviewStoragePage() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();

  const [allExams,   setAllExams]   = useState([]);   // all scheduledExams docs
  const [loading,    setLoading]    = useState(true);
  const [activeTab,  setActiveTab]  = useState('all');  // 'all' | 'daily' | 'mock'
  const [filterCat,  setFilterCat]  = useState('');
  const [search,     setSearch]     = useState('');

  // ── Load all exams the student has completed ────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const completed = profile?.completedExams || [];
        if (completed.length === 0) { setAllExams([]); setLoading(false); return; }

        // Fetch both daily and mock in one query (Firestore 'in' supports up to 30 items)
        // For large lists, you may need to batch into chunks of 30.
        const chunks = [];
        for (let i = 0; i < completed.length; i += 30) {
          chunks.push(completed.slice(i, i + 30));
        }

        const results = [];
        for (const chunk of chunks) {
          const q = query(
            collection(db, 'scheduledExams'),
            where('__name__', 'in', chunk)
          );
          const snap = await getDocs(q);
          snap.docs.forEach(d => results.push({ id: d.id, ...d.data() }));
        }

        // Sort newest first by scheduledDate / createdAt
        results.sort((a, b) => {
          const da = a.scheduledDate || a.createdAt || '';
          const db_ = b.scheduledDate || b.createdAt || '';
          return da < db_ ? 1 : -1;
        });

        setAllExams(results);
      } catch (e) {
        console.error('ExamReviewStoragePage load error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [profile]);

  // ── Filtering ───────────────────────────────────────────────────────────────
  const filtered = allExams.filter(ex => {
    if (activeTab === 'daily' && ex.type !== 'daily_practice') return false;
    if (activeTab === 'mock'  && ex.type !== 'mock_exam')       return false;
    if (filterCat && ex.category !== filterCat) return false;
    if (search && !ex.title?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // ── Navigation helpers ──────────────────────────────────────────────────────
  const handleReview = (exam) => {
    const p = new URLSearchParams({
      scheduledExamId: exam.id,
      category:  exam.category || 'general_nursing',
      examType:  exam.type     || 'daily_practice',
      mode:      'review',
    });
    navigate(`/exam/review?${p.toString()}`);
  };

  const handleRetake = (exam) => {
    if (exam.type === 'mock_exam' && !profile?.subscribed) {
      alert('Mock Exams require a subscription. Please upgrade your plan.');
      return;
    }
    const p = new URLSearchParams({
      scheduledExamId: exam.id,
      category:  exam.category      || 'general_nursing',
      examType:  exam.type          || 'daily_practice',
      count:     exam.questionCount || (exam.type === 'mock_exam' ? 100 : 20),
      timeLimit: exam.timeLimit     || (exam.type === 'mock_exam' ? 180 : 30),
      shuffle:   exam.type === 'mock_exam' ? 'false' : 'true',
      showExpl:  exam.type === 'mock_exam' ? 'false' : 'true',
      retake:    'true',
    });
    navigate(`/exam/session?${p.toString()}`);
  };

  // ── Derived stats ───────────────────────────────────────────────────────────
  const scores     = profile?.examScores || {};
  const totalDone  = allExams.length;
  const avgScore   = totalDone
    ? Math.round(allExams.reduce((sum, e) => sum + (scores[e.id] ?? 0), 0) / totalDone)
    : null;
  const passCount  = allExams.filter(e => (scores[e.id] ?? 0) >= 70).length;

  const getCat = (id) => NURSING_CATEGORIES.find(c => c.id === id);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px', maxWidth: 960 }}>

      {/* ── Page header ──────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 32 }}>📚</span>
          <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
            Exam Review Storage
          </h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Every exam you've completed is saved here. Review your answers, get AI explanations, or retake from scratch.
        </p>
      </div>

      {/* ── Stats strip (only when there's data) ─────────────────── */}
      {totalDone > 0 && (
        <div style={styles.statsStrip}>
          <StatCard emoji="🎯" label="Completed" value={totalDone} />
          <StatCard emoji="✅" label="Passed (≥70%)" value={passCount} color="var(--green)" />
          <StatCard
            emoji="📊"
            label="Avg Score"
            value={avgScore !== null ? `${avgScore}%` : '—'}
            color={avgScore >= 70 ? 'var(--green)' : avgScore >= 50 ? '#F59E0B' : '#EF4444'}
          />
          <StatCard
            emoji="📅"
            label="Daily Done"
            value={allExams.filter(e => e.type === 'daily_practice').length}
          />
          <StatCard
            emoji="📝"
            label="Mocks Done"
            value={allExams.filter(e => e.type === 'mock_exam').length}
          />
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────── */}
      <div style={styles.tabBar}>
        {[
          { id: 'all',   label: '📋 All',            count: allExams.length },
          { id: 'daily', label: '⚡ Daily Practice',  count: allExams.filter(e => e.type === 'daily_practice').length },
          { id: 'mock',  label: '📝 Mock Exams',      count: allExams.filter(e => e.type === 'mock_exam').length },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              ...styles.tabBtn,
              background: activeTab === t.id ? 'var(--teal)' : 'transparent',
              color:      activeTab === t.id ? '#fff'        : 'var(--text-muted)',
            }}
          >
            {t.label}
            <span style={{
              marginLeft: 6, fontSize: 11, fontWeight: 700,
              background: activeTab === t.id ? 'rgba(255,255,255,0.25)' : 'var(--bg-secondary)',
              color:      activeTab === t.id ? '#fff' : 'var(--text-muted)',
              borderRadius: 20, padding: '1px 7px',
            }}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* ── Filters ──────────────────────────────────────────────── */}
      <div style={styles.filterBar}>
        <input
          className="form-input"
          style={{ maxWidth: 220, height: 38 }}
          placeholder="🔍 Search exams…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="form-input form-select"
          style={{ maxWidth: 200, height: 38 }}
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
        >
          <option value="">All Categories</option>
          {NURSING_CATEGORIES.map(c => (
            <option key={c.id} value={c.id}>{c.shortLabel}</option>
          ))}
        </select>
      </div>

      {/* ── Content ──────────────────────────────────────────────── */}
      {loading ? (
        <div style={styles.emptyState}>
          <span className="spinner" /> Loading your review storage…
        </div>

      ) : totalDone === 0 ? (
        /* ── True empty: student hasn't done any exams yet ── */
        <div style={styles.emptyState}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>📭</div>
          <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text-primary)', marginBottom: 8 }}>
            No completed exams yet
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 380, margin: '0 auto 24px' }}>
            Once you finish a Daily Practice quiz or a Mock Exam, it will appear here for review.
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => navigate('/exam/daily')}>
              ⚡ Go to Daily Practice
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/exam/mock')}>
              📝 Go to Mock Exams
            </button>
          </div>
        </div>

      ) : filtered.length === 0 ? (
        /* ── Filter returned nothing ── */
        <div style={styles.emptyState}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: 'var(--text-primary)' }}>
            No matches found
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
            Try a different search term or category.
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => { setSearch(''); setFilterCat(''); setActiveTab('all'); }}
          >
            Clear filters
          </button>
        </div>

      ) : (
        /* ── Exam list ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.map(exam => {
            const cat    = getCat(exam.category);
            const score  = scores[exam.id];
            const hasScore = score !== undefined && score !== null;
            const pass   = hasScore && score >= 70;
            const scoreColor = hasScore
              ? score >= 70 ? 'var(--green)' : score >= 50 ? '#F59E0B' : '#EF4444'
              : 'var(--text-muted)';
            const isMock = exam.type === 'mock_exam';

            return (
              <div
                key={exam.id}
                style={{
                  ...styles.card,
                  borderLeft: `4px solid ${hasScore ? scoreColor : 'var(--border)'}`,
                }}
              >
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>

                  {/* Icon */}
                  <div style={{
                    width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                    background: cat ? `${cat.color}20` : 'var(--bg-tertiary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 24,
                  }}>
                    {cat?.icon || (isMock ? '📝' : '⚡')}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>

                    {/* Title + badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                        {exam.title || (isMock ? `Mock Exam — ${exam.category}` : `Daily Practice — ${exam.scheduledDate}`)}
                      </span>
                      <span style={badge(isMock ? '#7C3AED' : 'var(--teal)')}>
                        {isMock ? '📝 Mock' : '⚡ Daily'}
                      </span>
                      {hasScore && (
                        <span style={badge(scoreColor)}>
                          {pass ? '✅' : '❌'} {score}%
                        </span>
                      )}
                    </div>

                    {/* Meta */}
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <span style={styles.meta}>{cat?.shortLabel || exam.category}</span>
                      <span style={styles.meta}>❓ {exam.questionCount || (isMock ? 100 : 20)} questions</span>
                      <span style={styles.meta}>⏱ {exam.timeLimit || (isMock ? 180 : 30)} mins</span>
                      {exam.scheduledDate && (
                        <span style={styles.meta}>📅 {exam.scheduledDate}</span>
                      )}
                      {exam.difficulty && (
                        <span style={{ ...styles.meta, color: diffColor[exam.difficulty] || 'var(--text-muted)', fontWeight: 700 }}>
                          ● {exam.difficulty.charAt(0).toUpperCase() + exam.difficulty.slice(1)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleReview(exam)}
                      title="Review your answers and get AI explanations"
                    >
                      👁 Review
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleRetake(exam)}
                      title="Start a fresh attempt"
                    >
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

// ─── Small reusable stat card ──────────────────────────────────────────────────
function StatCard({ emoji, label, value, color }) {
  return (
    <div style={styles.statCard}>
      <span style={{ fontSize: 20 }}>{emoji}</span>
      <div>
        <div style={{ fontWeight: 800, fontSize: 18, color: color || 'var(--text-primary)', lineHeight: 1.1 }}>
          {value}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
          {label}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
const diffColor = { easy: '#16A34A', medium: '#D97706', hard: '#DC2626' };

const badge = (color) => ({
  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
  background: `${color}18`, color, border: `1px solid ${color}40`,
});

const styles = {
  statsStrip: {
    display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24,
  },
  statCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '12px 18px',
    display: 'flex', alignItems: 'center', gap: 10,
    flex: '1 1 130px', minWidth: 110,
  },
  tabBar: {
    display: 'flex', gap: 4,
    background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
    borderRadius: 12, padding: 4, marginBottom: 20, width: 'fit-content',
    flexWrap: 'wrap',
  },
  tabBtn: {
    padding: '7px 16px', borderRadius: 9, border: 'none',
    cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
    fontWeight: 700, transition: 'all 0.2s', display: 'flex', alignItems: 'center',
  },
  filterBar: {
    display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center',
  },
  card: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 14, padding: '16px 20px', transition: 'box-shadow 0.2s',
  },
  emptyState: {
    textAlign: 'center', padding: '60px 24px',
    color: 'var(--text-muted)', fontSize: 14,
  },
  meta: { fontSize: 12, color: 'var(--text-muted)' },
};
