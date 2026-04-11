// src/components/exam/MockReviewStoragePage.jsx
//
// Route suggestion:  /exam/mock-reviews
// Shows all Mock Exams the student has completed.
// From here they can Review (read-only) or Retake (fresh attempt).

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, getDocs, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

export default function MockReviewStoragePage() {
  const { profile } = useAuth();
  const navigate    = useNavigate();

  const [exams,      setExams]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [filterCat,  setFilterCat]  = useState('');
  const [filterDiff, setFilterDiff] = useState('');
  const [search,     setSearch]     = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const completed = profile?.completedExams || [];
        if (completed.length === 0) { setExams([]); setLoading(false); return; }

        const results = [];
        for (let i = 0; i < completed.length; i += 30) {
          const chunk = completed.slice(i, i + 30);
          const q = query(
            collection(db, 'scheduledExams'),
            where('__name__', 'in', chunk),
            where('type', '==', 'mock_exam')
          );
          const snap = await getDocs(q);
          snap.docs.forEach(d => results.push({ id: d.id, ...d.data() }));
        }

        results.sort((a, b) =>
          (a.createdAt || '') < (b.createdAt || '') ? 1 : -1
        );
        setExams(results);
      } catch (e) {
        console.error('MockReviewStoragePage error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [profile]);

  const scores = profile?.examScores || {};

  const filtered = exams.filter(ex => {
    if (filterCat  && ex.category  !== filterCat)  return false;
    if (filterDiff && ex.difficulty !== filterDiff) return false;
    if (search && !ex.title?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const avgScore  = exams.length
    ? Math.round(exams.reduce((s, e) => s + (scores[e.id] ?? 0), 0) / exams.length)
    : null;
  const passCount = exams.filter(e => (scores[e.id] ?? 0) >= 70).length;

  const getCat     = (id) => NURSING_CATEGORIES.find(c => c.id === id);
  const diffColor  = { easy: '#16A34A', medium: '#D97706', hard: '#DC2626' };

  const handleReview = (exam) => {
    const p = new URLSearchParams({
      scheduledExamId: exam.id,
      category: exam.category || 'general_nursing',
      examType: 'mock_exam',
      mode: 'review',
    });
    navigate(`/exam/review?${p.toString()}`);
  };

  const handleRetake = (exam) => {
    if (!profile?.subscribed) {
      alert('Mock Exams require a subscription. Please upgrade your plan.');
      return;
    }
    const p = new URLSearchParams({
      scheduledExamId: exam.id,
      category:  exam.category      || 'general_nursing',
      examType:  'mock_exam',
      count:     exam.questionCount || 100,
      timeLimit: exam.timeLimit     || 180,
      shuffle:   'false',
      showExpl:  'false',
      retake:    'true',
    });
    navigate(`/exam/session?${p.toString()}`);
  };

  return (
    <div style={{ padding: '24px', maxWidth: 960 }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 32 }}>📝</span>
          <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
            Mock Exams — Reviews
          </h2>
          {!profile?.subscribed && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
              background: '#7C3AED20', color: '#7C3AED', border: '1px solid #7C3AED40',
            }}>
              👑 Premium
            </span>
          )}
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          All your completed mock exams saved here. Review every question or retake for a better score.
        </p>
      </div>

      {/* ── Stats strip ── */}
      {exams.length > 0 && (
        <div style={styles.statsStrip}>
          <StatCard emoji="✅" label="Completed"     value={exams.length} />
          <StatCard emoji="🏆" label="Passed (≥70%)" value={passCount} color="var(--green)" />
          <StatCard
            emoji="📊"
            label="Avg Score"
            value={avgScore !== null ? `${avgScore}%` : '—'}
            color={avgScore >= 70 ? 'var(--green)' : avgScore >= 50 ? '#F59E0B' : '#EF4444'}
          />
        </div>
      )}

      {/* ── Filters ── */}
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
        <select
          className="form-input form-select"
          style={{ maxWidth: 160, height: 38 }}
          value={filterDiff}
          onChange={e => setFilterDiff(e.target.value)}
        >
          <option value="">All Difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div style={styles.emptyState}>
          <span className="spinner" /> Loading your reviews…
        </div>

      ) : exams.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>📭</div>
          <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text-primary)', marginBottom: 8 }}>
            No completed mock exams yet
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 380, margin: '0 auto 24px' }}>
            Once you complete a mock exam, it will be stored here for review. Mock exams require a Premium subscription.
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => navigate('/exam/mock')}>
              📝 Go to Mock Exams
            </button>
            {!profile?.subscribed && (
              <button className="btn btn-ghost" onClick={() => navigate('/subscription')}>
                👑 Upgrade to Premium
              </button>
            )}
          </div>
        </div>

      ) : filtered.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: 'var(--text-primary)' }}>
            No matches found
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
            Try a different search term, category, or difficulty.
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => { setSearch(''); setFilterCat(''); setFilterDiff(''); }}
          >
            Clear filters
          </button>
        </div>

      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 16 }}>
          {filtered.map(exam => {
            const cat      = getCat(exam.category);
            const score    = scores[exam.id];
            const hasScore = score !== undefined && score !== null;
            const scoreColor = hasScore
              ? score >= 70 ? 'var(--green)' : score >= 50 ? '#F59E0B' : '#EF4444'
              : 'var(--border)';
            const dc = diffColor[exam.difficulty] || '#64748B';

            return (
              <div key={exam.id} style={styles.card}>

                {/* Top stripe */}
                <div style={{
                  height: 4, borderRadius: '12px 12px 0 0',
                  background: cat
                    ? `linear-gradient(90deg, ${cat.color}, ${cat.color}80)`
                    : 'var(--teal)',
                  margin: '-16px -20px 16px',
                }} />

                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>

                  {/* Icon */}
                  <div style={{
                    width: 50, height: 50, borderRadius: 13, flexShrink: 0,
                    background: cat ? `${cat.color}20` : 'var(--bg-tertiary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22,
                  }}>
                    {cat?.icon || '📝'}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>

                    {/* Title + badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                        {exam.title || `Mock Exam — ${exam.category}`}
                      </span>
                      {hasScore && (
                        <span style={badge(scoreColor)}>
                          {score >= 70 ? '✅' : '❌'} {score}%
                        </span>
                      )}
                    </div>

                    {/* Meta */}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                      <span style={styles.meta}>{cat?.shortLabel || exam.category}</span>
                      <span style={styles.meta}>❓ {exam.questionCount || 100} questions</span>
                      <span style={styles.meta}>⏱ {exam.timeLimit || 180} mins</span>
                      {exam.difficulty && (
                        <span style={{ ...styles.meta, color: dc, fontWeight: 700 }}>
                          ● {exam.difficulty.charAt(0).toUpperCase() + exam.difficulty.slice(1)}
                        </span>
                      )}
                    </div>

                    {exam.description && (
                      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
                        {exam.description}
                      </p>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleReview(exam)}
                        style={{ flex: 1 }}
                      >
                        👁 Review
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleRetake(exam)}
                        style={{ flex: 1 }}
                      >
                        🔁 Retake
                      </button>
                    </div>

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

function StatCard({ emoji, label, value, color }) {
  return (
    <div style={styles.statCard}>
      <span style={{ fontSize: 20 }}>{emoji}</span>
      <div>
        <div style={{ fontWeight: 800, fontSize: 18, color: color || 'var(--text-primary)', lineHeight: 1.1 }}>
          {value}
        </div>
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
    flex: '1 1 130px', minWidth: 110,
  },
  filterBar: { display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' },
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
