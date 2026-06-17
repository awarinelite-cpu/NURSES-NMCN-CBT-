// src/components/auth/AuthPage.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function AuthPage() {
  const [mode, setMode]         = useState('login');
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [school, setSchool]     = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');
  const [schools, setSchools]   = useState([]);
  const [schoolsLoading, setSchoolsLoading] = useState(false);

  const { login, register, resetPassword, googleLogin } = useAuth();
  const navigate = useNavigate();

  // Load schools from Firestore when register mode is active
  useEffect(() => {
    if (mode !== 'register') return;
    setSchoolsLoading(true);
    (async () => {
      try {
        let snap;
        try {
          snap = await getDocs(query(collection(db, 'entranceExamSchools'), orderBy('name')));
        } catch {
          snap = await getDocs(collection(db, 'entranceExamSchools'));
        }
        const list = snap.docs.map(d => ({ id: d.id, name: d.data().name || d.id }));
        // Also pull unique school names from entranceExamQuestions as fallback
        if (list.length === 0) {
          const qSnap = await getDocs(collection(db, 'entranceExamQuestions'));
          const names = new Set();
          qSnap.forEach(d => { if (d.data().school) names.add(d.data().school); });
          list.push(...[...names].sort().map(n => ({ id: n, name: n })));
        }
        setSchools(list);
      } catch (e) {
        console.error('Schools load error:', e);
      } finally {
        setSchoolsLoading(false);
      }
    })();
  }, [mode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        setTimeout(() => navigate('/dashboard'), 100);
      } else if (mode === 'register') {
        if (password !== confirm) throw new Error('Passwords do not match.');
        if (password.length < 6)  throw new Error('Password must be at least 6 characters.');
        if (!school)               throw new Error('Please select your school.');
        await register(email, password, name, 'student', school);
        navigate('/dashboard');
      } else {
        await resetPassword(email);
        setSuccess('Password reset email sent! Check your inbox.');
      }
    } catch (err) {
      let msg = err.message;
      if (msg.includes('user-not-found') || msg.includes('wrong-password')) msg = 'Invalid email or password.';
      if (msg.includes('email-already-in-use')) msg = 'An account with this email already exists.';
      if (msg.includes('network')) msg = 'Network error. Check your connection.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(''); setLoading(true);
    try {
      await googleLogin();
      navigate('/dashboard');
    } catch (err) {
      if (err.code === 'auth/popup-blocked' || (err.message && err.message.includes('popup-blocked'))) {
        await googleLogin(true);
        return;
      }
      let msg = err.message || '';
      if (msg.includes('popup-closed')) msg = 'Sign-in cancelled.';
      else if (msg.includes('network'))  msg = 'Network error. Check your connection.';
      setError(msg);
      setLoading(false);
    }
  };

  const F = "'Times New Roman', Times, serif";
  const H = "'Arial Black', Arial, sans-serif";

  return (
    <div style={styles.page}>
      <div style={styles.bgOrb1} />
      <div style={styles.bgOrb2} />

      <div style={styles.card} className="anim-bounceIn">
        {/* Logo */}
        <div style={styles.logo}>
          <div style={styles.logoIcon}><img src="/logo.png" alt="The Elite Nurses Logo" style={{ height: 90, width: 'auto', objectFit: 'contain' }} /></div>
          <div>
            <div style={{ fontFamily: H, fontWeight: 900, fontSize: 20, color: 'var(--text-primary)', letterSpacing: 1 }}>
              NMCN CBT
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, fontFamily: F }}>
              Nursing Exam Prep Platform
            </div>
          </div>
        </div>

        {/* Title */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontFamily: H, fontWeight: 900, color: 'var(--text-primary)', fontSize: 'clamp(1.4rem,3vw,2rem)', marginBottom: 6 }}>
            {mode === 'login'    && 'Welcome Back'}
            {mode === 'register' && 'Create Account'}
            {mode === 'forgot'   && 'Reset Password'}
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5, fontFamily: F, fontWeight: 700 }}>
            {mode === 'login'    && 'Sign in to continue your exam preparation'}
            {mode === 'register' && 'Join thousands of nursing students preparing for NMCN'}
            {mode === 'forgot'   && 'Enter your email to receive a reset link'}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Full Name */}
          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label" style={{ fontFamily: F, fontWeight: 700, color: 'var(--text-primary)' }}>
                Full Name
              </label>
              <input
                type="text" className="form-input"
                placeholder="e.g. Adaeze Okonkwo"
                value={name} onChange={e => setName(e.target.value)} required
                style={styles.input}
              />
            </div>
          )}

          {/* Email */}
          <div className="form-group">
            <label className="form-label" style={{ fontFamily: F, fontWeight: 700, color: 'var(--text-primary)' }}>
              Email Address
            </label>
            <input
              type="email" className="form-input"
              placeholder="you@example.com"
              value={email} onChange={e => setEmail(e.target.value)} required
              style={styles.input}
            />
          </div>

          {/* Password */}
          {mode !== 'forgot' && (
            <div className="form-group">
              <label className="form-label" style={{ fontFamily: F, fontWeight: 700, color: 'var(--text-primary)' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'} className="form-input"
                  placeholder={mode === 'register' ? 'Min. 6 characters' : 'Enter your password'}
                  value={password} onChange={e => setPassword(e.target.value)} required
                  style={{ ...styles.input, paddingRight: 44 }}
                />
                <button type="button" onClick={() => setShowPw(!showPw)} style={styles.eyeBtn}>
                  {showPw ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
          )}

          {/* Confirm Password */}
          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label" style={{ fontFamily: F, fontWeight: 700, color: 'var(--text-primary)' }}>
                Confirm Password
              </label>
              <input
                type="password" className="form-input"
                placeholder="Repeat password"
                value={confirm} onChange={e => setConfirm(e.target.value)} required
                style={styles.input}
              />
            </div>
          )}

          {/* ── SCHOOL SELECTOR ── */}
          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label" style={{ fontFamily: F, fontWeight: 700, color: 'var(--text-primary)' }}>
                🏫 Your Nursing School
              </label>
              <select
                className="form-input form-select"
                value={school}
                onChange={e => setSchool(e.target.value)}
                required
                style={{
                  ...styles.input,
                  color: school ? '#FFFFFF' : 'rgba(255,255,255,0.4)',
                  fontFamily: F, fontWeight: 700,
                }}
              >
                <option value="" disabled style={{ background: '#0A1F35', color: 'var(--text-muted)' }}>
                  {schoolsLoading ? 'Loading schools…' : '— Select your school —'}
                </option>
                {schools.map(s => (
                  <option key={s.id} value={s.name} style={{ background: '#0A1F35', color: 'var(--text-primary)' }}>
                    {s.name}
                  </option>
                ))}
                <option value="Other" style={{ background: '#0A1F35', color: 'var(--text-primary)' }}>
                  Other
                </option>
              </select>
              <p style={{ fontSize: 12, fontFamily: F, fontWeight: 700, color: 'var(--text-hint)', marginTop: 4 }}>
                This determines which leaderboard you appear on. Can be changed in your profile.
              </p>
            </div>
          )}

          {error   && <div className="alert alert-error"><span>⚠️</span>{error}</div>}
          {success && <div className="alert alert-success"><span>✅</span>{success}</div>}

          {mode === 'login' && (
            <button type="button" onClick={() => { setMode('forgot'); setError(''); }}
              style={{ alignSelf: 'flex-end', background: 'none', border: 'none', color: 'var(--teal-light)', fontSize: 13, cursor: 'pointer', fontFamily: F, textDecoration: 'underline', fontWeight: 700 }}>
              Forgot password?
            </button>
          )}

          <button type="submit" className="btn btn-primary btn-full btn-lg"
            disabled={loading}
            style={{ fontFamily: F, fontWeight: 700, fontSize: 15 }}
          >
            {loading ? <><span className="spinner spinner-sm" />Processing…</> : (
              mode === 'login'    ? '🔐 Sign In' :
              mode === 'register' ? '🚀 Create Account' :
              '📧 Send Reset Link'
            )}
          </button>
        </form>

        {/* Google */}
        {mode !== 'forgot' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 12px' }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', fontFamily: F }}>or</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
            </div>
            <button type="button" onClick={handleGoogleLogin} disabled={loading} style={styles.googleBtn}>
              <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span style={{ fontFamily: F, fontWeight: 700 }}>Continue with Google</span>
            </button>
          </>
        )}

        {/* Mode switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
          {mode === 'login' && (
            <>
              <span style={{ fontSize: 14, color: 'var(--text-muted)', fontFamily: F, fontWeight: 700 }}>Don't have an account?</span>
              <button style={{ background: 'none', border: 'none', color: 'var(--teal-light)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: F, textDecoration: 'underline' }}
                onClick={() => { setMode('register'); setError(''); }}>
                Create one free
              </button>
            </>
          )}
          {(mode === 'register' || mode === 'forgot') && (
            <>
              <span style={{ fontSize: 14, color: 'var(--text-muted)', fontFamily: F, fontWeight: 700 }}>Already have an account?</span>
              <button style={{ background: 'none', border: 'none', color: 'var(--teal-light)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: F, textDecoration: 'underline' }}
                onClick={() => { setMode('login'); setError(''); }}>
                Sign in
              </button>
            </>
          )}
        </div>

        <div style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 16, padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontFamily: F, fontWeight: 700 }}>
          🏥 Exclusively for NMCN-registered nursing students
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, #020B18 0%, #041428 50%, #071E33 100%)',
    padding: '20px', position: 'relative', overflow: 'hidden',
  },
  bgOrb1: {
    position: 'absolute', width: 400, height: 400, borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(13,148,136,0.18) 0%, transparent 70%)',
    top: -100, right: -100, pointerEvents: 'none',
  },
  bgOrb2: {
    position: 'absolute', width: 350, height: 350, borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(30,58,138,0.25) 0%, transparent 70%)',
    bottom: -80, left: -80, pointerEvents: 'none',
  },
  card: {
    background: 'rgba(10,31,53,0.95)', border: '1px solid rgba(13,148,136,0.25)',
    borderRadius: 24, padding: '40px 36px', width: '100%', maxWidth: 460,
    boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(13,148,136,0.1)',
    backdropFilter: 'blur(12px)', position: 'relative',
  },
  logo: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 },
  logoIcon: {
    width: 48, height: 48, borderRadius: 12,
    background: 'linear-gradient(135deg, #0D9488, #1E3A8A)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 22, flexShrink: 0,
  },
  input: {
    background: 'rgba(255,255,255,0.07)',
    border: '1.5px solid rgba(13,148,136,0.3)',
    color: 'var(--text-primary)',
  },
  eyeBtn: {
    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 4,
  },
  googleBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    width: '100%', padding: '11px 20px', borderRadius: 10, cursor: 'pointer',
    background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.15)',
    color: 'var(--text-primary)', fontSize: 14, fontWeight: 700, transition: 'all 0.2s',
  },
};
