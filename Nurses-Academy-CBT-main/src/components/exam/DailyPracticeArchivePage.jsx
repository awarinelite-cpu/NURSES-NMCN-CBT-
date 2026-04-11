// src/components/exam/DailyPracticeArchivePage.jsx
// Route: /daily-practice-archive

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, getDocs, query, orderBy,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

export default function DailyPracticeArchivePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step,     setStep]     = useState(1);
  const [category, setCategory] = useState(null);
  const [archive,  setArchive]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(query(
          collection(db, 'users', user.uid, 'dailyPracticeArchive'),
          orderBy('createdAt', 'desc'),
        ));
        setArchive(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error('DailyPracticeArchivePage load error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const countsByCategory = {};
  archive.forEach(ex => {
    countsByCategory[ex.category] = (countsByCategory[ex.category] || 0) + 1;
  });

  const categoryExams = archive.filter(ex => ex.category === category?.id);
  const filtered = categoryExams.filter(ex => {
    if (!search) return true;
    const d = new Date(ex.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });
    return (
      d.toLowerCase().includes(search.toLowerCase()) ||
      ex.categoryLabel?.toLowerCase().includes(search.toLowerCase())
    );
  });

  const handleRetake = (exam) => {
    const p = new URLSearchParams({
      category:  exam.category,
      examType:  'daily_practice',
      count:     String(exam.count     || 20),
      timeLimit: String(exam.timeLimit || 30),
      shuffle:   String(exam.shuffle !== false),
      showExpl:  'false',
      archiveId: exam.archiveId || exam.id,
      retake:    'true',
    });
    navigate(`/exam/session?${p.toString()}`);
  };

  const handleReview = (exam) => {
    const p = new URLSearchParams({
      archiveId: exam.archiveId || exam.id,
      category:  exam.category,
      examType:  'daily_practice',
      createdAt: exam.createdAt || '',
      mode:      'review',
    });
    navigate(`/exam/review?${p.toString()}`);
  };

  // ── STEP 1 — Category Picker ──────────────────────────────────────────────
  if (step === 1) {
    return (
      <div style={{ padding: '24px', maxWidth: 900 }}>
        <div style={{ marginBottom: 28 }}>
          <button onClick={() => navigate('/daily-practice')} style={styles.backBtn}>
            ← Back to Daily Practice
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 32 }}>📚</span>
            <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
              Daily Practice Archive
            </h2>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
            Choose a nursing category to view your saved practice exams.
          </p>
        </div>

        {loading ? (
          <div style={styles.emptyState}><span className="spinner" /> Loading archive…</div>
        ) : archive.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>📭</div>
            <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text-primary)', marginBottom: 8 }}>
              No archived exams yet
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 360, margin: '0 auto 24px' }}>
              Complete a Daily Practice quiz and it will automatically appear here.
            </div>
            <button className="btn btn-primary" onClick={() => navigate('/daily-practice')}>
              ⚡ Start a Quiz
            </button>
          </div>
        ) : (
          <>
            <div style={styles.sectionHead}>🏥 Choose a Nursing Category</div>
            <div style={styles.catGrid}>
              {NURSING_CATEGORIES.map(cat => {
                const count = countsByCategory[cat.id] || 0;
                if (count === 0) return null;
                return (
                  <button
                    key={cat.id}
                    onClick={() => { setCategory(cat); setStep(2); }}
                    style={{
                      ...styles.catCard,
                      borderColor: `${cat.color}60`,
                      background: `${cat.color}0D`,
                    }}
                  >
                    <div style={{ ...styles.catAccent, background: cat.color }} />
                    <div style={{ ...styles.catIconBox, background: `${cat.color}20` }}>
                      <span style={{ fontSize: 26 }}>{cat.icon}</span>
                    </div>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>
                        {cat.shortLabel}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {count} exam{count !== 1 ? 's' : ''} archived
                      </div>
                    </div>
                    <span style={{ color: cat.color, fontSize: 18, fontWeight: 900 }}>→</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  // ── STEP 2 — Exam list ────────────────────────────────────────────────────
  const takenCount  = categoryExams.filter(e => e.attemptCount > 0).length;
  const notYetCount = categoryExams.filter(e => !e.attemptCount || e.attemptCount === 0).length;
  const avgScore    = takenCount > 0
    ? Math.round(categoryExams.filter(e => e.attemptCount > 0)
        .reduce((s, e) => s + (e.lastScore || 0), 0) / takenCount)
    : null;

  return (
    <div style={{ padding: '24px', maxWidth: 900 }}>
      <button onClick={() => { setStep(1); setSearch(''); }} style={styles.backBtn}>
        ← Back to Categories
      </button>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24,
        padding: '16px 20px',
        background: `${category.color}12`,
        border: `1.5px solid ${category.color}30`,
        borderRadius: 14,
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14, flexShrink: 0,
          background: `${category.color}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
        }}>
          {category.icon}
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text-primary)' }}>
            {category.label}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {categoryExams.length} exam{categoryExams.length !== 1 ? 's' : ''} archived
          </div>
        </div>
      </div>

      {categoryExams.length > 0 && (
        <div style={styles.statsStrip}>
          <StatCard emoji="📚" label="Archived"  value={categoryExams.length} />
          <StatCard emoji="✅" label="Taken"      value={takenCount}   color="var(--green)" />
          <StatCard emoji="🔵" label="Not Taken"  value={notYetCount}  color="#3B82F6" />
          <StatCard emoji="📊" label="Avg Score"
            value={avgScore !== null ? `${avgScore}%` : '—'}
            color={avgScore >= 70 ? 'var(--green)' : avgScore >= 50 ? '#F59E0B' : avgScore !== null ? '#EF4444' : 'var(--text-muted)'}
          />
        </div>
      )}

      <div style={styles.legend}>
        <span style={{ ...styles.legendDot, background: '#3B82F6' }} /> Not taken yet &nbsp;&nbsp;
        <span style={{ ...styles.legendDot, background: '#16A34A' }} /> Taken
      </div>

      <input
        className="form-input"
        style={{ width: '100%', maxWidth: 320, marginBottom: 20, height: 40 }}
        placeholder="🔍 Search by date…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {filtered.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>No exams found</div>
          {search && (
            <button className="btn btn-ghost btn-sm" onClick={() => setSearch('')}>Clear search</button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(exam => {
            const taken       = exam.attemptCount > 0;
            const scoreColor  = exam.lastScore >= 70 ? 'var(--green)' : exam.lastScore >= 50 ? '#F59E0B' : '#EF4444';
            const borderColor = taken ? '#16A34A' : '#3B82F6';

            const createdDate = exam.createdAt
              ? new Date(exam.createdAt).toLocaleDateString('en-NG', {
                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                })
              : 'Unknown date';
            const createdTime = exam.createdAt
              ? new Date(exam.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
              : '';

            return (
              <div key={exam.id} style={{
                ...styles.examCard,
                borderLeft: `4px solid ${borderColor}`,
                background: taken ? 'rgba(22,163,74,0.04)' : 'rgba(59,130,246,0.04)',
              }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>

                  <div style={{
                    width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                    background: taken ? 'rgba(22,163,74,0.12)' : 'rgba(59,130,246,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                  }}>
                    {taken ? '✅' : '🔵'}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                        {createdDate}
                      </span>
                      {taken
                        ? <span style={badgeStyle('#16A34A')}>✅ Taken</span>
                        : <span style={badgeStyle('#3B82F6')}>🔵 Not taken</span>
                      }
                    </div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <span style={styles.meta}>🕐 {createdTime}</span>
                      <span style={styles.meta}>❓ {exam.count || 20} questions</span>
                      <span style={styles.meta}>⏱ {exam.timeLimit || 30} mins</span>
                      {taken && (
                        <>
                          <span style={{ ...styles.meta, color: scoreColor, fontWeight: 700 }}>
                            📊 Last: {exam.lastScore}%
                          </span>
                          <span style={styles.meta}>
                            🔁 {exam.attemptCount} attempt{exam.attemptCount !== 1 ? 's' : ''}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    {taken && (
                      <button className="btn btn-primary btn-sm" onClick={() => handleReview(exam)}>
                        👁 Review
                      </button>
                    )}
                    <button
                      className={`btn btn-sm ${taken ? 'btn-ghost' : 'btn-primary'}`}
                      onClick={() => handleRetake(exam)}
                    >
                      {taken ? '🔁 Retake' : '▶ Start'}
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

const badgeStyle = (color) => ({
  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
  background: `${color}18`, color, border: `1px solid ${color}40`,
});

const styles = {
  backBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--teal)', fontWeight: 700, fontSize: 13,
    padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6,
  },
  sectionHead: {
    fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16,
  },
  catGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12,
  },
  catCard: {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '16px 18px', borderRadius: 14,
    border: '1.5px solid', cursor: 'pointer',
    fontFamily: 'inherit', transition: 'all 0.2s',
    position: 'relative', overflow: 'hidden',
    background: 'var(--bg-card)',
  },
  catAccent: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: 4, borderRadius: '4px 0 0 4px',
  },
  catIconBox: {
    width: 48, height: 48, borderRadius: 12, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  statsStrip: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 },
  statCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '12px 18px',
    display: 'flex', alignItems: 'center', gap: 10,
    flex: '1 1 110px', minWidth: 100,
  },
  legend: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, fontWeight: 600,
  },
  legendDot: {
    display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
  },
  examCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 14, padding: '16px 20px', transition: 'box-shadow 0.2s',
  },
  meta: { fontSize: 12, color: 'var(--text-muted)' },
  emptyState: { textAlign: 'center', padding: '60px 24px', color: 'var(--text-muted)', fontSize: 14 },
};