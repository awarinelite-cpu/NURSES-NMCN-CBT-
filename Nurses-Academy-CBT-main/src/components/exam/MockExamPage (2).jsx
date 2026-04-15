// src/components/exam/MockExamPage.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, getDocs, query, orderBy, where
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

export default function MockExamPage() {
  const { profile } = useAuth();
  const navigate    = useNavigate();

  const [exams,      setExams]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [filterCat,  setFilterCat]  = useState('');
  const [filterDiff, setFilterDiff] = useState('');
  const [search,     setSearch]     = useState('');
  const [activeTab,  setActiveTab]  = useState('all'); // 'all' | 'new' | 'done'

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, 'scheduledExams'),
          where('type', '==', 'mock_exam'),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        setExams(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const isDone  = (id) => profile?.completedExams?.includes(id);

  const filtered = exams.filter(ex => {
    if (filterCat  && ex.category   !== filterCat)   return false;
    if (filterDiff && ex.difficulty  !== filterDiff)  return false;
    if (search && !ex.title?.toLowerCase().includes(search.toLowerCase())) return false;
    if (activeTab === 'new')  return !isDone(ex.id);
    if (activeTab === 'done') return  isDone(ex.id);
    return true;
  });

  const handleStart = (exam) => {
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
    });
    navigate(`/exam/session?${p.toString()}`);
  };

  const getCat   = (id) => NURSING_CATEGORIES.find(c => c.id === id);
  const diffColor = { easy: '#16A34A', medium: '#D97706', hard: '#DC2626' };

  return (
    <div style={{ padding: '24px', maxWidth: 960 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 32 }}>📝</span>
          <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
            Mock Examinations
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
          Full-length timed mock exams that simulate the real NMCN board experience. All exams are saved — take them anytime.
        </p>
      </div>

      {/* Premium banner */}
      {!profile?.subscribed && (
        <div style={{
          background: 'linear-gradient(135deg, #7C3AED18, #2563EB18)',
          border: '1px solid #7C3AED40', borderRadius: 14,
          padding: '16px 20px', marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <span style={{ fontSize: 28 }}>👑</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
              Upgrade to access Mock Exams
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Full-length simulated board exams with detailed performance reports. From ₦5,000/90 days.
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/subscription')}
            style={{ flexShrink: 0 }}
          >
            Upgrade Now
          </button>
        </div>
      )}

      {/* Tabs */}
      <div style={styles.tabBar}>
        {[
          { id: 'all',  label: '📋 All',       count: exams.length },
          { id: 'new',  label: '🆕 Not Done',   count: exams.filter(e => !isDone(e.id)).length },
          { id: 'done', label: '✅ Completed',  count: exams.filter(e =>  isDone(e.id)).length },
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

      {/* Filters */}
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

      {/* Content */}
      {loading ? (
        <div style={styles.emptyState}>
          <span className="spinner" /> Loading mock exams…
        </div>
      ) : filtered.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No exams found</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            {activeTab === 'done'
              ? "You haven't completed any mock exams yet."
              : "No mock exams available yet. Check back soon!"}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 16 }}>
          {filtered.map(exam => {
            const cat  = getCat(exam.category);
            const done = isDone(exam.id);
            const dc   = diffColor[exam.difficulty] || '#64748B';

            return (
              <div
                key={exam.id}
                style={{
                  ...styles.card,
                  opacity: !profile?.subscribed ? 0.7 : 1,
                }}
              >
                {/* Top stripe */}
                <div style={{
                  height: 4, borderRadius: '12px 12px 0 0',
                  background: cat ? `linear-gradient(90deg, ${cat.color}, ${cat.color}80)` : 'var(--teal)',
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
                    {/* Title */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                        {exam.title || `Mock Exam — ${exam.category}`}
                      </span>
                      {done && <span style={badge('#16A34A')}>✅ Done</span>}
                      {!profile?.subscribed && <span style={badge('#7C3AED')}>👑</span>}
                    </div>

                    {/* Meta row */}
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

                    {/* Description */}
                    {exam.description && (
                      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
                        {exam.description}
                      </p>
                    )}

                    {/* Score if done */}
                    {done && profile?.examScores?.[exam.id] !== undefined && (
                      <div style={{
                        background: 'var(--bg-tertiary)', borderRadius: 8,
                        padding: '8px 12px', marginBottom: 12,
                        display: 'flex', gap: 16,
                      }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          Last score: <strong style={{ color: 'var(--teal)' }}>
                            {profile.examScores[exam.id]}%
                          </strong>
                        </span>
                      </div>
                    )}

                    {/* Action */}
                    <button
                      className={`btn ${done ? 'btn-ghost' : 'btn-primary'} btn-sm`}
                      onClick={() => handleStart(exam)}
                      style={{ width: '100%' }}
                    >
                      {!profile?.subscribed ? '🔒 Upgrade to Start'
                        : done              ? '🔁 Retake Exam'
                        :                     '▶ Start Exam'}
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

const badge = (color) => ({
  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
  background: `${color}18`, color, border: `1px solid ${color}40`,
});

const styles = {
  tabBar: {
    display: 'flex', gap: 4,
    background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
    borderRadius: 12, padding: 4, marginBottom: 20, width: 'fit-content',
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
