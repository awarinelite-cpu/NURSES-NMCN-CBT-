// src/components/entrance/EntranceLeaderboard.jsx
// Route: /entrance-exam/leaderboard
//
// Standalone leaderboard page.
// Reads from entranceExamSessions (root collection).
// All students who have completed any entrance exam appear here.
// Ranked by: best score → avg score → exam count.

import { useState, useEffect, useCallback } from 'react';
import { useNavigate }                       from 'react-router-dom';
import {
  collection, getDocs, query, orderBy, limit,
} from 'firebase/firestore';
import { db }      from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';

/* ── Font constants ─────────────────────────────────────────────────────────── */
const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

/* ── Helpers ────────────────────────────────────────────────────────────────── */
const gradeColor = (p) =>
  p >= 70 ? '#16A34A' : p >= 50 ? '#F59E0B' : '#EF4444';

/* ── Spinner ────────────────────────────────────────────────────────────────── */
function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
      <div style={{
        width: 44, height: 44,
        border: '3px solid var(--border)',
        borderTopColor: 'var(--teal)',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  );
}

/* ── Empty state ────────────────────────────────────────────────────────────── */
function EmptyState({ icon, title, sub, action, onAction }) {
  return (
    <div style={{ textAlign: 'center', padding: '64px 20px' }}>
      <div style={{ fontSize: 52, marginBottom: 14 }}>{icon}</div>
      <h3 style={{
        margin: '0 0 10px', fontFamily: H, fontWeight: 900,
        fontSize: 'clamp(1.3rem, 3vw, 1.8rem)', color: 'var(--text-primary)',
      }}>{title}</h3>
      <p style={{
        fontFamily: F, fontWeight: 700, fontSize: 15,
        color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.7,
      }}>{sub}</p>
      {action && (
        <button
          onClick={onAction}
          style={{
            padding: '12px 28px', background: 'var(--teal)', color: '#fff',
            border: 'none', borderRadius: 10, cursor: 'pointer',
            fontSize: 15, fontWeight: 700, fontFamily: F,
          }}
        >{action}</button>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   EntranceLeaderboard
══════════════════════════════════════════════════════════════════════════════ */
export default function EntranceLeaderboard() {
  const { user }  = useAuth();
  const navigate  = useNavigate();

  const [board,   setBoard]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [filter,  setFilter]  = useState('month');

  /* ── Fetch & build leaderboard ─────────────────────────────────────────── */
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Fetch with orderBy only — no compound filter needed, no composite index.
      // Time-window filtering is done client-side below.
      let snap;
      try {
        snap = await getDocs(
          query(
            collection(db, 'entranceExamSessions'),
            orderBy('completedAt', 'desc'),
            limit(2000),
          )
        );
      } catch {
        // Fallback: if orderBy index is also missing, fetch without ordering
        snap = await getDocs(collection(db, 'entranceExamSessions'));
      }

      // Client-side time-window cutoff
      const cutoff = new Date();
      if      (filter === 'week')  cutoff.setDate(cutoff.getDate() - 7);
      else if (filter === 'month') cutoff.setMonth(cutoff.getMonth() - 1);
      else                         cutoff.setFullYear(2000); // all time

      // Group sessions by userId
      const userMap = {};
      snap.forEach(d => {
        const s = d.data();
        if (!s.userId) return;

        // Time filter
        const completedMs =
          s.completedAt?.toDate?.()?.getTime?.() ??
          (s.completedAt ? new Date(s.completedAt).getTime() : 0);
        if (completedMs < cutoff.getTime()) return;

        // Resolve score
        const sessionScore =
          s.scorePercent ??
          (s.totalQuestions > 0
            ? Math.round(((s.correct || 0) / s.totalQuestions) * 100)
            : 0);

        if (!userMap[s.userId]) {
          userMap[s.userId] = {
            uid:    s.userId,
            name:   s.userName || s.displayName || 'Student',
            scores: [],
          };
        }
        userMap[s.userId].scores.push(sessionScore);
      });

      // Build sortable rows
      const rows = Object.values(userMap)
        .filter(u => u.scores.length > 0)
        .map(u => ({
          uid:   u.uid,
          name:  u.name,
          best:  Math.max(...u.scores),
          avg:   Math.round(u.scores.reduce((a, b) => a + b, 0) / u.scores.length),
          count: u.scores.length,
        }));

      // Sort: best score → avg → exam count
      rows.sort((a, b) =>
        b.best  - a.best  ||
        b.avg   - a.avg   ||
        b.count - a.count
      );

      setBoard(rows.slice(0, 100));
    } catch (e) {
      console.error('Leaderboard error:', e);
      setError('Could not load leaderboard. Tap Retry to try again.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  /* ── Derived values ─────────────────────────────────────────────────────── */
  const myRank = board.findIndex(r => r.uid === user?.uid) + 1; // 0 = not on board
  const medals = ['🥇', '🥈', '🥉'];

  /* ── Sub-components ─────────────────────────────────────────────────────── */
  const FilterBtn = ({ id, label }) => (
    <button
      onClick={() => setFilter(id)}
      style={{
        padding: '9px 22px', borderRadius: 20, border: 'none', cursor: 'pointer',
        fontWeight: 700, fontSize: 14, fontFamily: F,
        background: filter === id ? 'var(--teal)' : 'var(--bg-tertiary)',
        color:      filter === id ? '#fff'        : 'var(--text-muted)',
        transition: 'all 0.15s',
        boxShadow:  filter === id ? 'var(--shadow-teal)' : 'none',
      }}
    >{label}</button>
  );

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      fontFamily: F,
      color: 'var(--text-primary)',
    }}>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
        padding: '16px 24px',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <button
          onClick={() => navigate('/entrance-exam')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 22, color: 'var(--teal)', padding: 4, lineHeight: 1,
            fontWeight: 700,
          }}
        >←</button>
        <div>
          <h1 style={{
            margin: 0, fontFamily: H, fontWeight: 900,
            fontSize: 'clamp(1.4rem, 3vw, 2rem)',
            color: 'var(--text-primary)',
          }}>
            🏆 Leaderboard
          </h1>
          <p style={{
            margin: 0, fontSize: 14, fontWeight: 700,
            fontFamily: F, color: 'var(--text-muted)',
          }}>
            Top students ranked by highest exam score
          </p>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>

        {/* Filter buttons */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <FilterBtn id="week"  label="This Week"  />
          <FilterBtn id="month" label="This Month" />
          <FilterBtn id="all"   label="All Time"   />
        </div>

        {/* Your rank banner */}
        {myRank > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, var(--teal), #0891B2)',
            borderRadius: 14, padding: '16px 22px', marginBottom: 20,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: '#fff', fontFamily: F }}>
              🎯 Your Current Rank
            </span>
            <span style={{ fontSize: 28, fontWeight: 900, color: '#fff', fontFamily: H }}>
              #{myRank}
            </span>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 10, padding: '12px 16px', marginBottom: 16,
            fontSize: 14, color: '#EF4444', fontWeight: 700, fontFamily: F,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            ⚠️ {error}
            <button
              onClick={load}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#EF4444', fontWeight: 700, fontSize: 14, fontFamily: F,
              }}
            >Retry</button>
          </div>
        )}

        {/* Main content */}
        {loading ? (
          <Spinner />
        ) : board.length === 0 ? (
          <EmptyState
            icon="🏆"
            title="No data for this period"
            sub="Complete entrance exams to appear on the leaderboard."
            action="Start Practising"
            onAction={() => navigate('/entrance-exam')}
          />
        ) : (
          <>
            {/* Column headers */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '52px 44px 1fr 72px 72px 58px',
              gap: 8,
              padding: '8px 20px',
              fontSize: 11, fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: 0.6,
              fontFamily: F,
            }}>
              <span>#</span>
              <span />
              <span>Student</span>
              <span style={{ textAlign: 'right' }}>Best</span>
              <span style={{ textAlign: 'right' }}>Avg</span>
              <span style={{ textAlign: 'right' }}>Exams</span>
            </div>

            {/* Rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {board.map((r, i) => {
                const isMe = r.uid === user?.uid;
                return (
                  <div
                    key={r.uid}
                    id={isMe ? 'lb-me' : undefined}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '52px 44px 1fr 72px 72px 58px',
                      gap: 8,
                      alignItems: 'center',
                      background:   isMe ? 'var(--teal-glow)' : 'var(--bg-card)',
                      border:       isMe ? '2px solid var(--teal)' : '1.5px solid var(--border)',
                      borderRadius: 14,
                      padding:      '12px 20px',
                      boxShadow:    isMe ? '0 0 0 3px rgba(13,148,136,0.12)' : 'none',
                      transition:   'background 0.2s',
                    }}
                  >
                    {/* Rank / medal */}
                    <div style={{
                      fontWeight: 900,
                      fontSize:   i < 3 ? 26 : 15,
                      color:      i < 3 ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontFamily: H,
                      textAlign:  'center',
                    }}>
                      {i < 3 ? medals[i] : `#${i + 1}`}
                    </div>

                    {/* Avatar */}
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: isMe ? 'var(--teal)' : 'var(--bg-tertiary)',
                      border:     `2px solid ${isMe ? 'var(--teal)' : 'var(--border)'}`,
                      display:    'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 900, fontSize: 16,
                      color: isMe ? '#fff' : 'var(--text-muted)',
                      fontFamily: H,
                    }}>
                      {(r.name?.[0] || '?').toUpperCase()}
                    </div>

                    {/* Name + exam count */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontWeight: 700, fontSize: 15,
                        color: 'var(--text-primary)', fontFamily: F,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        {r.name}
                        {isMe && (
                          <span style={{
                            fontSize: 11, fontWeight: 700, color: 'var(--teal)',
                            background: 'var(--teal-glow)',
                            padding: '1px 8px', borderRadius: 20,
                            border: '1px solid var(--teal)', fontFamily: F,
                            flexShrink: 0,
                          }}>You</span>
                        )}
                      </div>
                      <div style={{
                        fontSize: 12, color: 'var(--text-muted)',
                        fontWeight: 700, fontFamily: F, marginTop: 2,
                      }}>
                        {r.count} exam{r.count !== 1 ? 's' : ''}
                      </div>
                    </div>

                    {/* Best score — primary ranking column */}
                    <div style={{
                      fontFamily: H, fontWeight: 900, fontSize: 18,
                      color: gradeColor(r.best),
                      textAlign: 'right',
                    }}>
                      {r.best}%
                    </div>

                    {/* Avg score */}
                    <div style={{
                      fontFamily: F, fontWeight: 700, fontSize: 14,
                      color: 'var(--text-muted)',
                      textAlign: 'right',
                    }}>
                      {r.avg}%
                    </div>

                    {/* Exam count */}
                    <div style={{
                      fontFamily: F, fontWeight: 700, fontSize: 13,
                      color: 'var(--text-muted)',
                      textAlign: 'right',
                    }}>
                      ×{r.count}
                    </div>
                  </div>
                );
              })}
            </div>

            <p style={{
              marginTop: 16, fontSize: 12, color: 'var(--text-muted)',
              fontFamily: F, fontWeight: 700, textAlign: 'center',
            }}>
              Showing top {board.length} student{board.length !== 1 ? 's' : ''} · ranked by best single-exam score
            </p>
          </>
        )}
      </div>
    </div>
  );
}
