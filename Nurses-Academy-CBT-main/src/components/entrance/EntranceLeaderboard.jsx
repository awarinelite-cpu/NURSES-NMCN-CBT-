// src/components/entrance/EntranceLeaderboard.jsx
// Route: /entrance-exam/leaderboard
//
// Plain getDocs — no orderBy, no compound queries, no composite indexes.
// All sorting and time-filtering done client-side.

import { useState, useEffect, useCallback } from 'react';
import { useNavigate }                       from 'react-router-dom';
import { collection, getDocs }              from 'firebase/firestore';
import { db }                               from '../../firebase/config';
import { useAuth }                          from '../../context/AuthContext';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

const gradeColor = (p) =>
  p >= 70 ? '#16A34A' : p >= 50 ? '#F59E0B' : '#EF4444';

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
      <div style={{
        width: 44, height: 44,
        border: '3px solid rgba(255,255,255,0.1)',
        borderTopColor: '#0D9488',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  );
}

export default function EntranceLeaderboard() {
  const { user }  = useAuth();
  const navigate  = useNavigate();

  const [board,   setBoard]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [debug,   setDebug]   = useState('');
  const [filter,  setFilter]  = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setDebug('');

    try {
      // ── Simplest possible read — no indexes required ──────────────────
      const snap = await getDocs(collection(db, 'entranceExamSessions'));

      if (snap.empty) {
        setBoard([]);
        setDebug('No documents found in entranceExamSessions.');
        setLoading(false);
        return;
      }

      // ── Client-side time filter ───────────────────────────────────────
      const cutoff = new Date();
      if      (filter === 'week')  cutoff.setDate(cutoff.getDate() - 7);
      else if (filter === 'month') cutoff.setMonth(cutoff.getMonth() - 1);
      else                         cutoff.setFullYear(2000);

      // ── Group sessions by userId ──────────────────────────────────────
      const userMap = {};

      snap.forEach(d => {
        const s = d.data();
        if (!s.userId) return;

        // Support both Firestore Timestamp and plain seconds
        const completedMs =
          s.completedAt?.toDate?.()?.getTime?.() ??
          (s.completedAt?.seconds ? s.completedAt.seconds * 1000 : 0);

        if (completedMs < cutoff.getTime()) return;

        const sessionScore =
          typeof s.scorePercent === 'number'
            ? s.scorePercent
            : s.totalQuestions > 0
              ? Math.round(((s.correct || 0) / s.totalQuestions) * 100)
              : 0;

        if (!userMap[s.userId]) {
          userMap[s.userId] = {
            uid:    s.userId,
            name:   s.userName || s.displayName || 'Student',
            scores: [],
          };
        }
        userMap[s.userId].scores.push(sessionScore);
      });

      // ── Build & sort rows ─────────────────────────────────────────────
      const rows = Object.values(userMap)
        .filter(u => u.scores.length > 0)
        .map(u => ({
          uid:   u.uid,
          name:  u.name,
          best:  Math.max(...u.scores),
          avg:   Math.round(u.scores.reduce((a, b) => a + b, 0) / u.scores.length),
          count: u.scores.length,
        }));

      rows.sort((a, b) =>
        b.best  - a.best  ||
        b.avg   - a.avg   ||
        b.count - a.count
      );

      setBoard(rows.slice(0, 100));
    } catch (e) {
      console.error('Leaderboard load error:', e);
      setError('Could not load leaderboard.');
      setDebug(`${e.code || 'unknown'}: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const myRank = board.findIndex(r => r.uid === user?.uid) + 1;
  const medals = ['🥇', '🥈', '🥉'];

  const FilterBtn = ({ id, label }) => (
    <button
      onClick={() => setFilter(id)}
      style={{
        padding: '9px 22px', borderRadius: 20, border: 'none',
        cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: F,
        background: filter === id ? '#0D9488' : 'var(--bg-tertiary)',
        color:      filter === id ? '#fff'    : 'var(--text-muted)',
        transition: 'all 0.15s',
      }}
    >{label}</button>
  );

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      fontFamily: F,
      color: 'var(--text-primary)',
    }}>

      {/* ── Page header ─────────────────────────────────────────────────── */}
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
            fontSize: 22, color: '#0D9488', padding: 4,
            fontWeight: 700, lineHeight: 1,
          }}
        >←</button>
        <div>
          <h1 style={{
            margin: 0, fontFamily: H, fontWeight: 900,
            fontSize: 'clamp(1.4rem, 3vw, 2rem)',
            color: 'var(--text-primary)',
          }}>🏆 Leaderboard</h1>
          <p style={{
            margin: 0, fontSize: 14, fontWeight: 700,
            fontFamily: F, color: 'var(--text-muted)',
          }}>Top students ranked by highest exam score</p>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
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
            background: 'linear-gradient(135deg, #0D9488, #0891B2)',
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

        {/* Error banner with debug info */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 10, padding: '12px 16px', marginBottom: 16,
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: 14, color: '#EF4444', fontWeight: 700, fontFamily: F,
            }}>
              <span>⚠️ {error}</span>
              <button
                onClick={load}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#EF4444', fontWeight: 700, fontSize: 14, fontFamily: F,
                }}
              >Retry</button>
            </div>
            {debug ? (
              <div style={{
                marginTop: 8, fontSize: 11,
                color: 'rgba(239,68,68,0.75)',
                fontFamily: 'monospace', wordBreak: 'break-all',
              }}>
                {debug}
              </div>
            ) : null}
          </div>
        )}

        {/* Main content */}
        {loading ? (
          <Spinner />
        ) : board.length === 0 && !error ? (
          <div style={{ textAlign: 'center', padding: '64px 20px' }}>
            <div style={{ fontSize: 52, marginBottom: 14 }}>🏆</div>
            <h3 style={{
              margin: '0 0 10px', fontFamily: H, fontWeight: 900,
              fontSize: 'clamp(1.3rem, 3vw, 1.8rem)',
              color: 'var(--text-primary)',
            }}>No data for this period</h3>
            <p style={{
              fontFamily: F, fontWeight: 700, fontSize: 15,
              color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.7,
            }}>
              Complete entrance exams to appear on the leaderboard.
            </p>
            {debug ? (
              <p style={{
                fontFamily: 'monospace', fontSize: 11,
                color: 'var(--text-muted)', marginBottom: 20,
              }}>{debug}</p>
            ) : null}
            <button
              onClick={() => navigate('/entrance-exam')}
              style={{
                padding: '12px 28px', background: '#0D9488', color: '#fff',
                border: 'none', borderRadius: 10, cursor: 'pointer',
                fontSize: 15, fontWeight: 700, fontFamily: F,
              }}
            >Start Practising</button>
          </div>
        ) : board.length > 0 ? (
          <>
            {/* Column headers */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '52px 44px 1fr 72px 72px 52px',
              gap: 8, padding: '8px 16px',
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
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '52px 44px 1fr 72px 72px 52px',
                      gap: 8, alignItems: 'center',
                      background:   isMe
                        ? 'rgba(13,148,136,0.12)'
                        : 'var(--bg-card)',
                      border:       isMe
                        ? '2px solid #0D9488'
                        : '1.5px solid var(--border)',
                      borderRadius: 14,
                      padding:      '12px 16px',
                    }}
                  >
                    {/* Rank / medal */}
                    <div style={{
                      fontWeight: 900,
                      fontSize:   i < 3 ? 24 : 14,
                      color:      i < 3 ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontFamily: H, textAlign: 'center',
                    }}>
                      {i < 3 ? medals[i] : `#${i + 1}`}
                    </div>

                    {/* Avatar */}
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%',
                      background: isMe ? '#0D9488' : 'var(--bg-tertiary)',
                      border: `2px solid ${isMe ? '#0D9488' : 'var(--border)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 900, fontSize: 15,
                      color: isMe ? '#fff' : 'var(--text-muted)',
                      fontFamily: H,
                    }}>
                      {(r.name?.[0] || '?').toUpperCase()}
                    </div>

                    {/* Name + count */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontWeight: 700, fontSize: 14,
                        color: 'var(--text-primary)', fontFamily: F,
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        {r.name}
                        {isMe && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, color: '#0D9488',
                            background: 'rgba(13,148,136,0.12)',
                            padding: '1px 7px', borderRadius: 20,
                            border: '1px solid #0D9488', flexShrink: 0,
                          }}>You</span>
                        )}
                      </div>
                      <div style={{
                        fontSize: 11, color: 'var(--text-muted)',
                        fontWeight: 700, fontFamily: F, marginTop: 1,
                      }}>
                        {r.count} exam{r.count !== 1 ? 's' : ''}
                      </div>
                    </div>

                    {/* Best score */}
                    <div style={{
                      fontFamily: H, fontWeight: 900, fontSize: 17,
                      color: gradeColor(r.best), textAlign: 'right',
                    }}>
                      {r.best}%
                    </div>

                    {/* Avg score */}
                    <div style={{
                      fontFamily: F, fontWeight: 700, fontSize: 13,
                      color: 'var(--text-muted)', textAlign: 'right',
                    }}>
                      {r.avg}%
                    </div>

                    {/* Exam count */}
                    <div style={{
                      fontFamily: F, fontWeight: 700, fontSize: 12,
                      color: 'var(--text-muted)', textAlign: 'right',
                    }}>
                      ×{r.count}
                    </div>
                  </div>
                );
              })}
            </div>

            <p style={{
              marginTop: 16, fontSize: 12,
              color: 'var(--text-muted)', fontFamily: F,
              fontWeight: 700, textAlign: 'center',
            }}>
              {board.length} student{board.length !== 1 ? 's' : ''} · ranked by best single-exam score
            </p>
          </>
        ) : null}

      </div>
    </div>
  );
}
