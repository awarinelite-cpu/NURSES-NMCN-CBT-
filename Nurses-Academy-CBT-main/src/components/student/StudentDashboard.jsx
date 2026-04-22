// src/components/student/StudentDashboard.jsx
import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  collection, query, where, orderBy, limit,
  getDocs, deleteDoc, doc,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

// ── helper: human-readable exam type label ────────────────────────────────────
function examTypeLabel(type) {
  switch (type) {
    case 'course_drill':   return '📖 Course Drill';
    case 'topic_drill':    return '🎯 Topic Drill';
    case 'daily_practice': return '⚡ Daily Practice';
    case 'mock_exam':      return '📋 Mock Exam';
    case 'past_questions': return '📜 Past Questions';
    default:               return type?.replace(/_/g, ' ') || 'Exam';
  }
}

// ── PausedExamsModal ──────────────────────────────────────────────────────────
function PausedExamsModal({ paused, onResume, onDelete, onClose }) {
  return (
    <div style={M.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={M.modal}>
        <div style={M.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>▶️</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-primary)' }}>Continue an Exam</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {paused.length} paused exam{paused.length !== 1 ? 's' : ''} waiting
              </div>
            </div>
          </div>
          <button onClick={onClose} style={M.closeBtn}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto', paddingRight: 2 }}>
          {paused.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
              <div style={{ fontWeight: 700 }}>No paused exams</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Exit an exam using "Exit &amp; Save" to continue it later.</div>
            </div>
          ) : paused.map(p => {
            const progress = p.totalQuestions > 0
              ? Math.round(((p.answeredCount || 0) / p.totalQuestions) * 100)
              : 0;
            const savedAt = p.savedAt?.toDate
              ? p.savedAt.toDate()
              : p.savedAt ? new Date(p.savedAt) : null;
            const dateStr = savedAt
              ? savedAt.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
              : '—';
            const timeStr = savedAt
              ? savedAt.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
              : '';

            return (
              <div key={p.id} style={M.card}>
                <div style={{ ...M.cardAccent, background: 'var(--teal)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.3 }}>
                    {p.examName || 'Untitled Exam'}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    <span style={M.tag}>{examTypeLabel(p.examType)}</span>
                    {p.courseLabel && (
                      <span style={{ ...M.tag, background: 'rgba(37,99,235,0.12)', color: '#60A5FA' }}>
                        📚 {p.courseLabel}
                      </span>
                    )}
                    {p.topic && (
                      <span style={{ ...M.tag, background: 'rgba(124,58,237,0.12)', color: '#A78BFA' }}>
                        📌 {p.topic}
                      </span>
                    )}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Q{(p.currentQuestion || 0) + 1} of {p.totalQuestions} · {p.answeredCount || 0} answered
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 700 }}>{progress}%</span>
                    </div>
                    <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 2, background: 'var(--teal)',
                        width: `${progress}%`, transition: 'width 0.4s',
                      }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    💾 Saved {dateStr}{timeStr ? ` · ${timeStr}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                  <button onClick={() => onResume(p)} style={M.resumeBtn}>▶ Resume</button>
                  <button onClick={() => onDelete(p.id)} style={M.deleteBtn}>🗑 Discard</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const M = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  modal: {
    background: 'var(--bg-card)', border: '1.5px solid var(--border)',
    borderRadius: 20, padding: 24, width: '100%', maxWidth: 560,
    maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: 16,
    boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingBottom: 16, borderBottom: '1px solid var(--border)',
  },
  closeBtn: {
    background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
    borderRadius: 8, width: 32, height: 32, cursor: 'pointer',
    color: 'var(--text-muted)', fontSize: 14, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  card: {
    display: 'flex', alignItems: 'flex-start', gap: 12,
    background: 'var(--bg-primary)', border: '1.5px solid var(--border)',
    borderRadius: 14, padding: '14px 14px 14px 18px',
    position: 'relative', overflow: 'hidden',
  },
  cardAccent: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: 4, borderRadius: '4px 0 0 4px',
  },
  tag: {
    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
    background: 'rgba(13,148,136,0.12)', color: 'var(--teal)',
  },
  resumeBtn: {
    padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
    background: 'var(--teal)', border: 'none',
    color: '#fff', fontWeight: 700, fontSize: 12, fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  deleteBtn: {
    padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
    background: 'transparent', border: '1px solid rgba(239,68,68,0.4)',
    color: '#EF4444', fontWeight: 600, fontSize: 11, fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
};

// ── Main Component ────────────────────────────────────────────────────────────
export default function StudentDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [recentSessions, setRecentSessions] = useState([]);
  const [pausedExams,    setPausedExams]    = useState([]);
  const [showModal,      setShowModal]      = useState(false);
  const [loading,        setLoading]        = useState(true);

  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      // ── Query 1: Recent exam sessions ──────────────────────────────────────
      // Isolated in its own try/catch so a Firestore index error here
      // does NOT prevent the rest of the dashboard from rendering.
      try {
        const sessSnap = await getDocs(query(
          collection(db, 'examSessions'),
          where('userId', '==', user.uid),
          orderBy('completedAt', 'desc'),
          limit(5),
        ));
        setRecentSessions(sessSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.warn('examSessions load failed (non-fatal):', e.message);
        // Dashboard still renders — Recent Exams section just stays hidden
      }

      // ── Query 2: Paused exams ──────────────────────────────────────────────
      // Isolated in its own try/catch — collection won't exist until the first
      // "Exit & Save" is triggered, so failure here is completely expected.
      try {
        const pausedSnap = await getDocs(query(
          collection(db, 'pausedExams'),
          where('userId', '==', user.uid),
        ));
        const paused = pausedSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Sort newest-first client-side (no composite index needed)
        paused.sort((a, b) => {
          const ta = a.savedAt?.toDate?.()?.getTime?.() || 0;
          const tb = b.savedAt?.toDate?.()?.getTime?.() || 0;
          return tb - ta;
        });
        setPausedExams(paused);
      } catch (e) {
        console.warn('pausedExams load failed (non-fatal):', e.message);
        // Fine — no paused exams to show yet
      }

      setLoading(false);
    };

    loadData();
  }, [user]);

  // Resume a paused exam
  const handleResume = useCallback((paused) => {
    setShowModal(false);
    navigate('/exam/session', {
      state: {
        resumeMode:     true,
        pausedExamId:   paused.id,
        poolMode:       paused.poolMode   ?? true,
        examType:       paused.examType,
        examName:       paused.examName,
        category:       paused.category,
        course:         paused.course,
        courseLabel:    paused.courseLabel,
        topic:          paused.topic,
        examId:         paused.examId     || '',
        count:          paused.totalQuestions,
        doShuffle:      false,
        timeLimit:      paused.timeLimit  || 0,
        resumeData: {
          questionIds:     paused.questionIds,
          answers:         paused.answers,
          currentQuestion: paused.currentQuestion || 0,
          totalQuestions:  paused.totalQuestions,
          flagged:         paused.flagged || [],
        },
      },
    });
  }, [navigate]);

  // Discard a paused exam
  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('Discard this paused exam? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'pausedExams', id));
      setPausedExams(prev => prev.filter(p => p.id !== id));
    } catch (e) { console.error('Delete paused exam error:', e); }
  }, []);

  const totalExams = profile?.totalExams || 0;
  const totalScore = profile?.totalScore || 0;
  const avgScore   = totalExams > 0 ? Math.round(totalScore / totalExams) : 0;
  const streak     = profile?.streak        || 0;
  const bookmarks  = profile?.bookmarkCount || 0;

  const hour  = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div style={{ padding: '24px', maxWidth: 1200 }}>

      {/* Paused exams modal */}
      {showModal && (
        <PausedExamsModal
          paused={pausedExams}
          onResume={handleResume}
          onDelete={handleDelete}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Greeting banner */}
      <div style={styles.banner}>
        <div style={styles.bannerGlow} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
            🏥 NMCN CBT Platform
          </div>
          <h2 style={{ color: '#fff', fontFamily: "'Playfair Display', serif", fontSize: 'clamp(1.3rem,3vw,1.8rem)', margin: 0 }}>
            {greet}, {(profile?.name || user?.displayName || 'Student').split(' ')[0]}! 👋
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, margin: '6px 0 0' }}>
            {profile?.subscribed
              ? '🌟 Premium subscriber — all content unlocked'
              : '🎯 Free plan — upgrade to unlock all past questions'}
          </p>
        </div>

        <div style={styles.bannerActions}>
          <Link to="/quick-actions" className="btn btn-gold btn-sm">⚡ Start Exam</Link>

          <button
            onClick={() => setShowModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 16px', borderRadius: 10, cursor: 'pointer',
              background: pausedExams.length > 0 ? 'rgba(13,148,136,0.25)' : 'rgba(255,255,255,0.08)',
              border: `1.5px solid ${pausedExams.length > 0 ? 'rgba(13,148,136,0.6)' : 'rgba(255,255,255,0.25)'}`,
              color: pausedExams.length > 0 ? '#5EEAD4' : 'rgba(255,255,255,0.6)',
              fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
              transition: 'all 0.2s',
            }}
          >
            ▶ Continue Exam
            {pausedExams.length > 0 && (
              <span style={{
                background: 'var(--teal)', color: '#fff',
                borderRadius: 20, fontSize: 10, fontWeight: 900,
                padding: '1px 7px', minWidth: 18, textAlign: 'center',
              }}>
                {pausedExams.length}
              </span>
            )}
          </button>

          {!profile?.subscribed && (
            <Link to="/subscription" className="btn btn-outline btn-sm" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}>
              Upgrade Plan
            </Link>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div style={styles.statsGrid}>
        {[
          { icon: '📝', label: 'Exams Taken', value: totalExams,     color: '#0D9488', bg: 'rgba(13,148,136,0.12)', to: null },
          { icon: '📊', label: 'Avg. Score',  value: `${avgScore}%`, color: '#2563EB', bg: 'rgba(37,99,235,0.12)',  to: null },
          { icon: '🔥', label: 'Day Streak',  value: streak,         color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', to: null },
          { icon: '🔖', label: 'Bookmarked',  value: bookmarks,      color: '#7C3AED', bg: 'rgba(124,58,237,0.12)', to: '/bookmarks' },
        ].map(s => {
          const inner = (
            <>
              <div className="stat-icon" style={{ background: s.bg }}>
                <span>{s.icon}</span>
              </div>
              <div>
                <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            </>
          );
          return s.to ? (
            <Link key={s.label} to={s.to} className="stat-card" style={{ textDecoration: 'none', cursor: 'pointer' }}>
              {inner}
            </Link>
          ) : (
            <div key={s.label} className="stat-card">{inner}</div>
          );
        })}
      </div>

      {/* Paused exams inline banner */}
      {pausedExams.length > 0 && (
        <div
          onClick={() => setShowModal(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 14,
            background: 'rgba(13,148,136,0.08)', border: '1.5px solid rgba(13,148,136,0.3)',
            borderRadius: 14, padding: '14px 18px', marginBottom: 24,
            cursor: 'pointer',
          }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: 'rgba(13,148,136,0.15)', border: '1.5px solid rgba(13,148,136,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
          }}>▶️</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>
              You have {pausedExams.length} paused exam{pausedExams.length !== 1 ? 's' : ''}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {pausedExams[0]?.examName || 'Exam'} · click to resume
            </div>
          </div>
          <span style={{ color: 'var(--teal)', fontWeight: 800, fontSize: 16 }}>→</span>
        </div>
      )}

      {/* Quick actions */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ ...styles.sectionTitle, marginBottom: 14 }}>⚡ Quick Actions</h3>
        <div style={styles.quickGrid}>
          <Link to="/daily-practice" style={styles.quickCard}>
            <span style={{ fontSize: 28 }}>⚡</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Daily Practice</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -4, lineHeight: 1.3 }}>Take daily exam</span>
          </Link>
          <Link to="/course-drill" style={styles.quickCard}>
            <span style={{ fontSize: 28 }}>📖</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Course Drill</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -4, lineHeight: 1.3 }}>Take exam by courses</span>
          </Link>
          <Link to="/topic-drill" style={styles.quickCard}>
            <span style={{ fontSize: 28 }}>🎯</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Topic Drill</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -4, lineHeight: 1.3 }}>Take exam by topics</span>
          </Link>
          <Link to="/mock-exams" style={styles.quickCard}>
            <span style={{ fontSize: 28 }}>📋</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Mock Exams</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -4, lineHeight: 1.3 }}>Study daily Hospital Final exam</span>
          </Link>
          <Link to="/past-questions" style={styles.quickCard}>
            <span style={{ fontSize: 28 }}>📜</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Past Questions</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -4, lineHeight: 1.3 }}>Study NMCN past questions</span>
          </Link>
          <Link to="/bookmarks" style={styles.quickCard}>
            <span style={{ fontSize: 28 }}>🔖</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Bookmarks</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -4, lineHeight: 1.3 }}>Review your Bookmarked questions</span>
          </Link>
        </div>
      </div>

      {/* Categories */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={styles.sectionTitle}>🏥 Exam Categories</h3>
        </div>
        <div style={styles.categoriesGrid}>
          {NURSING_CATEGORIES.slice(0, 8).map(cat => (
            <div key={cat.id} style={styles.catCard}>
              <div style={{ ...styles.catIcon, background: `${cat.color}22` }}>
                {cat.icon}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{cat.shortLabel}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {cat.examType === 'basic' ? 'Basic RN' : 'Post Basic'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent sessions */}
      {recentSessions.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={styles.sectionTitle}>🕓 Recent Exams</h3>
            <Link to="/results" style={{ color: 'var(--teal)', fontSize: 13, fontWeight: 700 }}>All results →</Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Category</th><th>Type</th><th>Score</th><th>Date</th><th></th></tr>
              </thead>
              <tbody>
                {recentSessions.map(s => {
                  const cat = NURSING_CATEGORIES.find(c => c.id === s.category);
                  return (
                    <tr key={s.id}>
                      <td>{cat?.icon} {cat?.shortLabel || s.category}</td>
                      <td><span className="badge badge-teal">{s.examType}</span></td>
                      <td>
                        <span style={{
                          fontWeight: 700, color:
                            s.scorePercent >= 70 ? 'var(--green)' :
                            s.scorePercent >= 50 ? 'var(--gold)'  : 'var(--red)',
                        }}>
                          {s.scorePercent || 0}%
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {s.completedAt?.toDate
                          ? new Date(s.completedAt.toDate()).toLocaleDateString()
                          : 'Recently'}
                      </td>
                      <td>
                        <Link
                          to={`/exam/review?resultId=${s.id}&category=${s.category}&examType=${s.examType}`}
                          className="btn btn-ghost btn-sm"
                        >Review</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex-center" style={{ padding: 40 }}>
          <div className="spinner" />
        </div>
      )}
    </div>
  );
}

const styles = {
  banner: {
    background: 'linear-gradient(135deg, #1E3A8A 0%, #0D9488 100%)',
    borderRadius: 20, padding: '28px 32px', marginBottom: 28,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexWrap: 'wrap', gap: 16, position: 'relative', overflow: 'hidden',
  },
  bannerGlow: {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    background: 'radial-gradient(ellipse at 70% 50%, rgba(245,158,11,0.15) 0%, transparent 60%)',
  },
  bannerActions: { display: 'flex', gap: 10, flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' },
  statsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 16, marginBottom: 32,
  },
  sectionTitle: {
    fontFamily: "'Playfair Display', serif", fontSize: '1.1rem',
    color: 'var(--text-primary)', margin: 0,
  },
  quickGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 12, marginTop: 14,
  },
  quickCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    padding: '20px 16px', background: 'var(--bg-card)',
    border: '1.5px solid var(--border)', borderRadius: 14,
    textDecoration: 'none', color: 'var(--text-primary)',
    transition: 'var(--transition)', textAlign: 'center',
    cursor: 'pointer', position: 'relative',
  },
  categoriesGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 12,
  },
  catCard: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '14px 16px', background: 'var(--bg-card)',
    border: '1.5px solid var(--border)', borderRadius: 12,
  },
  catIcon: {
    width: 40, height: 40, borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20, flexShrink: 0,
  },
};
