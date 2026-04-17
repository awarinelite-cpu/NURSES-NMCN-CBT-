// src/components/student/ProfilePage.jsx
import { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { db, auth } from '../../firebase';

const SPECIALIZATIONS = [
  'Medical-Surgical Nursing',
  'Paediatric Nursing',
  'Obstetric & Gynaecological Nursing',
  'Psychiatric & Mental Health Nursing',
  'Community Health Nursing',
  'Critical Care / ICU Nursing',
  'Perioperative Nursing',
  'Oncology Nursing',
  'Orthopaedic Nursing',
  'General Nursing',
];

export default function ProfilePage() {
  const { user, profile } = useAuth();

  const [tab, setTab] = useState('profile'); // 'profile' | 'security' | 'stats'
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null); // { type: 'success'|'error', text }

  // Profile form state
  const [name, setName] = useState(profile?.name || user?.displayName || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [specialization, setSpecialization] = useState(profile?.specialization || '');
  const [institution, setInstitution] = useState(profile?.institution || '');
  const [bio, setBio] = useState(profile?.bio || '');

  // Password form state
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const initials = (profile?.name || user?.displayName || 'S')
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const totalExams = profile?.totalExams || 0;
  const avgScore = totalExams
    ? Math.round((profile?.totalScore || 0) / totalExams)
    : null;
  const streak = profile?.streak || 0;
  const bookmarks = profile?.bookmarkCount || 0;
  const planLabel = profile?.subscriptionPlan
    ? profile.subscriptionPlan.charAt(0).toUpperCase() + profile.subscriptionPlan.slice(1)
    : 'Free';
  const expiry = profile?.subscriptionExpiry
    ? new Date(profile.subscriptionExpiry).toLocaleDateString('en-NG', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : null;

  const daysLeft = profile?.subscriptionExpiry
    ? Math.max(0, Math.ceil((new Date(profile.subscriptionExpiry) - Date.now()) / 86400000))
    : null;

  async function handleSaveProfile() {
    if (!name.trim()) { setMsg({ type: 'error', text: 'Name cannot be empty.' }); return; }
    setSaving(true); setMsg(null);
    try {
      await updateProfile(auth.currentUser, { displayName: name.trim() });
      await updateDoc(doc(db, 'users', user.uid), {
        name: name.trim(),
        phone: phone.trim(),
        specialization,
        institution: institution.trim(),
        bio: bio.trim(),
      });
      setMsg({ type: 'success', text: 'Profile updated successfully.' });
      setEditing(false);
    } catch (e) {
      setMsg({ type: 'error', text: 'Failed to save: ' + e.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    if (!currentPw || !newPw || !confirmPw) {
      setMsg({ type: 'error', text: 'Please fill all password fields.' }); return;
    }
    if (newPw.length < 6) {
      setMsg({ type: 'error', text: 'New password must be at least 6 characters.' }); return;
    }
    if (newPw !== confirmPw) {
      setMsg({ type: 'error', text: 'New passwords do not match.' }); return;
    }
    setPwSaving(true); setMsg(null);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPw);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPw);
      setMsg({ type: 'success', text: 'Password changed successfully.' });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (e) {
      const errMap = {
        'auth/wrong-password': 'Current password is incorrect.',
        'auth/too-many-requests': 'Too many attempts. Try again later.',
      };
      setMsg({ type: 'error', text: errMap[e.code] || e.message });
    } finally {
      setPwSaving(false);
    }
  }

  const scoreColor = avgScore === null ? '#94A3B8'
    : avgScore >= 70 ? '#0D9488'
    : avgScore >= 50 ? '#F59E0B'
    : '#EF4444';

  return (
    <div style={styles.page}>
      {/* ── Header card ───────────────────────────── */}
      <div style={styles.headerCard}>
        <div style={styles.avatarRing}>
          <div style={styles.avatar}>{initials}</div>
        </div>
        <div style={styles.headerInfo}>
          <div style={styles.headerName}>{profile?.name || user?.displayName || 'Student'}</div>
          <div style={styles.headerEmail}>{user?.email}</div>
          <div style={styles.badgeRow}>
            <span style={{
              ...styles.badge,
              background: profile?.subscribed ? 'rgba(13,148,136,0.18)' : 'rgba(100,116,139,0.18)',
              color: profile?.subscribed ? '#0D9488' : '#94A3B8',
              border: `1px solid ${profile?.subscribed ? 'rgba(13,148,136,0.35)' : 'rgba(100,116,139,0.3)'}`,
            }}>
              {profile?.subscribed ? '⭐ ' + planLabel : '🆓 Free Plan'}
            </span>
            {expiry && (
              <span style={{
                ...styles.badge,
                background: daysLeft <= 7 ? 'rgba(239,68,68,0.12)' : 'rgba(30,58,138,0.2)',
                color: daysLeft <= 7 ? '#EF4444' : '#93C5FD',
                border: `1px solid ${daysLeft <= 7 ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.25)'}`,
              }}>
                {daysLeft <= 7 ? `⚠️ ${daysLeft}d left` : `Expires ${expiry}`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Stat strip ─────────────────────────────── */}
      <div style={styles.statsStrip}>
        {[
          { label: 'Exams Taken', value: totalExams, icon: '📝' },
          { label: 'Avg Score', value: avgScore !== null ? `${avgScore}%` : '—', icon: '🎯', color: scoreColor },
          { label: 'Day Streak', value: streak, icon: '🔥' },
          { label: 'Bookmarks', value: bookmarks, icon: '🔖' },
        ].map(s => (
          <div key={s.label} style={styles.statBox}>
            <div style={styles.statIcon}>{s.icon}</div>
            <div style={{ ...styles.statValue, color: s.color || 'var(--text-primary, #F1F5F9)' }}>{s.value}</div>
            <div style={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ───────────────────────────────────── */}
      <div style={styles.tabs}>
        {[
          { id: 'profile', label: '👤 Profile' },
          { id: 'security', label: '🔒 Security' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setMsg(null); setEditing(false); }}
            style={{
              ...styles.tab,
              ...(tab === t.id ? styles.tabActive : {}),
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Message ────────────────────────────────── */}
      {msg && (
        <div style={{
          ...styles.msgBox,
          background: msg.type === 'success' ? 'rgba(13,148,136,0.12)' : 'rgba(239,68,68,0.12)',
          borderColor: msg.type === 'success' ? 'rgba(13,148,136,0.4)' : 'rgba(239,68,68,0.4)',
          color: msg.type === 'success' ? '#2DD4BF' : '#FCA5A5',
        }}>
          {msg.type === 'success' ? '✅ ' : '⚠️ '}{msg.text}
        </div>
      )}

      {/* ── Profile Tab ────────────────────────────── */}
      {tab === 'profile' && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardTitle}>Personal Information</span>
            {!editing && (
              <button style={styles.editBtn} onClick={() => setEditing(true)}>
                ✏️ Edit
              </button>
            )}
          </div>

          <div style={styles.formGrid}>
            <Field label="Full Name" required>
              {editing
                ? <input style={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
                : <Value>{name || '—'}</Value>}
            </Field>

            <Field label="Email Address">
              <Value muted>{user?.email}</Value>
            </Field>

            <Field label="Phone Number">
              {editing
                ? <input style={styles.input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+234 xxx xxx xxxx" />
                : <Value>{phone || '—'}</Value>}
            </Field>

            <Field label="Institution / School">
              {editing
                ? <input style={styles.input} value={institution} onChange={e => setInstitution(e.target.value)} placeholder="e.g. NACON, LUTH, BUTH..." />
                : <Value>{institution || '—'}</Value>}
            </Field>

            <Field label="Specialization" fullWidth>
              {editing
                ? (
                  <select style={styles.input} value={specialization} onChange={e => setSpecialization(e.target.value)}>
                    <option value="">— Select specialization —</option>
                    {SPECIALIZATIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )
                : <Value>{specialization || '—'}</Value>}
            </Field>

            <Field label="Bio / About" fullWidth>
              {editing
                ? <textarea style={{ ...styles.input, minHeight: 80, resize: 'vertical' }} value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell us a little about yourself..." maxLength={200} />
                : <Value>{bio || '—'}</Value>}
            </Field>
          </div>

          {editing && (
            <div style={styles.actionRow}>
              <button style={styles.cancelBtn} onClick={() => { setEditing(false); setMsg(null); }}>
                Cancel
              </button>
              <button style={styles.saveBtn} onClick={handleSaveProfile} disabled={saving}>
                {saving ? 'Saving…' : '💾 Save Changes'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Security Tab ───────────────────────────── */}
      {tab === 'security' && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardTitle}>Change Password</span>
          </div>
          <p style={{ color: 'var(--text-muted, #94A3B8)', fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>
            For your security, re-enter your current password before setting a new one.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Current Password" fullWidth>
              <input type="password" style={styles.input} value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Enter current password" />
            </Field>
            <Field label="New Password" fullWidth>
              <input type="password" style={styles.input} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="At least 6 characters" />
            </Field>
            <Field label="Confirm New Password" fullWidth>
              <input type="password" style={styles.input} value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat new password" />
            </Field>
          </div>
          <div style={{ marginTop: 20 }}>
            <button style={styles.saveBtn} onClick={handleChangePassword} disabled={pwSaving}>
              {pwSaving ? 'Updating…' : '🔒 Update Password'}
            </button>
          </div>
        </div>
      )}

      {/* ── Subscription info ──────────────────────── */}
      <div style={{ ...styles.card, marginTop: 16 }}>
        <div style={styles.cardHeader}>
          <span style={styles.cardTitle}>Subscription</span>
          <a href="/subscription" style={styles.editBtn}>Manage →</a>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            ['Plan', planLabel],
            ['Status', profile?.subscribed ? 'Active ✅' : 'Inactive'],
            ['Expires', expiry || 'N/A'],
            ['Days Left', daysLeft !== null ? `${daysLeft} days` : '—'],
          ].map(([k, v]) => (
            <div key={k} style={styles.subBox}>
              <div style={styles.subKey}>{k}</div>
              <div style={styles.subVal}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Small helpers ────────────────────────────────────────────────
function Field({ label, children, fullWidth, required }) {
  return (
    <div style={{ gridColumn: fullWidth ? '1 / -1' : undefined, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {label}{required && <span style={{ color: '#EF4444' }}> *</span>}
      </label>
      {children}
    </div>
  );
}

function Value({ children, muted }) {
  return (
    <div style={{
      fontSize: 14, fontWeight: 500,
      color: muted ? '#64748B' : 'var(--text-primary, #F1F5F9)',
      padding: '8px 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      {children}
    </div>
  );
}

// ── Inline styles ────────────────────────────────────────────────
const styles = {
  page: {
    padding: '20px 16px 40px',
    maxWidth: 680,
    margin: '0 auto',
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
  },
  headerCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 18,
    background: 'linear-gradient(135deg, rgba(13,148,136,0.12) 0%, rgba(30,58,138,0.15) 100%)',
    border: '1px solid rgba(13,148,136,0.2)',
    borderRadius: 16,
    padding: '20px 22px',
    marginBottom: 16,
  },
  avatarRing: {
    padding: 3,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #0D9488, #1E3A8A)',
    flexShrink: 0,
  },
  avatar: {
    width: 62, height: 62, borderRadius: '50%',
    background: '#020B18',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 900, fontSize: 24, color: '#0D9488',
    letterSpacing: -1,
  },
  headerInfo: { flex: 1, minWidth: 0 },
  headerName: { fontWeight: 700, fontSize: 18, color: '#F1F5F9', marginBottom: 2 },
  headerEmail: { fontSize: 13, color: '#64748B', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  badgeRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  badge: { fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20 },

  statsStrip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 10,
    marginBottom: 16,
  },
  statBox: {
    background: 'var(--bg-secondary, rgba(255,255,255,0.04))',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: '14px 10px',
    textAlign: 'center',
  },
  statIcon: { fontSize: 20, marginBottom: 6 },
  statValue: { fontSize: 20, fontWeight: 800, lineHeight: 1 },
  statLabel: { fontSize: 10, color: '#64748B', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.6 },

  tabs: {
    display: 'flex',
    gap: 4,
    marginBottom: 16,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 10,
    padding: 4,
  },
  tab: {
    flex: 1, padding: '9px 0', border: 'none',
    background: 'transparent', color: '#64748B',
    fontSize: 13, fontWeight: 600, borderRadius: 8,
    cursor: 'pointer', transition: 'all .15s',
  },
  tabActive: {
    background: 'rgba(13,148,136,0.15)',
    color: '#2DD4BF',
    boxShadow: 'inset 0 0 0 1px rgba(13,148,136,0.3)',
  },

  msgBox: {
    fontSize: 13, fontWeight: 500, padding: '10px 14px',
    borderRadius: 10, border: '1px solid', marginBottom: 14,
  },

  card: {
    background: 'var(--bg-secondary, rgba(255,255,255,0.03))',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 16,
    padding: '20px',
  },
  cardHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 18,
  },
  cardTitle: { fontWeight: 700, fontSize: 15, color: '#F1F5F9' },
  editBtn: {
    fontSize: 12, fontWeight: 600, color: '#0D9488',
    background: 'rgba(13,148,136,0.1)', border: '1px solid rgba(13,148,136,0.25)',
    borderRadius: 8, padding: '5px 12px', cursor: 'pointer',
    textDecoration: 'none',
  },

  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px 20px',
  },
  input: {
    width: '100%', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, padding: '9px 12px',
    color: '#F1F5F9', fontSize: 14,
    outline: 'none', fontFamily: 'inherit',
    transition: 'border-color .15s',
  },
  actionRow: {
    display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20,
  },
  cancelBtn: {
    padding: '9px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
    background: 'transparent', color: '#94A3B8', fontSize: 13,
    fontWeight: 600, cursor: 'pointer',
  },
  saveBtn: {
    padding: '9px 22px', borderRadius: 8, border: 'none',
    background: 'linear-gradient(135deg,#0D9488,#0F766E)',
    color: '#fff', fontSize: 13, fontWeight: 700,
    cursor: 'pointer', boxShadow: '0 2px 12px rgba(13,148,136,0.3)',
  },

  subBox: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10, padding: '12px 14px',
  },
  subKey: { fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  subVal: { fontSize: 14, fontWeight: 700, color: '#F1F5F9' },
};
