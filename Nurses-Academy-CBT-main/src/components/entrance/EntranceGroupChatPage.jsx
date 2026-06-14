// src/components/entrance/EntranceGroupChatPage.jsx
// Route: /entrance-exam/group-chat/:subjectId
// Entrance-exam-only group chat. Uses 'entranceGroupChats' Firestore collection.
// Bookmarks sourced from 'entranceBookmarks'. No cross-page navigation.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  collection, doc, addDoc, onSnapshot, query, orderBy,
  limit, serverTimestamp, updateDoc, setDoc, increment,
  getDocs,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { ENTRANCE_GROUP_SUBJECTS } from './EntranceGroupChatHub';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

// Build lookup map from subjects array
const ENTRANCE_GROUP_META = Object.fromEntries(
  ENTRANCE_GROUP_SUBJECTS.map(g => [g.id, g])
);

/* ─── Helpers ────────────────────────────────────────────── */
function formatTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function formatDateLabel(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function sameDay(ts1, ts2) {
  if (!ts1 || !ts2) return false;
  const a = ts1.toDate ? ts1.toDate() : new Date(ts1);
  const b = ts2.toDate ? ts2.toDate() : new Date(ts2);
  return a.toDateString() === b.toDateString();
}

/* ─── Avatar ─────────────────────────────────────────────── */
function Avatar({ name = '', size = 36, color = '#0D9488' }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
  const colors = ['#0D9488', '#7C3AED', '#2563EB', '#DC2626', '#D97706', '#F59E0B', '#8B5CF6', '#059669'];
  const bg = colors[name.charCodeAt(0) % colors.length] || color;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `linear-gradient(135deg, ${bg}, ${bg}88)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: H, fontWeight: 900, color: '#fff', fontSize: size * 0.38,
    }}>{initials}</div>
  );
}

/* ─── Question Card (inside chat) ────────────────────────── */
function QuestionCard({ question, accentColor }) {
  const [showExplanation, setShowExplanation] = useState(false);
  const opts = question.options || question.choices || [];
  const correct = question.correct_answer || question.correctAnswer || question.answer || '';
  const explanation = question.explanation || question.rationale || '';
  const qText = question.question || question.text || '';
  const optLabels = ['A', 'B', 'C', 'D', 'E'];

  return (
    <div style={{
      background: 'rgba(0,0,0,0.35)',
      border: `1px solid ${accentColor}44`,
      borderRadius: 12,
      overflow: 'hidden',
      width: '100%',
    }}>
      <div style={{
        background: `${accentColor}22`,
        borderBottom: `1px solid ${accentColor}33`,
        padding: '6px 12px',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ fontSize: 13 }}>🚩</span>
        <span style={{
          fontFamily: H, fontWeight: 900, fontSize: 10,
          color: accentColor, letterSpacing: 1, textTransform: 'uppercase',
        }}>FLAGGED QUESTION</span>
      </div>
      <div style={{ padding: '10px 12px 8px' }}>
        <div style={{
          fontFamily: F, fontWeight: 700, fontSize: 13,
          color: '#E9EDEF', lineHeight: 1.65, marginBottom: 10,
        }}>{qText}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {opts.map((opt, i) => {
            const optLabel = optLabels[i] || String.fromCharCode(65 + i);
            const optText = typeof opt === 'string' ? opt : opt.text || opt.label || '';
            const isCorrect = correct &&
              (correct === optLabel || correct.toUpperCase() === optLabel ||
               optText === correct || correct.toLowerCase() === optText.toLowerCase());
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '5px 10px', borderRadius: 8,
                background: isCorrect ? 'rgba(13,148,136,0.2)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isCorrect ? '#0D9488' : 'rgba(255,255,255,0.06)'}`,
              }}>
                <span style={{
                  fontFamily: H, fontWeight: 900, fontSize: 11,
                  color: isCorrect ? '#0D9488' : '#8696A0',
                  flexShrink: 0, minWidth: 16,
                }}>{optLabel}.</span>
                <span style={{
                  fontFamily: F, fontWeight: isCorrect ? 900 : 700,
                  fontSize: 12, color: isCorrect ? '#34D399' : '#CBD5E1', lineHeight: 1.5,
                }}>{optText}</span>
                {isCorrect && <span style={{ marginLeft: 'auto', fontSize: 12, flexShrink: 0 }}>✅</span>}
              </div>
            );
          })}
        </div>
        {explanation && (
          <div style={{ marginTop: 8 }}>
            <button onClick={() => setShowExplanation(v => !v)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: accentColor, fontFamily: F, fontWeight: 900, fontSize: 12,
              padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4,
            }}>
              {showExplanation ? '▲' : '▼'} {showExplanation ? 'Hide' : 'Show'} Explanation
            </button>
            {showExplanation && (
              <div style={{
                marginTop: 6, padding: '8px 10px',
                background: 'rgba(13,148,136,0.1)',
                border: '1px solid rgba(13,148,136,0.25)',
                borderRadius: 8,
                fontFamily: F, fontWeight: 700, fontSize: 12,
                color: '#94A3B8', lineHeight: 1.65,
              }}>💡 {explanation}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Message Bubble ─────────────────────────────────────── */
function Bubble({ msg, isMe, prevMsg, nextMsg, accentColor, onSwipeReply, onLongPress }) {
  const showDateDiv = !prevMsg || !sameDay(prevMsg.createdAt, msg.createdAt);
  const showName   = !isMe && (!prevMsg || prevMsg.senderId !== msg.senderId || showDateDiv);
  const showAvatar = !isMe && (!nextMsg || nextMsg.senderId !== msg.senderId || !sameDay(msg.createdAt, nextMsg?.createdAt));
  const touchStartX = useRef(null);
  const bubbleRef = useRef(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; setSwiping(true); };
  const handleTouchMove = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    if (isMe && dx < 0) setSwipeOffset(Math.max(dx, -60));
    if (!isMe && dx > 0) setSwipeOffset(Math.min(dx, 60));
  };
  const handleTouchEnd = () => {
    if (Math.abs(swipeOffset) > 35) onSwipeReply(msg);
    setSwipeOffset(0); setSwiping(false); touchStartX.current = null;
  };

  const longPressTimer = useRef(null);
  const handlePressStart = (e) => {
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    longPressTimer.current = setTimeout(() => onLongPress(msg, x, y), 500);
  };
  const handlePressEnd = () => clearTimeout(longPressTimer.current);
  const isQuestion = msg.type === 'question';

  return (
    <>
      {showDateDiv && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 8px' }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
          <span style={{
            fontSize: 11, fontFamily: F, fontWeight: 700, color: '#64748B',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 20, padding: '3px 12px',
          }}>{formatDateLabel(msg.createdAt)}</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
        </div>
      )}
      <div style={{
        display: 'flex',
        flexDirection: isMe ? 'row-reverse' : 'row',
        alignItems: 'flex-end', gap: 6,
        marginBottom: 6,
        paddingLeft: isMe ? 40 : 0,
        paddingRight: isMe ? 0 : 40,
        transform: `translateX(${swipeOffset}px)`,
        transition: swiping ? 'none' : 'transform 0.2s ease',
        position: 'relative',
      }}>
        {Math.abs(swipeOffset) > 20 && (
          <div style={{
            position: 'absolute', [isMe ? 'right' : 'left']: -32, bottom: 12,
            fontSize: 18, opacity: Math.min(1, Math.abs(swipeOffset) / 40),
            transform: isMe ? 'scaleX(-1)' : 'none',
          }}>↩️</div>
        )}
        {/* Avatar column — only for others */}
        {!isMe && (
          <div style={{ width: 34, flexShrink: 0, alignSelf: 'flex-end' }}>
            {showAvatar
              ? <Avatar name={msg.senderName || ''} size={30} />
              : <div style={{ width: 30 }} />}
          </div>
        )}
        <div style={{
          maxWidth: isQuestion ? '90%' : '75%',
          width: isQuestion ? '90%' : undefined,
          display: 'flex', flexDirection: 'column',
          alignItems: isMe ? 'flex-end' : 'flex-start',
        }}>
          {showName && (
            <div style={{
              fontSize: 11, fontFamily: H, fontWeight: 900, color: accentColor, marginBottom: 3,
            }}>{msg.senderName || 'Student'}</div>
          )}
          {msg.replyTo && (
            <div style={{
              background: isMe ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.06)',
              borderLeft: `3px solid ${accentColor}`,
              borderRadius: '8px 8px 0 0', padding: '5px 10px',
              maxWidth: '100%', width: '100%', marginBottom: -4,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: accentColor, fontFamily: F }}>
                {msg.replyTo.senderName}
              </div>
              <div style={{
                fontSize: 11, color: '#94A3B8', fontFamily: F, fontWeight: 700,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {msg.replyTo.type === 'question' ? '🚩 Flagged Question' : msg.replyTo.text}
              </div>
            </div>
          )}
          <div
            ref={bubbleRef}
            onTouchStart={e => { handleTouchStart(e); handlePressStart(e); }}
            onTouchMove={handleTouchMove}
            onTouchEnd={() => { handleTouchEnd(); handlePressEnd(); }}
            onMouseDown={handlePressStart}
            onMouseUp={handlePressEnd}
            onMouseLeave={handlePressEnd}
            style={{
              padding: isQuestion ? '10px' : '8px 12px 6px',
              borderRadius: isMe
                ? (msg.replyTo ? '0 12px 4px 12px' : '18px 18px 4px 18px')
                : (msg.replyTo ? '12px 0 12px 4px' : '18px 18px 18px 4px'),
              background: isMe
                ? `linear-gradient(135deg, ${accentColor}cc, ${accentColor}88)`
                : (isQuestion ? '#0D1B2A' : '#1F2C34'),
              border: isQuestion ? `1px solid ${accentColor}44` : 'none',
              color: '#E9EDEF',
              fontFamily: F, fontWeight: 700, fontSize: 14, lineHeight: 1.55,
              wordBreak: 'break-word', userSelect: 'none',
              boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
              width: isQuestion ? '100%' : undefined,
            }}
          >
            {isQuestion ? (
              <>
                <QuestionCard question={msg.questionData} accentColor={accentColor} />
                {msg.text && (
                  <div style={{
                    marginTop: 8, padding: '6px 10px',
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: 8, borderLeft: `3px solid ${accentColor}`,
                    fontFamily: F, fontWeight: 700, fontSize: 12, color: '#CBD5E1', lineHeight: 1.55,
                  }}>💬 {msg.text}</div>
                )}
                <div style={{
                  marginTop: 6, textAlign: 'right',
                  fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: F, fontWeight: 700,
                }}>{formatTime(msg.createdAt)}</div>
              </>
            ) : msg.deleted ? (
              <span style={{ fontStyle: 'italic', opacity: 0.5, fontSize: 13 }}>🚫 Message was deleted</span>
            ) : (
              <>
                <span>{msg.text}</span>
                <span style={{
                  float: 'right', marginLeft: 8, marginTop: 4,
                  fontSize: 10, color: isMe ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.35)',
                  fontFamily: F, fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center',
                  transform: 'translateY(2px)', whiteSpace: 'nowrap',
                }}>{formatTime(msg.createdAt)}</span>
              </>
            )}
          </div>
          {msg.reactions && Object.keys(msg.reactions).length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
              {Object.entries(msg.reactions).map(([emoji, count]) => count > 0 && (
                <span key={emoji} style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 20, padding: '2px 7px',
                  fontSize: 12, fontFamily: F, fontWeight: 700, color: '#E9EDEF', cursor: 'pointer',
                }}>{emoji}{count > 1 ? ` ${count}` : ''}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ─── Flagged Question Picker Modal ──────────────────────── */
function FlaggedQuestionPicker({ userId, onSelect, onClose, accentColor }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      setLoading(true);
      try {
        // Bookmarks are stored in users/{uid}/entranceBookmarks subcollection
        // and already contain all question data inline — no second fetch needed
        let snap;
        try {
          snap = await getDocs(query(
            collection(db, 'users', userId, 'entranceBookmarks'),
            orderBy('savedAt', 'desc'),
          ));
        } catch {
          snap = await getDocs(collection(db, 'users', userId, 'entranceBookmarks'));
        }
        const bms = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Normalise each bookmark into the shape QuestionCard expects
        const enriched = bms.map(bm => {
          const opts = bm.options || {};
          // Convert {A:'text', B:'text'} → array of strings for QuestionCard
          const optionsArray = Array.isArray(opts)
            ? opts
            : ['A','B','C','D'].map(l => opts[l]).filter(Boolean);

          return {
            ...bm,
            question: {
              id:             bm.id,
              question:       bm.question || bm.questionText || '',
              options:        optionsArray,
              correct_answer: bm.answer || bm.correctAnswer || '',
              explanation:    bm.explanation || '',
              subject:        bm.subject || '',
            },
          };
        }).filter(bm => bm.question.question);

        setQuestions(enriched);
      } catch (e) { console.error('FlaggedQuestionPicker load error:', e); }
      setLoading(false);
    };
    load();
  }, [userId]);

  const filtered = questions.filter(bm =>
    !search || (bm.question?.question || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', flexDirection: 'column', alignItems: 'stretch',
    }}>
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        background: '#0B141A', maxHeight: '100vh', overflow: 'hidden',
      }}>
        <div style={{
          background: '#1F2C34', padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: 12,
          borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0,
        }}>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 22, color: accentColor, fontWeight: 900, lineHeight: 1,
          }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: H, fontWeight: 900, color: '#E9EDEF', fontSize: 16 }}>
              🚩 Insert Flagged Question
            </div>
            <div style={{ fontSize: 11, color: '#8696A0', fontFamily: F, fontWeight: 700 }}>
              {questions.length} bookmarked entrance questions
            </div>
          </div>
        </div>

        {selected ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontFamily: H, fontWeight: 900, fontSize: 13, color: accentColor, marginBottom: 4 }}>
              📋 Selected Question:
            </div>
            <QuestionCard question={selected.question} accentColor={accentColor} />
            <div style={{ marginTop: 8 }}>
              <div style={{ fontFamily: F, fontWeight: 700, fontSize: 13, color: '#8696A0', marginBottom: 6 }}>
                Add a comment for the group (optional):
              </div>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="e.g. 'I got confused between option A and B — what do you all think?'"
                rows={3}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: '#2A3942', border: 'none', borderRadius: 12,
                  padding: '10px 14px', color: '#E9EDEF',
                  fontFamily: F, fontWeight: 700, fontSize: 13,
                  outline: 'none', resize: 'vertical',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setSelected(null)} style={{
                flex: 1, padding: '12px', borderRadius: 24,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#E9EDEF', fontFamily: F, fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }}>← Back</button>
              <button onClick={() => onSelect(selected.question, comment.trim())} style={{
                flex: 2, padding: '12px', borderRadius: 24,
                background: accentColor, border: 'none',
                color: '#fff', fontFamily: H, fontWeight: 900, fontSize: 14, cursor: 'pointer',
                boxShadow: `0 4px 14px ${accentColor}55`,
              }}>📤 Drop to Group</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: '10px 14px', flexShrink: 0 }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Search your bookmarks…"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: '#2A3942', border: 'none', borderRadius: 22,
                  padding: '9px 16px', color: '#E9EDEF',
                  fontFamily: F, fontWeight: 700, fontSize: 13, outline: 'none',
                }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px' }}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#8696A0', fontFamily: F, fontWeight: 700 }}>
                  Loading your bookmarks…
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🔖</div>
                  <div style={{ color: '#8696A0', fontFamily: F, fontWeight: 700, fontSize: 14, lineHeight: 1.7 }}>
                    {search ? 'No bookmarks match your search.' : 'No bookmarked entrance questions yet.\n\nBookmark questions during an entrance exam session to share them here.'}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {filtered.map(bm => (
                    <div
                      key={bm.id}
                      onClick={() => setSelected(bm)}
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: 12, padding: '12px 14px', cursor: 'pointer',
                        transition: 'background 0.15s, border-color 0.15s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = `${accentColor}15`;
                        e.currentTarget.style.borderColor = `${accentColor}55`;
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)';
                      }}
                    >
                      <div style={{
                        fontFamily: F, fontWeight: 700, fontSize: 13,
                        color: '#E9EDEF', lineHeight: 1.6, marginBottom: 6,
                      }}>
                        {(bm.question?.question || '').length > 120
                          ? bm.question.question.slice(0, 120) + '…'
                          : bm.question?.question}
                      </div>
                      <div style={{
                        fontSize: 11, color: accentColor, fontFamily: H, fontWeight: 900,
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        🚩 {bm.subject || 'Entrance Exam'}
                        <span style={{ color: '#8696A0', fontWeight: 700 }}>· Tap to select</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Context Menu ───────────────────────────────────────── */
function ContextMenu({ x, y, isMe, accentColor, onReply, onCopy, onDelete, onReact, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    setTimeout(() => document.addEventListener('mousedown', h), 10);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const safeX = Math.min(x, window.innerWidth - 170);
  const safeY = Math.min(y, window.innerHeight - 200);
  const QUICK_REACT = ['❤️', '😂', '😮', '😢', '🙏', '👍'];

  return (
    <div ref={ref} style={{
      position: 'fixed', left: safeX, top: safeY, zIndex: 9999,
      background: '#1F2C34', border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 14, overflow: 'hidden',
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)', minWidth: 160,
      animation: 'ctxPop 0.12s ease',
    }}>
      <div style={{ display: 'flex', gap: 4, padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        {QUICK_REACT.map(e => (
          <button key={e} onClick={() => { onReact(e); onClose(); }} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 22, padding: '2px 4px', borderRadius: 8, transition: 'transform 0.1s',
          }}
            onMouseEnter={ev => ev.currentTarget.style.transform = 'scale(1.3)'}
            onMouseLeave={ev => ev.currentTarget.style.transform = 'scale(1)'}
          >{e}</button>
        ))}
      </div>
      {[
        { icon: '↩️', label: 'Reply', action: onReply },
        { icon: '📋', label: 'Copy', action: onCopy },
        ...(isMe ? [{ icon: '🗑️', label: 'Delete', action: onDelete, danger: true }] : []),
      ].map(item => (
        <button key={item.label} onClick={() => { item.action(); onClose(); }} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          width: '100%', padding: '11px 16px', border: 'none', cursor: 'pointer',
          background: 'transparent',
          color: item.danger ? '#EF4444' : '#E9EDEF',
          fontFamily: F, fontWeight: 700, fontSize: 14, transition: 'background 0.1s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <span style={{ fontSize: 16 }}>{item.icon}</span> {item.label}
        </button>
      ))}
    </div>
  );
}

/* ─── MAIN COMPONENT ─────────────────────────────────────── */
export default function EntranceGroupChatPage() {
  const { subjectId } = useParams();
  const { state } = useLocation();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const grp = ENTRANCE_GROUP_META[subjectId] || state?.group || { label: subjectId, icon: '💬', color: '#0D9488' };
  const accentColor = grp.color;
  const myUid = user?.uid;
  const myName = profile?.name || user?.displayName || 'Student';

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState({});
  const [showMenu, setShowMenu] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [memberCount, setMemberCount] = useState('...');

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimer = useRef(null);
  const menuRef = useRef(null);

  // Use separate Firestore collection: entranceGroupChats
  const colPath = `entranceGroupChats/${subjectId}/messages`;

  /* ── Auto-send question returned from bookmarks page ── */
  useEffect(() => {
    if (!state?.shareQuestion || !myUid || sending) return;
    const question = state.shareQuestion;
    const comment  = state.shareComment || '';
    // Clear state so a page refresh doesn't re-send
    window.history.replaceState({}, '');
    const doSend = async () => {
      setSending(true);
      try {
        await addDoc(collection(db, colPath), {
          type: 'question', text: comment, questionData: question,
          senderId: myUid, senderName: myName, createdAt: serverTimestamp(),
        });
        await setDoc(doc(db, 'entranceGroupChats', subjectId), {
          lastMessage: `🚩 ${myName} shared a question`,
          lastSenderName: myName, updatedAt: serverTimestamp(),
        }, { merge: true });
        const memberSnap = await getDocs(collection(db, 'entranceGroupChats', subjectId, 'members'));
        const updates = {};
        memberSnap.docs.forEach(d => { if (d.id !== myUid) updates[`unreadCounts.${d.id}`] = increment(1); });
        if (Object.keys(updates).length > 0) {
          await setDoc(doc(db, 'entranceGroupChats', subjectId), updates, { merge: true });
        }
      } catch (e) { console.error('Auto-share failed:', e); }
      finally { setSending(false); }
    };
    doSend();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Reset unread on open ── */
  useEffect(() => {
    if (!myUid || !subjectId) return;
    setDoc(doc(db, 'entranceGroupChats', subjectId),
      { [`unreadCounts.${myUid}`]: 0 },
      { merge: true }
    ).catch(() => {});
  }, [myUid, subjectId]);

  /* ── Join group ── */
  useEffect(() => {
    if (!myUid || !subjectId) return;
    setDoc(doc(db, 'entranceGroupChats', subjectId, 'members', myUid), {
      name: myName, joinedAt: serverTimestamp(), lastSeen: serverTimestamp(),
    }, { merge: true }).catch(() => {});
    getDocs(collection(db, 'entranceGroupChats', subjectId, 'members'))
      .then(snap => setMemberCount(snap.size))
      .catch(() => {});
  }, [myUid, subjectId, myName]);

  /* ── Messages listener ── */
  useEffect(() => {
    if (!subjectId) return;
    setLoading(true);
    const q = query(collection(db, colPath), orderBy('createdAt', 'asc'), limit(300));
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, err => { console.error(err); setLoading(false); });
    return unsub;
  }, [subjectId]);

  /* ── Typing indicator ── */
  useEffect(() => {
    if (!subjectId) return;
    const unsub = onSnapshot(
      collection(db, 'entranceGroupChats', subjectId, 'typing'),
      snap => {
        const now = Date.now();
        const active = {};
        snap.docs.forEach(d => {
          if (d.id === myUid) return;
          const data = d.data();
          const age = now - (data.updatedAt?.toDate?.()?.getTime?.() || 0);
          if (data.isTyping && age < 5000) active[d.id] = { name: data.name || 'Someone' };
        });
        setTyping(active);
      }
    );
    return unsub;
  }, [subjectId, myUid]);

  /* ── Auto-scroll ── */
  useEffect(() => {
    if (!loading) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
  }, [messages, loading, typing]);

  /* ── Close hamburger on outside click ── */
  useEffect(() => {
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  /* ── Typing indicator update ── */
  const updateTyping = useCallback((val) => {
    if (!subjectId || !myUid) return;
    setDoc(doc(db, 'entranceGroupChats', subjectId, 'typing', myUid), {
      isTyping: val, name: myName, updatedAt: serverTimestamp(),
    }, { merge: true }).catch(() => {});
  }, [subjectId, myUid, myName]);

  const handleInput = (e) => {
    setText(e.target.value);
    updateTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => updateTyping(false), 2500);
    const t = e.target;
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 120) + 'px';
  };

  /* ── Send text ── */
  const sendMessage = async () => {
    const trimmed = text.trim();
    if (!trimmed || !myUid || sending) return;
    setText('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setSending(true);
    clearTimeout(typingTimer.current);
    updateTyping(false);

    const replySnap = replyTo ? {
      text: replyTo.text || '', senderName: replyTo.senderName || '',
      senderId: replyTo.senderId, type: replyTo.type || 'text',
    } : null;
    setReplyTo(null);

    try {
      await addDoc(collection(db, colPath), {
        type: 'text', text: trimmed,
        senderId: myUid, senderName: myName,
        createdAt: serverTimestamp(),
        ...(replySnap ? { replyTo: replySnap } : {}),
      });
      await setDoc(doc(db, 'entranceGroupChats', subjectId), {
        lastMessage: trimmed, lastSenderName: myName,
        updatedAt: serverTimestamp(), subject: grp.label, icon: grp.icon,
      }, { merge: true });

      const memberSnap = await getDocs(collection(db, 'entranceGroupChats', subjectId, 'members'));
      const updates = {};
      memberSnap.docs.forEach(d => { if (d.id !== myUid) updates[`unreadCounts.${d.id}`] = increment(1); });
      if (Object.keys(updates).length > 0) {
        await setDoc(doc(db, 'entranceGroupChats', subjectId), updates, { merge: true });
      }
    } catch (e) { console.error('Send failed:', e); setText(trimmed); }
    finally { setSending(false); inputRef.current?.focus(); }
  };

  /* ── Send question ── */
  const sendQuestion = async (question, comment) => {
    if (!myUid) return;
    setShowPicker(false);
    setSending(true);
    try {
      await addDoc(collection(db, colPath), {
        type: 'question', text: comment || '', questionData: question,
        senderId: myUid, senderName: myName, createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'entranceGroupChats', subjectId), {
        lastMessage: `🚩 ${myName} shared a question`,
        lastSenderName: myName, updatedAt: serverTimestamp(),
      }, { merge: true });
      const memberSnap = await getDocs(collection(db, 'entranceGroupChats', subjectId, 'members'));
      const updates = {};
      memberSnap.docs.forEach(d => { if (d.id !== myUid) updates[`unreadCounts.${d.id}`] = increment(1); });
      if (Object.keys(updates).length > 0) {
        await setDoc(doc(db, 'entranceGroupChats', subjectId), updates, { merge: true });
      }
    } catch (e) { console.error('Question send failed:', e); }
    finally { setSending(false); }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const deleteMessage = async (msg) => {
    if (msg.senderId !== myUid) return;
    try {
      await updateDoc(doc(db, colPath, msg.id), { deleted: true, text: '', questionData: null, reactions: {} });
    } catch (e) { console.error(e); }
  };

  const reactToMessage = async (msg, emoji) => {
    try {
      const existing = (msg.reactions || {})[emoji] || 0;
      await updateDoc(doc(db, colPath, msg.id), {
        [`reactions.${emoji}`]: existing > 0 ? existing - 1 : existing + 1,
      });
    } catch (e) { console.error(e); }
  };

  const typingNames = Object.values(typing).map(t => t.name.split(' ')[0]);
  const typingText = typingNames.length === 1
    ? `${typingNames[0]} is typing…`
    : typingNames.length > 1 ? `${typingNames.slice(0, 2).join(', ')} are typing…` : '';

  useEffect(() => {
    const main = document.querySelector('.main-content');
    if (main) { main.style.overflow = 'hidden'; main.style.height = '100%'; }
    return () => { if (main) { main.style.overflow = ''; main.style.height = ''; } };
  }, []);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100dvh - 60px)',
      background: '#0B141A', color: '#E9EDEF',
      overflow: 'hidden', position: 'relative', fontFamily: F,
    }}>
      <style>{`
        @keyframes ctxPop { from { opacity:0; transform:scale(0.92);} to { opacity:1; transform:scale(1);} }
        @keyframes slideUp { from { transform:translateY(20px);opacity:0;} to { transform:translateY(0);opacity:1;} }
        @keyframes typingDot { 0%,60%,100% { transform:translateY(0);opacity:0.4;} 30% { transform:translateY(-5px);opacity:1;} }
        @keyframes bubblePop { from { opacity:0;transform:translateY(8px) scale(0.97);} to { opacity:1;transform:none;} }
        @keyframes spin { to { transform:rotate(360deg); } }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1);border-radius:4px; }
        .msg-area { scroll-behavior:smooth; }
        .grp-textarea:focus { outline:none; }
        .grp-textarea { resize:none; }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{
        background: '#1F2C34', padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0, position: 'relative', zIndex: 20,
      }}>
        <button onClick={() => navigate('/entrance-exam/group-chat')} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 22, color: accentColor, fontWeight: 900, lineHeight: 1, padding: '2px 4px',
        }}>←</button>

        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: `linear-gradient(135deg, ${accentColor}dd, ${accentColor}55)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, boxShadow: `0 3px 10px ${accentColor}44`,
        }}>{grp.icon}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: H, fontWeight: 900,
            fontSize: 'clamp(0.9rem,2.5vw,1.05rem)',
            color: '#E9EDEF',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{grp.label}</div>
          <div style={{
            fontSize: 11, fontFamily: F, fontWeight: 700,
            color: typingText ? '#25D366' : '#8696A0', transition: 'color 0.2s',
          }}>
            {typingText || `${memberCount} members`}
          </div>
        </div>

        {/* Hamburger menu */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowMenu(v => !v)}
            style={{
              background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 10,
              padding: '8px 11px', cursor: 'pointer', color: '#8696A0',
              display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', justifyContent: 'center',
            }}
          >
            {[0,1,2].map(i => (
              <div key={i} style={{ width: 18, height: 2, background: '#8696A0', borderRadius: 2 }} />
            ))}
          </button>

          {showMenu && (
            <div style={{
              position: 'absolute', top: '110%', right: 0,
              background: '#1F2C34', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 14, overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)', minWidth: 210,
              animation: 'ctxPop 0.15s ease', zIndex: 100,
            }}>
              <button onClick={() => { setShowMenu(false); setShowPicker(true); }} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', padding: '13px 16px', border: 'none', cursor: 'pointer',
                background: `${accentColor}18`, color: accentColor,
                fontFamily: F, fontWeight: 700, fontSize: 14,
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}>
                <span style={{ fontSize: 18 }}>🚩</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontFamily: H, fontWeight: 900, fontSize: 13 }}>Insert Flagged Question</div>
                  <div style={{ fontSize: 11, color: '#8696A0', marginTop: 1 }}>Share a bookmarked question</div>
                </div>
              </button>
              <button onClick={() => { setShowMenu(false); navigate('/entrance-exam/bookmarks', { state: { fromChat: subjectId, groupLabel: grp.label } }); }} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', padding: '13px 16px', border: 'none', cursor: 'pointer',
                background: 'transparent', color: '#E9EDEF',
                fontFamily: F, fontWeight: 700, fontSize: 14,
                borderBottom: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.1s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontSize: 18 }}>🔖</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontFamily: H, fontWeight: 900, fontSize: 13 }}>My Bookmarks</div>
                  <div style={{ fontSize: 11, color: '#8696A0', marginTop: 1 }}>View saved entrance questions</div>
                </div>
              </button>
              <button onClick={() => { setShowMenu(false); navigate('/entrance-exam'); }} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', padding: '13px 16px', border: 'none', cursor: 'pointer',
                background: 'transparent', color: '#E9EDEF',
                fontFamily: F, fontWeight: 700, fontSize: 14, transition: 'background 0.1s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontSize: 18 }}>🏠</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontFamily: H, fontWeight: 900, fontSize: 13 }}>Entrance Exam Home</div>
                  <div style={{ fontSize: 11, color: '#8696A0', marginTop: 1 }}>Go to entrance exam hub</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── MESSAGES AREA ── */}
      <div className="msg-area" style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        padding: '12px 12px 4px',
        display: 'flex', flexDirection: 'column', minHeight: 0,
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.012'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              border: `3px solid ${accentColor}22`, borderTopColor: accentColor,
              animation: 'spin 0.8s linear infinite',
            }} />
          </div>
        ) : messages.length === 0 ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 14, textAlign: 'center', padding: 32,
          }}>
            <div style={{ fontSize: 64 }}>{grp.icon}</div>
            <div style={{ fontFamily: H, fontWeight: 900, fontSize: 20, color: '#E9EDEF' }}>
              Welcome to {grp.label}
            </div>
            <div style={{
              fontSize: 13, fontWeight: 700, color: '#8696A0', maxWidth: 300, lineHeight: 1.75,
            }}>
              This is the start of the <strong style={{ color: accentColor }}>{grp.label}</strong> entrance exam group.
              Discuss questions, share tips, and drop flagged questions using the <strong style={{ color: accentColor }}>☰ menu</strong>.
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={msg.id} style={{ animation: 'bubblePop 0.18s ease' }}>
                <Bubble
                  msg={msg}
                  isMe={msg.senderId === myUid}
                  prevMsg={i > 0 ? messages[i - 1] : null}
                  nextMsg={i < messages.length - 1 ? messages[i + 1] : null}
                  accentColor={accentColor}
                  onSwipeReply={m => { setReplyTo(m); inputRef.current?.focus(); }}
                  onLongPress={(m, x, y) => setCtxMenu({ msg: m, x, y })}
                />
              </div>
            ))}
            {typingText && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 8, paddingLeft: 40 }}>
                <div style={{
                  padding: '10px 14px', background: '#1F2C34',
                  borderRadius: '18px 18px 18px 4px',
                  display: 'flex', gap: 5, alignItems: 'center',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
                }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      width: 7, height: 7, borderRadius: '50%', background: '#8696A0',
                      display: 'inline-block', animation: 'typingDot 1.2s ease infinite',
                      animationDelay: `${i * 0.2}s`,
                    }} />
                  ))}
                </div>
                <span style={{ fontSize: 11, color: '#8696A0', fontFamily: F, fontWeight: 700 }}>
                  {typingText}
                </span>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Context menu ── */}
      {ctxMenu && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.3)' }}
          onClick={() => setCtxMenu(null)}>
          <div onClick={e => e.stopPropagation()}>
            <ContextMenu
              x={ctxMenu.x} y={ctxMenu.y}
              isMe={ctxMenu.msg.senderId === myUid}
              accentColor={accentColor}
              onReply={() => { setReplyTo(ctxMenu.msg); inputRef.current?.focus(); }}
              onCopy={() => navigator.clipboard?.writeText(ctxMenu.msg.text || '').catch(() => {})}
              onDelete={() => deleteMessage(ctxMenu.msg)}
              onReact={(emoji) => reactToMessage(ctxMenu.msg, emoji)}
              onClose={() => setCtxMenu(null)}
            />
          </div>
        </div>
      )}

      {/* ── INPUT AREA ── */}
      <div style={{ background: '#1F2C34', flexShrink: 0 }}>
        {replyTo && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(255,255,255,0.04)',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            borderLeft: `3px solid ${accentColor}`,
            padding: '8px 14px',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: accentColor, fontFamily: F, marginBottom: 2 }}>
                {replyTo.senderId === myUid ? 'You' : replyTo.senderName || 'Student'}
              </div>
              <div style={{
                fontSize: 12, fontWeight: 700, color: '#94A3B8', fontFamily: F,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {replyTo.type === 'question' ? '🚩 Flagged Question' : replyTo.text}
              </div>
            </div>
            <button onClick={() => setReplyTo(null)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#64748B', fontSize: 18, lineHeight: 1, padding: 4,
            }}>✕</button>
          </div>
        )}

        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 8,
          padding: '8px 10px', borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <button onClick={() => setShowPicker(true)} title="Insert flagged question" style={{
            background: `${accentColor}22`, border: `1px solid ${accentColor}44`,
            borderRadius: '50%', width: 40, height: 40, flexShrink: 0, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, transition: 'background 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = `${accentColor}44`}
            onMouseLeave={e => e.currentTarget.style.background = `${accentColor}22`}
          >🚩</button>

          <textarea
            ref={inputRef}
            className="grp-textarea"
            value={text}
            onChange={handleInput}
            onKeyDown={handleKey}
            placeholder={`Message ${grp.label}…`}
            rows={1}
            style={{
              flex: 1, background: '#2A3942', border: 'none', borderRadius: 22,
              padding: '10px 16px', color: '#E9EDEF',
              fontFamily: F, fontWeight: 700, fontSize: 14,
              lineHeight: 1.5, maxHeight: 120, overflowY: 'auto',
            }}
          />

          {text.trim() ? (
            <button onClick={sendMessage} disabled={sending} style={{
              width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
              background: accentColor, border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 2px 10px ${accentColor}55`, transition: 'transform 0.12s',
            }}
              onMouseDown={e => e.currentTarget.style.transform = 'scale(0.9)'}
              onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"
                  stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <div style={{
              width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, color: '#8696A0',
            }}>💬</div>
          )}
        </div>
      </div>

      {/* ── Flag Question Picker Modal ── */}
      {showPicker && (
        <FlaggedQuestionPicker
          userId={myUid}
          onSelect={sendQuestion}
          onClose={() => setShowPicker(false)}
          accentColor={accentColor}
        />
      )}
    </div>
  );
}
