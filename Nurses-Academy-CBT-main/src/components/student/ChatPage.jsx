// src/components/student/ChatPage.jsx
// Route: /chat/:uid
// WhatsApp-style realtime 1-on-1 chat

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate }       from 'react-router-dom';
import {
  collection, doc, getDoc, addDoc, onSnapshot,
  query, orderBy, limit, serverTimestamp, updateDoc, setDoc, deleteDoc, increment,
} from 'firebase/firestore';
import { db, storage } from '../../firebase/config';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../context/AuthContext';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

/* ─── EMOJI PICKER DATA ─────────────────────────────────────── */
const EMOJI_GROUPS = [
  { label: '😊 Faces',    emojis: ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳'] },
  { label: '👍 Hands',    emojis: ['👍','👎','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👏','🙌','👐','🤲','🤝','🙏','✍️','💪','🦾','🦿','🦵','🦶','👋','🤚','🖐️','✋'] },
  { label: '❤️ Hearts',   emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈'] },
  { label: '🎉 Party',    emojis: ['🎉','🎊','🎈','🎁','🎀','🎗️','🎟️','🎫','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🎪','🤹','🎭','🎨','🖼️','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🪕','🎻'] },
  { label: '📚 Study',    emojis: ['📚','📖','📝','✏️','🖊️','🖋️','📓','📔','📒','📕','📗','📘','📙','📃','📄','📑','📊','📈','📉','🗒️','🗓️','📆','📅','🗑️','📌','📍','✂️','🗃️','🗄️','🗂️','💼','📂'] },
  { label: '💊 Medical',  emojis: ['💊','💉','🩺','🩹','🏥','🩻','🧬','🔬','🩸','🧪','🧫','🧲','⚗️','🔭','🩼','🦽','🦼','🛁','🚿','🪥','🧴','🧹','🧺','🧻','🪣','🧼','🫧','🪒','🧽','🪠','🪤'] },
];

/* ─── HELPERS ──────────────────────────────────────────────── */
function getChatId(a, b) { return [a, b].sort().join('_'); }

function formatTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(ts) {
  if (!ts) return '';
  const d  = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString())       return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function sameDay(ts1, ts2) {
  if (!ts1 || !ts2) return false;
  const a = ts1.toDate ? ts1.toDate() : new Date(ts1);
  const b = ts2.toDate ? ts2.toDate() : new Date(ts2);
  return a.toDateString() === b.toDateString();
}

// Wrap a promise so it can never hang forever — rejects with `message`
// after `ms` if the underlying promise hasn't settled yet.
function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

/* ─── SUB-COMPONENTS ───────────────────────────────────────── */
function Spinner() {
  return (
    <div style={{ display:'flex', justifyContent:'center', padding:60 }}>
      <div style={{
        width:40, height:40, borderRadius:'50%',
        border:'3px solid rgba(13,148,136,0.15)',
        borderTopColor:'#0D9488',
        animation:'spin 0.8s linear infinite',
      }} />
    </div>
  );
}

function Avatar({ name='', size=40 }) {
  const initials = name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2) || '?';
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%', flexShrink:0,
      background:'linear-gradient(135deg,#0D9488,#1E3A8A)',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:H, fontWeight:900, color:'#fff', fontSize:size*0.38,
    }}>{initials}</div>
  );
}

/* Tick icons exactly like WhatsApp */
function Ticks({ status }) {
  // status: 'sending' | 'sent' | 'delivered' | 'read'
  if (status === 'sending') return (
    <svg width="14" height="10" viewBox="0 0 14 10" style={{ opacity:0.5 }}>
      <circle cx="7" cy="5" r="4" stroke="#fff" strokeWidth="1.5" fill="none"
        strokeDasharray="6 20" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate"
          from="0 7 5" to="360 7 5" dur="1s" repeatCount="indefinite"/>
      </circle>
    </svg>
  );
  if (status === 'sent') return (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
      <path d="M1 5L4.5 8.5L9 3" stroke="rgba(255,255,255,0.6)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  if (status === 'delivered') return (
    <svg width="18" height="10" viewBox="0 0 18 10" fill="none">
      <path d="M1 5L4.5 8.5L9 3" stroke="rgba(255,255,255,0.6)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 5L8.5 8.5L13 3" stroke="rgba(255,255,255,0.6)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  // read — blue ticks
  return (
    <svg width="18" height="10" viewBox="0 0 18 10" fill="none">
      <path d="M1 5L4.5 8.5L9 3" stroke="#53BDEB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 5L8.5 8.5L13 3" stroke="#53BDEB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/* Context menu — shows on long-press / right-click */
function ContextMenu({ x, y, isMe, onReply, onCopy, onDelete, onClose }) {
  const menuRef = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler); };
  }, [onClose]);

  // Clamp to viewport
  const menuW = 160, menuH = isMe ? 120 : 80;
  const safeX = Math.min(x, window.innerWidth  - menuW - 8);
  const safeY = Math.min(y, window.innerHeight - menuH - 8);

  const items = [
    { icon:'↩️', label:'Reply',   action: onReply },
    { icon:'📋', label:'Copy',    action: onCopy  },
    ...(isMe ? [{ icon:'🗑️', label:'Delete', action: onDelete, danger: true }] : []),
  ];

  return (
    <div ref={menuRef} style={{
      position:'fixed', left:safeX, top:safeY, zIndex:9999,
      background:'var(--bg-card,#0B1826)',
      border:'1px solid rgba(255,255,255,0.12)',
      borderRadius:12, overflow:'hidden',
      boxShadow:'0 8px 32px rgba(0,0,0,0.5)',
      minWidth:menuW,
      animation:'ctxPop 0.12s ease',
    }}>
      {items.map(it => (
        <button key={it.label} onClick={() => { it.action(); onClose(); }} style={{
          display:'flex', alignItems:'center', gap:10,
          width:'100%', padding:'11px 16px', border:'none', cursor:'pointer',
          background:'transparent',
          color: it.danger ? '#EF4444' : 'var(--text-primary,#F1F5F9)',
          fontFamily:F, fontWeight:700, fontSize:14,
          transition:'background 0.1s',
        }}
          onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.06)'}
          onMouseLeave={e => e.currentTarget.style.background='transparent'}
        >
          <span style={{fontSize:16}}>{it.icon}</span> {it.label}
        </button>
      ))}
    </div>
  );
}

/* Reply preview bar above input */
function ReplyBar({ msg, myUid, onCancel }) {
  if (!msg) return null;
  const isMe = msg.senderId === myUid;
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:10,
      background:'var(--bg-secondary,rgba(255,255,255,0.04))',
      borderTop:'1px solid rgba(255,255,255,0.07)',
      borderLeft:'3px solid #0D9488',
      padding:'8px 14px',
    }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#0D9488', fontFamily:F, marginBottom:2 }}>
          {isMe ? 'You' : msg.senderName || 'Student'}
        </div>
        <div style={{
          fontSize:12, fontWeight:700, color:'var(--text-muted,#94A3B8)', fontFamily:F,
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
        }}>
          {msg.text}
        </div>
      </div>
      <button onClick={onCancel} style={{
        background:'none', border:'none', cursor:'pointer',
        color:'var(--text-muted,#64748B)', fontSize:18, lineHeight:1, padding:4,
      }}>✕</button>
    </div>
  );
}

/* Individual message bubble */
function Bubble({ msg, isMe, theirName, prevMsg, onContextMenu, onReactionPick }) {
  const longPressTimer = useRef(null);

  const showDateDiv = !prevMsg || !sameDay(prevMsg.createdAt, msg.createdAt);
  const showAvatar  = !isMe && (!prevMsg || prevMsg.senderId !== msg.senderId || showDateDiv);

  // Determine tick status
  let tickStatus = 'sent';
  if (msg._optimistic)  tickStatus = 'sending';
  else if (msg.read)    tickStatus = 'read';
  else if (msg.delivered) tickStatus = 'delivered';

  const handleLongPress = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    longPressTimer.current = setTimeout(() => onContextMenu(msg, x, y), 500);
  };
  const cancelLong = () => clearTimeout(longPressTimer.current);

  const handleRightClick = (e) => {
    e.preventDefault();
    onContextMenu(msg, e.clientX, e.clientY);
  };

  /* Reactions display */
  const reactions = msg.reactions || {};
  const reactionList = Object.entries(reactions); // [emoji, count]

  return (
    <>
      {/* ── Date divider ── */}
      {showDateDiv && (
        <div style={{ display:'flex', alignItems:'center', gap:10, margin:'16px 0 8px' }}>
          <div style={{ flex:1, height:1, background:'rgba(255,255,255,0.06)' }} />
          <span style={{
            fontSize:11, fontFamily:F, fontWeight:700,
            color:'var(--text-muted,#64748B)',
            background:'var(--bg-secondary,rgba(255,255,255,0.04))',
            border:'1px solid rgba(255,255,255,0.07)',
            borderRadius:20, padding:'3px 12px',
          }}>
            {formatDateLabel(msg.createdAt)}
          </span>
          <div style={{ flex:1, height:1, background:'rgba(255,255,255,0.06)' }} />
        </div>
      )}

      {/* ── Bubble row ── */}
      <div style={{
        display:'flex',
        flexDirection: isMe ? 'row-reverse' : 'row',
        alignItems:'flex-end',
        gap:6,
        marginBottom: reactionList.length ? 18 : 4,
        paddingLeft: isMe ? 48 : 0,
        paddingRight: isMe ? 0 : 48,
        position:'relative',
      }}>
        {/* Avatar — only shown for first message in a group */}
        <div style={{ width:32, flexShrink:0 }}>
          {showAvatar && !isMe && <Avatar name={theirName} size={30} />}
        </div>

        <div style={{ maxWidth:'78%', display:'flex', flexDirection:'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
          {/* Reply preview inside bubble */}
          {msg.replyTo && (
            <div style={{
              background: isMe ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.07)',
              borderLeft:'3px solid rgba(255,255,255,0.4)',
              borderRadius:'8px 8px 0 0',
              padding:'6px 10px 4px',
              marginBottom: -4,
              maxWidth:'100%',
              width:'100%',
            }}>
              <div style={{ fontSize:11, fontWeight:700, color: isMe ? 'rgba(255,255,255,0.75)' : '#0D9488', fontFamily:F }}>
                {msg.replyTo.senderName}
              </div>
              <div style={{
                fontSize:12, fontWeight:700,
                color: isMe ? 'rgba(255,255,255,0.6)' : 'var(--text-muted,#94A3B8)',
                fontFamily:F, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
              }}>
                {msg.replyTo.text}
              </div>
            </div>
          )}

          {/* Main bubble */}
          <div
            onTouchStart={handleLongPress} onTouchEnd={cancelLong} onTouchMove={cancelLong}
            onMouseDown={handleLongPress}  onMouseUp={cancelLong}  onMouseLeave={cancelLong}
            onContextMenu={handleRightClick}
            style={{
              padding: msg.type === 'image' ? '3px' : '8px 12px 6px',
              borderRadius: isMe
                ? (msg.replyTo ? '0 12px 4px 12px' : '18px 18px 4px 18px')
                : (msg.replyTo ? '12px 0 12px 4px' : '18px 18px 18px 4px'),
              background: isMe
                ? 'linear-gradient(135deg,#005C4B,#00897B)'
                : 'var(--bg-secondary,#1F2C34)',
              color:'#E9EDEF',
              fontFamily:F, fontWeight:700, fontSize:14, lineHeight:1.55,
              wordBreak:'break-word',
              userSelect:'none',
              cursor:'default',
              boxShadow:'0 1px 2px rgba(0,0,0,0.4)',
              position:'relative',
            }}
          >
            {msg.deleted ? (
              <span style={{ fontStyle:'italic', opacity:0.55, fontSize:13 }}>
                🚫 This message was deleted
              </span>
            ) : msg.type === 'audio' ? (
              <>
                <AudioBubble src={msg.audioUrl} duration={msg.duration} isMe={isMe} />
                <span style={{
                  float:'right', marginLeft:8, marginTop:4,
                  display:'inline-flex', alignItems:'center', gap:3,
                  fontSize:10, color: isMe ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.4)',
                  fontFamily:F, fontWeight:700,
                  transform:'translateY(2px)',
                  whiteSpace:'nowrap',
                }}>
                  {formatTime(msg.createdAt)}
                  {isMe && <Ticks status={tickStatus} />}
                </span>
              </>
            ) : msg.type === 'image' ? (
              <div style={{ padding:0, overflow:'hidden' }}>
                <ImageBubble src={msg.imageUrl} isOptimistic={!!msg._optimistic} />
                <div style={{
                  display:'flex', justifyContent:'flex-end', alignItems:'center', gap:3,
                  padding:'4px 4px 0',
                  fontSize:10, color: isMe ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.4)',
                  fontFamily:F, fontWeight:700,
                }}>
                  {formatTime(msg.createdAt)}
                  {isMe && <Ticks status={tickStatus} />}
                </div>
              </div>
            ) : (
              <>
                <span>{msg.text}</span>
                {/* Time + ticks inline at bottom right — WhatsApp style */}
                <span style={{
                  float:'right', marginLeft:8, marginTop:4,
                  display:'inline-flex', alignItems:'center', gap:3,
                  fontSize:10, color: isMe ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.4)',
                  fontFamily:F, fontWeight:700,
                  transform:'translateY(2px)',
                  whiteSpace:'nowrap',
                }}>
                  {formatTime(msg.createdAt)}
                  {isMe && <Ticks status={tickStatus} />}
                </span>
              </>
            )}
          </div>

          {/* Reactions */}
          {reactionList.length > 0 && (
            <div style={{
              display:'flex', gap:4, flexWrap:'wrap',
              marginTop:4,
              justifyContent: isMe ? 'flex-end' : 'flex-start',
            }}>
              {reactionList.map(([emoji, count]) => (
                <span key={emoji} style={{
                  background:'var(--bg-secondary,rgba(255,255,255,0.08))',
                  border:'1px solid rgba(255,255,255,0.12)',
                  borderRadius:20, padding:'2px 7px',
                  fontSize:13, fontFamily:F, fontWeight:700,
                  color:'var(--text-primary,#F1F5F9)',
                  cursor:'pointer',
                }} onClick={() => onReactionPick(msg, emoji)}>
                  {emoji}{count > 1 ? ` ${count}` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* Emoji picker panel */
function EmojiPicker({ onPick, onClose }) {
  const [tab, setTab] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    setTimeout(() => document.addEventListener('mousedown', h), 10);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  return (
    <div ref={ref} style={{
      position:'absolute', bottom:'100%', left:0, right:0,
      background:'var(--bg-card,#0B1826)',
      border:'1px solid rgba(255,255,255,0.1)',
      borderRadius:'12px 12px 0 0',
      boxShadow:'0 -8px 32px rgba(0,0,0,0.5)',
      zIndex:500,
      animation:'slideUp 0.18s ease',
      maxHeight:300,
      display:'flex', flexDirection:'column',
    }}>
      {/* Tabs */}
      <div style={{ display:'flex', overflowX:'auto', borderBottom:'1px solid rgba(255,255,255,0.07)', padding:'4px 8px 0', gap:4 }}>
        {EMOJI_GROUPS.map((g,i) => (
          <button key={i} onClick={() => setTab(i)} style={{
            background:'none', border:'none', cursor:'pointer',
            padding:'6px 10px', fontSize:16, borderRadius:'8px 8px 0 0',
            background: tab===i ? 'rgba(13,148,136,0.15)' : 'transparent',
            borderBottom: tab===i ? '2px solid #0D9488' : '2px solid transparent',
            flexShrink:0,
          }}>{g.emojis[0]}</button>
        ))}
      </div>
      {/* Grid */}
      <div style={{ overflowY:'auto', flex:1, padding:'8px 10px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(8,1fr)', gap:4 }}>
          {EMOJI_GROUPS[tab].emojis.map(e => (
            <button key={e} onClick={() => onPick(e)} style={{
              background:'none', border:'none', cursor:'pointer',
              fontSize:22, padding:4, borderRadius:8,
              transition:'background 0.1s',
            }}
              onMouseEnter={ev => ev.currentTarget.style.background='rgba(255,255,255,0.08)'}
              onMouseLeave={ev => ev.currentTarget.style.background='transparent'}
            >{e}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── AUDIO BUBBLE ──────────────────────────────────────────── */
function AudioBubble({ src, duration, isMe }) {
  const [playing, setPlaying]   = useState(false);
  const [current, setCurrent]   = useState(0);
  const [total,   setTotal]     = useState(duration || 0);
  const audioRef = useRef(null);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); }
    else         { a.play().catch(()=>{}); }
    setPlaying(!playing);
  };

  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2,'0')}`;
  };

  const pct = total > 0 ? (current / total) * 100 : 0;

  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:200, maxWidth:260 }}>
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={e => setCurrent(e.target.currentTime)}
        onLoadedMetadata={e => setTotal(e.target.duration || duration || 0)}
        onEnded={() => { setPlaying(false); setCurrent(0); }}
      />
      <button onClick={toggle} style={{
        width:38, height:38, borderRadius:'50%', flexShrink:0,
        background: isMe ? 'rgba(255,255,255,0.2)' : 'rgba(13,148,136,0.3)',
        border:'none', cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center',
        color:'#fff', fontSize:16,
      }}>
        {playing ? '⏸' : '▶'}
      </button>
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:4 }}>
        <div style={{
          height:4, borderRadius:4,
          background: isMe ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
          position:'relative', cursor:'pointer',
        }} onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          if (audioRef.current) { audioRef.current.currentTime = ratio * total; }
        }}>
          <div style={{
            position:'absolute', left:0, top:0, bottom:0,
            width: pct + '%',
            background: isMe ? 'rgba(255,255,255,0.85)' : '#0D9488',
            borderRadius:4, transition:'width 0.1s',
          }} />
        </div>
        <div style={{
          fontSize:10, fontFamily:"'Times New Roman',serif", fontWeight:700,
          color: isMe ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.4)',
        }}>
          {fmt(playing ? current : total)}
        </div>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink:0, opacity:0.5 }}>
        <rect x="9" y="2" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="2"/>
        <path d="M5 10a7 7 0 0014 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

/* ─── IMAGE BUBBLE ──────────────────────────────────────────── */
function ImageBubble({ src, isOptimistic }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div style={{ position:'relative', cursor:'pointer', borderRadius:12, overflow:'hidden', maxWidth:240 }}
        onClick={() => !isOptimistic && setOpen(true)}>
        <img src={src} alt="photo"
          style={{ display:'block', width:'100%', maxWidth:240, maxHeight:320, objectFit:'cover', borderRadius:12 }}
          onError={e => { e.target.style.display='none'; }}
        />
        {isOptimistic && (
          <div style={{
            position:'absolute', inset:0, background:'rgba(0,0,0,0.45)',
            display:'flex', alignItems:'center', justifyContent:'center', borderRadius:12,
          }}>
            <div style={{
              width:28, height:28, borderRadius:'50%',
              border:'3px solid rgba(255,255,255,0.3)',
              borderTopColor:'#fff',
              animation:'spin 0.8s linear infinite',
            }} />
          </div>
        )}
      </div>
      {/* Full-screen lightbox */}
      {open && (
        <div style={{
          position:'fixed', inset:0, zIndex:9999,
          background:'rgba(0,0,0,0.92)',
          display:'flex', alignItems:'center', justifyContent:'center',
        }} onClick={() => setOpen(false)}>
          <img src={src} alt="photo"
            style={{ maxWidth:'95vw', maxHeight:'95vh', objectFit:'contain', borderRadius:8 }} />
          <button onClick={() => setOpen(false)} style={{
            position:'absolute', top:16, right:16,
            background:'rgba(255,255,255,0.12)', border:'none', borderRadius:'50%',
            width:40, height:40, cursor:'pointer', color:'#fff', fontSize:20,
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>✕</button>
          <a href={src} download target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
            style={{
              position:'absolute', bottom:24,
              background:'rgba(13,148,136,0.85)', color:'#fff',
              padding:'10px 22px', borderRadius:24,
              fontFamily:"'Times New Roman',serif", fontWeight:700, fontSize:13,
              textDecoration:'none',
            }}>⬇ Download</a>
        </div>
      )}
    </>
  );
}

/* ─── IMAGE PREVIEW MODAL (before sending) ──────────────────── */
function ImagePreviewModal({ preview, onSend, onCancel }) {
  if (!preview) return null;
  return (
    <div style={{
      position:'fixed', inset:0, zIndex:9000,
      background:'rgba(0,0,0,0.88)',
      display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center', gap:20,
    }}>
      <img src={preview.url} alt="preview"
        style={{ maxWidth:'88vw', maxHeight:'65vh', objectFit:'contain', borderRadius:12 }} />
      <div style={{ fontSize:13, color:'rgba(255,255,255,0.55)', fontFamily:"'Times New Roman',serif", fontWeight:700 }}>
        {preview.file.name} · {(preview.file.size/1024).toFixed(0)} KB
      </div>
      <div style={{ display:'flex', gap:16 }}>
        <button onClick={onCancel} style={{
          padding:'12px 28px', borderRadius:24,
          background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.15)',
          color:'#E9EDEF', fontFamily:"'Times New Roman',serif", fontWeight:700, fontSize:15,
          cursor:'pointer',
        }}>Cancel</button>
        <button onClick={() => onSend(preview.file)} style={{
          padding:'12px 32px', borderRadius:24,
          background:'#00A884', border:'none',
          color:'#fff', fontFamily:"'Times New Roman',serif", fontWeight:700, fontSize:15,
          cursor:'pointer', boxShadow:'0 4px 14px rgba(0,168,132,0.4)',
        }}>📤 Send</button>
      </div>
    </div>
  );
}

/* ─── VOICE RECORDER UI ─────────────────────────────────────── */
function VoiceRecorder({ onSend, onCancel }) {
  const [secs,    setSecs]    = useState(0);
  const [state,   setState]   = useState('recording');
  const [blob,    setBlob]    = useState(null);
  const [error,   setError]   = useState('');
  const mediaRecRef  = useRef(null);
  const chunksRef    = useRef([]);
  const timerRef     = useRef(null);
  const audioPreview = useRef(null);

  useEffect(() => {
    startRecording();
    return () => {
      clearInterval(timerRef.current);
      if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
        mediaRecRef.current.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const b = new Blob(chunksRef.current, { type: mimeType });
        setBlob(b);
        setState('stopped');
      };
      mr.start(200);
      timerRef.current = setInterval(() => setSecs(s => s + 1), 1000);
    } catch(e) {
      setError('Microphone access denied. Please allow mic permission and try again.');
    }
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
      mediaRecRef.current.stop();
    }
  };

  const handleSend = () => {
    if (!blob) return;
    setState('uploading');
    onSend(blob, secs);
  };

  const fmt = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;

  if (error) return (
    <div style={{ padding:'10px 14px', color:'#EF4444', fontSize:12, fontFamily:"'Times New Roman',serif", fontWeight:700, display:'flex', alignItems:'center', gap:10 }}>
      ⚠️ {error}
      <button onClick={onCancel} style={{ background:'none', border:'none', cursor:'pointer', color:'#8696A0', fontSize:18 }}>✕</button>
    </div>
  );

  return (
    <div style={{
      display:'flex', alignItems:'center', gap:10,
      padding:'10px 14px',
      background:'#1F2C34',
      borderTop:'1px solid rgba(255,255,255,0.06)',
    }}>
      <button onClick={onCancel} style={{
        background:'none', border:'none', cursor:'pointer',
        color:'#EF4444', fontSize:22, lineHeight:1, padding:4, flexShrink:0,
      }}>🗑️</button>
      <div style={{ flex:1, display:'flex', alignItems:'center', gap:10, minWidth:0, overflow:'hidden' }}>
        {state === 'recording' && (
          <div style={{ width:10, height:10, borderRadius:'50%', background:'#EF4444', flexShrink:0,
            animation:'recPulse 1s ease infinite' }} />
        )}
        {state === 'stopped' && <span style={{ fontSize:16 }}>🎤</span>}
        {state === 'uploading' && <span style={{ fontSize:13, color:'#0D9488', fontFamily:"'Times New Roman',serif", fontWeight:700 }}>Sending…</span>}
        <span style={{
          fontFamily:"'Times New Roman',serif", fontWeight:700, fontSize:16,
          color:'#E9EDEF', minWidth:42,
        }}>{fmt(secs)}</span>
        {state === 'recording' && (
          <div style={{ display:'flex', alignItems:'center', gap:2, flex:1 }}>
            {Array.from({length:20}).map((_,i) => (
              <div key={i} style={{
                width:3, borderRadius:2,
                background:'rgba(13,148,136,0.6)',
                height: (Math.sin(i*0.8)*10 + 14) + 'px',
                animation:'waveBar 0.8s ease infinite',
                animationDelay: (i * 0.05) + 's',
              }} />
            ))}
          </div>
        )}
        {state === 'stopped' && blob && (
          <audio ref={audioPreview} src={URL.createObjectURL(blob)} controls
            style={{ flex:1, minWidth:0, width:'100%', maxWidth:'100%', height:32, filter:'invert(1) hue-rotate(180deg)' }} />
        )}
      </div>
      {state === 'recording' && (
        <button onClick={stopRecording} style={{
          width:44, height:44, borderRadius:'50%', flexShrink:0,
          background:'#EF4444', border:'none', cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <div style={{ width:14, height:14, background:'#fff', borderRadius:2 }} />
        </button>
      )}
      {state === 'stopped' && (
        <button onClick={handleSend} disabled={!blob} style={{
          width:44, height:44, borderRadius:'50%', flexShrink:0,
          background:'#00A884', border:'none', cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"
              stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
    </div>
  );
}

/* Quick reaction strip — shown in context menu or tap */
const QUICK_REACTIONS = ['❤️','😂','😮','😢','🙏','👍'];
function QuickReactionBar({ onPick }) {
  return (
    <div style={{
      display:'flex', gap:6, padding:'6px 12px',
      borderBottom:'1px solid rgba(255,255,255,0.07)',
    }}>
      {QUICK_REACTIONS.map(e => (
        <button key={e} onClick={() => onPick(e)} style={{
          background:'none', border:'none', cursor:'pointer',
          fontSize:24, padding:'2px 4px', borderRadius:8,
          transition:'transform 0.1s',
        }}
          onMouseEnter={ev => ev.currentTarget.style.transform='scale(1.3)'}
          onMouseLeave={ev => ev.currentTarget.style.transform='scale(1)'}
        >{e}</button>
      ))}
    </div>
  );
}

/* ─── MAIN COMPONENT ────────────────────────────────────────── */
export default function ChatPage() {
  const { uid: theirUid } = useParams();
  const { state }          = useLocation();
  const { user, profile }  = useAuth();
  const navigate           = useNavigate();

  const myUid  = user?.uid;
  const chatId = myUid && theirUid ? getChatId(myUid, theirUid) : null;

  /* ── State ── */
  const [theirProfile, setTheirProfile] = useState(null);
  const [messages,     setMessages]     = useState([]);
  const [text,         setText]         = useState('');
  const [loading,      setLoading]      = useState(true);
  const [sending,      setSending]      = useState(false);
  const [typing,       setTyping]       = useState(false);
  const [myTyping,     setMyTyping]     = useState(false);
  const [showEmoji,    setShowEmoji]    = useState(false);
  const [sendError,    setSendError]    = useState('');
  const [replyTo,      setReplyTo]      = useState(null);   // msg being replied to
  const [ctxMenu,      setCtxMenu]      = useState(null);   // { msg, x, y }
  const [showCtxReact, setShowCtxReact] = useState(false);
  const [showVoice,    setShowVoice]    = useState(false);  // voice recorder open
  const [imgPreview,   setImgPreview]   = useState(null);   // { file, url } before send

  const bottomRef   = useRef(null);
  const inputRef    = useRef(null);
  const typingTimer = useRef(null);
  const inputWrap   = useRef(null);
  const imgFileRef  = useRef(null);

  /* ── Derived ── */
  const theirName   = state?.name   || theirProfile?.name   || theirProfile?.displayName || 'Student';
  const theirSchool = state?.school || theirProfile?.school || '';
  const myName      = profile?.name || user?.displayName    || 'Me';

  /* ── Clear MY unread count when I open this chat ── */
  useEffect(() => {
    if (!chatId || !myUid) return;
    // Reset my unread count to 0 for this chat
    setDoc(doc(db, 'directChats', chatId),
      { [`unreadCounts.${myUid}`]: 0 },
      { merge: true }
    ).catch(() => {});
  }, [chatId, myUid]);

  /* ── Load their profile ── */
  useEffect(() => {
    if (!theirUid) return;
    getDoc(doc(db, 'users', theirUid))
      .then(s => { if (s.exists()) setTheirProfile(s.data()); })
      .catch(console.error);
  }, [theirUid]);

  /* ── Create chat doc THEN start listener ── */
  useEffect(() => {
    if (!chatId || !myUid) return;
    let unsub = () => {};

    const init = async () => {
      try {
        // Always write participants so the doc exists before any message write.
        // participantNames lets the FAB badge show "New message from X" without extra reads.
        // merge:true is safe — won't overwrite existing messages.
        await setDoc(doc(db, 'directChats', chatId),
          {
            participants: [myUid, theirUid],
            participantNames: { [myUid]: myName, [theirUid]: theirName },
            updatedAt: serverTimestamp(),
          },
          { merge:true }
        );
      } catch(e) {
        console.error('Chat doc init failed:', e);
        setSendError('Could not open chat. Check your connection and try again.');
        setLoading(false);
        return;
      }

      // Now safe to listen — parent doc exists, rules will pass
      setLoading(true);
      const q = query(
        collection(db, 'directChats', chatId, 'messages'),
        orderBy('createdAt','asc'), limit(300),
      );
      unsub = onSnapshot(q, snap => {
        const firestoreMsgs = snap.docs.map(d => ({ id:d.id, ...d.data() }));
        // Merge: keep any optimistic messages that haven't been confirmed yet
        setMessages(prev => {
          const optimistics = prev.filter(m => m._optimistic);
          // Remove optimistic messages whose text already appears in Firestore
          const pendingOptimistics = optimistics.filter(opt =>
            !firestoreMsgs.some(fm => fm.text === opt.text && fm.senderId === opt.senderId)
          );
          return [...firestoreMsgs, ...pendingOptimistics].sort((a, b) => {
            const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : Date.now());
            const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : Date.now());
            return ta - tb;
          });
        });
        setLoading(false);
        snap.docs.forEach(d => {
          const m = d.data();
          if (m.senderId !== myUid && (!m.read || !m.delivered)) {
            updateDoc(d.ref, { read:true, delivered:true }).catch(()=>{});
          }
        });
      }, err => {
        console.error('Messages listener error:', err);
        setSendError('Could not load messages: ' + err.message);
        setLoading(false);
      });
    };

    init();
    return () => unsub();
  }, [chatId, myUid, theirUid]);

  /* ── Typing indicator listener ── */
  useEffect(() => {
    if (!chatId || !theirUid) return;
    const unsub = onSnapshot(
      doc(db, 'directChats', chatId, 'typing', theirUid),
      snap => {
        if (!snap.exists()) { setTyping(false); return; }
        const d = snap.data();
        const recent = d.updatedAt?.toDate
          ? (Date.now() - d.updatedAt.toDate().getTime()) < 5000 : false;
        setTyping(d.isTyping && recent);
      }
    );
    return unsub;
  }, [chatId, theirUid]);

  /* ── Auto-scroll ── */
  useEffect(() => {
    if (!loading)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior:'smooth' }), 60);
  }, [messages, loading, typing]);

  /* ── Typing indicator sender ── */
  const updateTyping = useCallback(async (val) => {
    if (!chatId || !myUid) return;
    await setDoc(
      doc(db, 'directChats', chatId, 'typing', myUid),
      { isTyping:val, updatedAt:serverTimestamp() },
      { merge:true }
    ).catch(()=>{});
  }, [chatId, myUid]);

  const handleInput = (e) => {
    setText(e.target.value);
    if (!myTyping) { setMyTyping(true); updateTyping(true); }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => { setMyTyping(false); updateTyping(false); }, 2500);
    // auto-grow
    const t = e.target;
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 120) + 'px';
  };

  /* ── Send message ── */
  const sendMessage = async () => {
    const trimmed = text.trim();
    if (!trimmed || !chatId || !myUid || sending) return;

    // Clear input immediately
    setText('');
    if (inputRef.current) { inputRef.current.style.height = 'auto'; }
    setSending(true);
    setSendError('');
    setShowEmoji(false);
    clearTimeout(typingTimer.current);
    updateTyping(false); setMyTyping(false);

    const replySnap = replyTo ? { text:replyTo.text, senderName:replyTo.senderName, senderId:replyTo.senderId } : null;
    setReplyTo(null);

    // Optimistic message — show instantly before Firestore confirms
    const optimisticId = 'opt_' + Date.now();
    const optimisticMsg = {
      id: optimisticId,
      text: trimmed,
      senderId: myUid,
      senderName: myName,
      createdAt: { toDate: () => new Date() },
      read: false, delivered: false,
      _optimistic: true,
      ...(replySnap ? { replyTo: replySnap } : {}),
    };
    setMessages(prev => [...prev, optimisticMsg]);

    try {
      const docRef = await addDoc(collection(db, 'directChats', chatId, 'messages'), {
        text: trimmed,
        senderId: myUid,
        senderName: myName,
        createdAt: serverTimestamp(),
        read: false, delivered: false,
        ...(replySnap ? { replyTo: replySnap } : {}),
      });
      // Remove optimistic once Firestore confirms — onSnapshot will add the real one
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      // Update chat metadata + increment recipient's unread count
      await setDoc(doc(db, 'directChats', chatId), {
        participants:[myUid, theirUid],
        lastMessage: trimmed,
        lastSenderId: myUid,
        lastSenderName: myName,
        participantNames: { [myUid]: myName, [theirUid]: theirName },
        updatedAt: serverTimestamp(),
        [`unreadCounts.${theirUid}`]: increment(1),
      }, { merge:true });
    } catch(e) {
      console.error('Send failed:', e);
      // Remove optimistic message and restore text
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      setText(trimmed);
      setSendError('Failed: ' + (e?.code || e?.message || 'unknown error') + '. Check Firestore rules are deployed.');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  /* ── Send audio message ── */
  const sendAudioMessage = async (blob, durationSecs) => {
    if (!chatId || !myUid) return;
    setSendError('');
    try {
      const contentType = blob.type || 'audio/webm';
      const ext  = contentType.includes('mp4') ? 'm4a' : 'webm';
      const path = `voiceNotes/${chatId}/${Date.now()}_${myUid}.${ext}`;
      const sRef = storageRef(storage, path);
      await withTimeout(
        uploadBytes(sRef, blob, { contentType }),
        30000,
        'Upload timed out. Check your internet connection and that Firebase Storage is enabled for this project.'
      );
      const url = await withTimeout(
        getDownloadURL(sRef),
        15000,
        'Could not get the voice note URL after upload.'
      );

      await addDoc(collection(db, 'directChats', chatId, 'messages'), {
        type:       'audio',
        audioUrl:   url,
        duration:   durationSecs,
        senderId:   myUid,
        senderName: myName,
        createdAt:  serverTimestamp(),
        read: false, delivered: false,
      });

      await setDoc(doc(db, 'directChats', chatId), {
        participants:[myUid, theirUid],
        lastMessage: '🎤 Voice message',
        lastSenderId: myUid,
        lastSenderName: myName,
        participantNames: { [myUid]: myName, [theirUid]: theirName },
        updatedAt: serverTimestamp(),
        [`unreadCounts.${theirUid}`]: increment(1),
      }, { merge:true });

      setShowVoice(false);
    } catch(e) {
      console.error('Audio send failed:', e);
      setSendError('Voice send failed: ' + (e?.code || e?.message || 'unknown') + '. Check Storage rules/billing are set up.');
      setShowVoice(false);
    }
  };

  /* ── Send image message ── */
  const sendImageMessage = async (file) => {
    if (!chatId || !myUid || !file) return;
    setSendError('');
    // Show optimistic preview instantly
    const localUrl = URL.createObjectURL(file);
    const optimisticId = 'opt_img_' + Date.now();
    const optimisticMsg = {
      id: optimisticId,
      type: 'image',
      imageUrl: localUrl,
      senderId: myUid,
      senderName: myName,
      createdAt: { toDate: () => new Date() },
      read: false, delivered: false,
      _optimistic: true,
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setImgPreview(null);

    try {
      const ext  = file.name.split('.').pop() || 'jpg';
      const contentType = file.type || 'image/jpeg';
      const path = `chatImages/${chatId}/${Date.now()}_${myUid}.${ext}`;
      const sRef = storageRef(storage, path);
      await withTimeout(
        uploadBytes(sRef, file, { contentType }),
        30000,
        'Upload timed out. Check your internet connection and that Firebase Storage is enabled for this project.'
      );
      const url = await withTimeout(
        getDownloadURL(sRef),
        15000,
        'Could not get the image URL after upload.'
      );

      await addDoc(collection(db, 'directChats', chatId, 'messages'), {
        type:       'image',
        imageUrl:   url,
        senderId:   myUid,
        senderName: myName,
        createdAt:  serverTimestamp(),
        read: false, delivered: false,
      });

      setMessages(prev => prev.filter(m => m.id !== optimisticId));

      await setDoc(doc(db, 'directChats', chatId), {
        participants:[myUid, theirUid],
        lastMessage: '📷 Photo',
        lastSenderId: myUid,
        lastSenderName: myName,
        participantNames: { [myUid]: myName, [theirUid]: theirName },
        updatedAt: serverTimestamp(),
        [`unreadCounts.${theirUid}`]: increment(1),
      }, { merge:true });

    } catch(e) {
      console.error('Image send failed:', e);
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      setSendError('Image send failed: ' + (e?.code || e?.message || 'unknown error') + '. Check Storage rules/billing are set up.');
    }
  };

  /* ── Pick image from file input ── */
  const handleImageFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const url = URL.createObjectURL(file);
    setImgPreview({ file, url });
  };
  const deleteMessage = async (msg) => {
    if (msg.senderId !== myUid) return;
    try {
      await updateDoc(doc(db, 'directChats', chatId, 'messages', msg.id), {
        deleted: true, text: '', reactions: {},
      });
    } catch(e) { console.error(e); }
  };

  /* ── React to message ── */
  const reactToMessage = async (msg, emoji) => {
    if (!chatId || !myUid) return;
    const msgRef = doc(db, 'directChats', chatId, 'messages', msg.id);
    const existing = (msg.reactions || {})[emoji] || 0;
    // Toggle: if already reacted with same emoji, remove it
    await updateDoc(msgRef, {
      [`reactions.${emoji}`]: existing > 0 ? existing - 1 : existing + 1,
    }).catch(console.error);
  };

  /* ── Context menu handlers ── */
  const openContextMenu = (msg, x, y) => {
    setCtxMenu({ msg, x, y });
    setShowCtxReact(true);
  };
  const closeContextMenu = () => { setCtxMenu(null); setShowCtxReact(false); };

  /* ── Emoji insert ── */
  const insertEmoji = (emoji) => {
    setText(t => t + emoji);
    inputRef.current?.focus();
  };

  /* ─── RENDER ─────────────────────────────────────────────── */
  // Lock the parent <main> so it doesn't scroll while chat is open
  useEffect(() => {
    const main = document.querySelector('.main-content');
    if (main) {
      main.style.overflow = 'hidden';
      main.style.height   = '100%';
    }
    return () => {
      if (main) {
        main.style.overflow = '';
        main.style.height   = '';
      }
    };
  }, []);

  return (
    <div style={{
      display:'flex', flexDirection:'column',
      /* 100dvh accounts for mobile browser chrome (address bar shrink/grow).
         Fallback to 100vh for older browsers.
         Subtract navbar height (60px) via CSS variable for easy adjustment. */
      height:'calc(100dvh - 60px)',
      maxHeight:'calc(100dvh - 60px)',
      background:'#0B141A',
      color:'#E9EDEF',
      overflow:'hidden', position:'relative', fontFamily:F,
    }}>
      <style>{`
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes bubblePop {
          from { opacity:0; transform:translateY(10px) scale(0.95); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        @keyframes typingDot {
          0%,60%,100% { transform:translateY(0); opacity:0.4; }
          30%          { transform:translateY(-5px); opacity:1; }
        }
        @keyframes ctxPop {
          from { opacity:0; transform:scale(0.92); }
          to   { opacity:1; transform:scale(1); }
        }
        @keyframes slideUp {
          from { transform:translateY(20px); opacity:0; }
          to   { transform:translateY(0);    opacity:1; }
        }
        .chat-input { resize:none; }
        .chat-input:focus { outline:none; }
        .send-fab:active { transform:scale(0.9) !important; }
        @keyframes recPulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:0.4; transform:scale(1.3); }
        }
        @keyframes waveBar {
          0%,100% { transform:scaleY(1); }
          50%      { transform:scaleY(2); }
        }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.12); border-radius:4px; }
        .msg-area { scroll-behavior:smooth; }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{
        background:'#1F2C34',
        borderBottom:'1px solid rgba(255,255,255,0.06)',
        padding:'10px 14px',
        display:'flex', alignItems:'center', gap:12,
        flexShrink:0, zIndex:10,
      }}>
        <button onClick={() => navigate('/entrance-exam/chat-inbox')} style={{
          background:'none', border:'none', cursor:'pointer',
          fontSize:22, color:'#0D9488', padding:'2px 4px',
          fontWeight:900, lineHeight:1, flexShrink:0,
        }}>←</button>

        {/* Clickable avatar → their profile */}
        <div onClick={() => navigate(`/student/${theirUid}`, { state:{ name:theirName, school:theirSchool } })}
          style={{ cursor:'pointer', flexShrink:0 }}>
          <Avatar name={theirName} size={42} />
        </div>

        <div style={{ flex:1, minWidth:0, cursor:'pointer' }}
          onClick={() => navigate(`/student/${theirUid}`, { state:{ name:theirName, school:theirSchool } })}>
          <div style={{
            fontFamily:H, fontWeight:900, fontSize:'clamp(0.95rem,2.5vw,1.15rem)',
            color:'#E9EDEF',
            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
          }}>{theirName}</div>
          <div style={{
            fontSize:12, fontFamily:F, fontWeight:700,
            color: typing ? '#25D366' : '#8696A0',
            transition:'color 0.2s',
          }}>
            {typing ? 'typing…' : theirSchool || 'Nursing Student'}
          </div>
        </div>

        {/* Search / more icons placeholder */}
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={() => navigate(`/student/${theirUid}`, { state:{ name:theirName, school:theirSchool } })}
            style={{
              background:'rgba(255,255,255,0.06)', border:'none', borderRadius:8,
              padding:'6px 10px', cursor:'pointer', color:'#8696A0',
              fontSize:11, fontFamily:F, fontWeight:700, flexShrink:0,
            }}>👤</button>
        </div>
      </div>

      {/* ── MESSAGES AREA ── */}
      <div className="msg-area" style={{
        flex:1, overflowY:'auto', overflowX:'hidden',
        padding:'12px 12px 4px',
        display:'flex', flexDirection:'column',
        minHeight:0, /* critical — prevents flex child from overflowing parent */
        backgroundImage:`url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.015'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }}>
        {loading ? <Spinner /> : messages.length === 0 ? (
          <div style={{
            flex:1, display:'flex', flexDirection:'column',
            alignItems:'center', justifyContent:'center',
            gap:14, textAlign:'center', padding:32,
          }}>
            <div style={{ fontSize:56 }}>💬</div>
            <div style={{ fontFamily:H, fontWeight:900, fontSize:18, color:'#E9EDEF' }}>
              Start the conversation
            </div>
            <div style={{ fontSize:13, fontWeight:700, color:'#8696A0', maxWidth:260, lineHeight:1.7 }}>
              Messages are end-to-end encrypted. Only you and {theirName} can read them.
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={msg.id} style={{ animation:'bubblePop 0.2s ease' }}>
                <Bubble
                  msg={msg}
                  isMe={msg.senderId === myUid}
                  theirName={theirName}
                  prevMsg={i > 0 ? messages[i-1] : null}
                  onContextMenu={openContextMenu}
                  onReactionPick={reactToMessage}
                />
              </div>
            ))}

            {/* Typing indicator */}
            {typing && (
              <div style={{ display:'flex', alignItems:'flex-end', gap:6, marginBottom:8, paddingLeft:38 }}>
                <div style={{
                  padding:'10px 14px',
                  background:'var(--bg-secondary,#1F2C34)',
                  borderRadius:'18px 18px 18px 4px',
                  display:'flex', gap:5, alignItems:'center',
                  boxShadow:'0 1px 2px rgba(0,0,0,0.4)',
                }}>
                  {[0,1,2].map(i => (
                    <span key={i} style={{
                      width:7, height:7, borderRadius:'50%',
                      background:'#8696A0', display:'inline-block',
                      animation:`typingDot 1.2s ease infinite`,
                      animationDelay:`${i*0.2}s`,
                    }} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── CONTEXT MENU ── */}
      {ctxMenu && (
        <div style={{
          position:'fixed', inset:0, zIndex:9998,
          background:'rgba(0,0,0,0.3)',
        }} onClick={closeContextMenu}>
          <div onClick={e => e.stopPropagation()}>
            <ContextMenu
              x={ctxMenu.x} y={ctxMenu.y}
              isMe={ctxMenu.msg.senderId === myUid}
              onReply={() => { setReplyTo(ctxMenu.msg); inputRef.current?.focus(); }}
              onCopy={() => navigator.clipboard?.writeText(ctxMenu.msg.text).catch(()=>{})}
              onDelete={() => deleteMessage(ctxMenu.msg)}
              onClose={closeContextMenu}
            />
            {showCtxReact && (
              <div style={{
                position:'fixed',
                left: Math.min(ctxMenu.x, window.innerWidth - 220),
                top:  Math.max(ctxMenu.y - 60, 8),
                zIndex:10000,
                background:'var(--bg-card,#1F2C34)',
                border:'1px solid rgba(255,255,255,0.1)',
                borderRadius:30,
                boxShadow:'0 4px 20px rgba(0,0,0,0.5)',
                animation:'ctxPop 0.12s ease',
              }}>
                <QuickReactionBar onPick={(emoji) => { reactToMessage(ctxMenu.msg, emoji); closeContextMenu(); }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Send error banner ── */}
      {sendError && (
        <div style={{
          background:'rgba(239,68,68,0.15)',
          borderTop:'1px solid rgba(239,68,68,0.3)',
          padding:'8px 16px',
          fontSize:12, fontFamily:F, fontWeight:700,
          color:'#EF4444', textAlign:'center', flexShrink:0,
        }}>
          ⚠️ {sendError}
        </div>
      )}

      {/* ── Image preview modal ── */}
      <ImagePreviewModal
        preview={imgPreview}
        onSend={sendImageMessage}
        onCancel={() => setImgPreview(null)}
      />

      {/* Hidden file input for gallery/camera */}
      <input
        ref={imgFileRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display:'none' }}
        onChange={handleImageFile}
      />

      {/* ── INPUT AREA ── */}
      <div ref={inputWrap} style={{ background:'#1F2C34', flexShrink:0, position:'relative' }}>
        {/* Reply bar */}
        <ReplyBar msg={replyTo} myUid={myUid} onCancel={() => setReplyTo(null)} />

        {/* Voice recorder — replaces normal input row when active */}
        {showVoice ? (
          <VoiceRecorder
            onSend={sendAudioMessage}
            onCancel={() => setShowVoice(false)}
          />
        ) : (
          <>
            {/* Emoji picker */}
            {showEmoji && (
              <EmojiPicker
                onPick={insertEmoji}
                onClose={() => setShowEmoji(false)}
              />
            )}

            {/* Input row */}
            <div style={{
              display:'flex', alignItems:'flex-end', gap:8,
              padding:'8px 10px',
              borderTop:'1px solid rgba(255,255,255,0.06)',
            }}>
              {/* Emoji button */}
              <button onClick={() => { setShowEmoji(v => !v); }} style={{
                background:'none', border:'none', cursor:'pointer',
                fontSize:22, padding:'4px', flexShrink:0,
                color: showEmoji ? '#0D9488' : '#8696A0',
                transition:'color 0.15s',
                lineHeight:1,
              }}>😊</button>

              {/* Camera / image button */}
              <button onClick={() => { setShowEmoji(false); imgFileRef.current?.click(); }} style={{
                background:'none', border:'none', cursor:'pointer',
                fontSize:22, padding:'4px', flexShrink:0,
                color:'#8696A0',
                transition:'color 0.15s',
                lineHeight:1,
              }}>📷</button>

              {/* Text input */}
              <textarea
                ref={inputRef}
                className="chat-input"
                value={text}
                onChange={handleInput}
                onKeyDown={handleKey}
                placeholder="Message"
                rows={1}
                style={{
                  flex:1,
                  background:'#2A3942',
                  border:'none',
                  borderRadius:22,
                  padding:'10px 16px',
                  color:'#E9EDEF',
                  fontFamily:F, fontWeight:700, fontSize:14,
                  lineHeight:1.5,
                  maxHeight:120,
                  overflowY:'auto',
                }}
              />

              {/* Send (when typing) or Mic (when empty) */}
              {text.trim() ? (
                <button
                  className="send-fab"
                  onClick={sendMessage}
                  disabled={sending}
                  style={{
                    width:46, height:46, borderRadius:'50%', flexShrink:0,
                    background:'#00A884',
                    border:'none', cursor:'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    transition:'transform 0.12s',
                    boxShadow:'0 2px 10px rgba(0,168,132,0.4)',
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"
                      stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              ) : (
                <button
                  className="send-fab"
                  onClick={() => { setShowEmoji(false); setShowVoice(true); }}
                  style={{
                    width:46, height:46, borderRadius:'50%', flexShrink:0,
                    background:'#00A884',
                    border:'none', cursor:'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    transition:'transform 0.12s',
                    boxShadow:'0 2px 10px rgba(0,168,132,0.4)',
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <rect x="9" y="2" width="6" height="11" rx="3" stroke="#fff" strokeWidth="2"/>
                    <path d="M5 10a7 7 0 0014 0" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="12" y1="19" x2="12" y2="22" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="9"  y1="22" x2="15" y2="22" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
