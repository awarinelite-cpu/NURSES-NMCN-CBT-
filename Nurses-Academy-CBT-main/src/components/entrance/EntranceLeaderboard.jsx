// src/components/entrance/EntranceLeaderboard.jsx
// Route: /entrance-exam/leaderboard
//
// Plain getDocs — no orderBy, no compound queries, no composite indexes.
// All sorting and time-filtering done client-side.

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate }                       from 'react-router-dom';
import { collection, getDocs }              from 'firebase/firestore';
import { db }                               from '../../firebase/config';
import { useAuth }                          from '../../context/AuthContext';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

const gradeColor = (p) =>
  p >= 70 ? '#16A34A' : p >= 50 ? '#F59E0B' : '#EF4444';

// Grid columns: desktop keeps original spacious layout, mobile is tighter
function useGrid() {
  const [cols, setCols] = React.useState(
    window.innerWidth < 600
      ? '36px 38px 1fr 58px 52px 40px'
      : '52px 44px 1fr 72px 72px 52px'
  );
  React.useEffect(() => {
    const update = () => setCols(
      window.innerWidth < 600
        ? '36px 38px 1fr 58px 52px 40px'
        : '52px 44px 1fr 72px 72px 52px'
    );
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return cols;
}

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
  const GRID      = useGrid();

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
      const snap = await getDocs(collection(db, 'entranceExamSessions'));

      if (snap.empty) {
        setBoard([]);
        setDebug('No documents found in entranceExamSessions.');
        setLoading(false);
        return;
      }

      const cutoff = new Date();
      if      (filter === 'week')  cutoff.setDate(cutoff.getDate() - 7);
      else if (filter === 'month') cutoff.setMonth(cutoff.getMonth() - 1);
      else                         cutoff.setFullYear(2000);

      const userMap = {};

      snap.forEach(d => {
        const s = d.data();
        if (!s.userId) return;

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
        padding: '9px 20px', borderRadius: 20, border: 'none',
        cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: F,
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

      {/* ── Page header ── */}
      <div style={{
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
        padding: '16px 20px',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <button
          onClick={() => navigate('/entrance-exam')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 22, color: '#0D9488', padding: 4,
            fontWeight: 700, lineHeight: 1, flexShrink: 0,
          }}
        >←</button>
        <div>
          <h1 style={{
            margin: 0, fontFamily: H, fontWeight: 900,
            fontSize: 'clamp(1.3rem, 3vw, 1.9rem)',
            color: 'var(--text-primary)',
          }}>🏆 Leaderboard</h1>
          <p style={{
            margin: 0, fontSize: 13, fontWeight: 700,
            fontFamily: F, color: 'var(--text-muted)',
          }}>Top students ranked by highest exam score</p>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '20px 12px' }}>

        {/* Filter buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          <FilterBtn id="week"  label="This Week"  />
          <FilterBtn id="month" label="This Month" />
          <FilterBtn id="all"   label="All Time"   />
        </div>

        {/* Your rank banner */}
        {myRank > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, #0D9488, #0891B2)',
            borderRadius: 14, padding: '14px 20px', marginBottom: 18,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#fff', fontFamily: F }}>
              🎯 Your Current Rank
            </span>
            <span style={{ fontSize: 26, fontWeight: 900, color: '#fff', fontFamily: H }}>
              #{myRank}
            </span>
          </div>
        )}

        {/* Error banner */}
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
            {debug && (
              <div style={{
                marginTop: 8, fontSize: 11,
                color: 'rgba(239,68,68,0.75)',
                fontFamily: 'monospace', wordBreak: 'break-all',
              }}>
                {debug}
              </div>
            )}
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
            {debug && (
              <p style={{
                fontFamily: 'monospace', fontSize: 11,
                color: 'var(--text-muted)', marginBottom: 20,
              }}>{debug}</p>
            )}
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
            {/* ── Column headers ── */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: GRID,
              gap: 6,
              padding: '6px 12px 8px',
              fontSize: 10, fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: 0.5,
              fontFamily: F,
            }}>
              <span style={{ textAlign: 'center'}}>#</span>
              <span />
              <span style={{ paddingLeft: 4 }}>Student</span>
              <span style={{ textAlign: 'right' }}>Best</span>
              <span style={{ textAlign: 'right' }}>Avg</span>
              <span style={{ textAlign: 'right' }}>Exams</span>
            </div>

            {/* ── Rows ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {board.map((r, i) => {
                const isMe = r.uid === user?.uid;
                return (
                  <div
                    key={r.uid}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: GRID,
                      gap: 6,
                      alignItems: 'center',
                      background: isMe ? 'rgba(13,148,136,0.12)' : 'var(--bg-card)',
                      border:     isMe ? '2px solid #0D9488' : '1.5px solid var(--border)',
                      borderRadius: 12,
                      padding: '10px 12px',
                    }}
                  >
                    {/* Rank / medal */}
                    <div style={{
                      fontWeight: 900,
                      fontSize:   i < 3 ? 20 : 13,
                      color:      i < 3 ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontFamily: H, textAlign: 'center',
                    }}>
                      {i < 3 ? medals[i] : `#${i + 1}`}
                    </div>

                    {/* Avatar */}
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: isMe ? '#0D9488' : 'var(--bg-tertiary)',
                      border: `2px solid ${isMe ? '#0D9488' : 'var(--border)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 900, fontSize: 13,
                      color: isMe ? '#fff' : 'var(--text-muted)',
                      fontFamily: H, flexShrink: 0,
                    }}>
                      {(r.name?.[0] || '?').toUpperCase()}
                    </div>

                    {/* Name + count — full name shown, wraps if needed */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontWeight: 700, fontSize: 13,
                        color: 'var(--text-primary)', fontFamily: F,
                        overflow: 'hidden',
                        textOverflow: window.innerWidth < 600 ? 'clip' : 'ellipsis',
                        whiteSpace: window.innerWidth < 600 ? 'normal' : 'nowrap',
                        wordBreak: window.innerWidth < 600 ? 'break-word' : 'normal',
                        lineHeight: 1.3,
                        display: 'flex', alignItems: 'flex-start',
                        gap: 5, flexWrap: 'wrap',
                      }}>
                        {r.name}
                        {isMe && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, color: '#0D9488',
                            background: 'rgba(13,148,136,0.12)',
                            padding: '1px 6px', borderRadius: 20,
                            border: '1px solid #0D9488', flexShrink: 0,
                            lineHeight: 1.6,
                          }}>You</span>
                        )}
                      </div>
                      <div style={{
                        fontSize: 10, color: 'var(--text-muted)',
                        fontWeight: 700, fontFamily: F, marginTop: 2,
                      }}>
                        {r.count} exam{r.count !== 1 ? 's' : ''}
                      </div>
                    </div>

                    {/* Best score */}
                    <div style={{
                      fontFamily: H, fontWeight: 900, fontSize: 15,
                      color: gradeColor(r.best), textAlign: 'right',
                    }}>
                      {r.best}%
                    </div>

                    {/* Avg score */}
                    <div style={{
                      fontFamily: F, fontWeight: 700, fontSize: 12,
                      color: 'var(--text-muted)', textAlign: 'right',
                    }}>
                      {r.avg}%
                    </div>

                    {/* Exam count */}
                    <div style={{
                      fontFamily: F, fontWeight: 700, fontSize: 11,
                      color: 'var(--text-muted)', textAlign: 'right',
                    }}>
                      ×{r.count}
                    </div>
                  </div>
                );
              })}
            </div>

            <p style={{
              marginTop: 14, fontSize: 12,
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
