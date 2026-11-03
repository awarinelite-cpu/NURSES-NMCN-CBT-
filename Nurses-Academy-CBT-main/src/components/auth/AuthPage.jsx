// src/components/auth/AuthPage.jsx
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase/config';

// ── Helper: store and read which platform the user chose ────────────────────
export function getChosenPlatform() {
  return localStorage.getItem('nmcn_chosen_platform') || 'nmcn';
}
function setChosenPlatform(p) {
  localStorage.setItem('nmcn_chosen_platform', p === 'entrance' ? 'entrance' : 'nmcn');
}
function platformRedirect(platform) {
  return platform === 'entrance' ? '/entrance-exam' : '/dashboard';
}

export default function AuthPage() {
  const [searchParams]      = useSearchParams();
  const platformParam       = searchParams.get('platform'); // 'nmcn' | 'entrance' | null

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

  // Persist the platform choice whenever this page is opened with a param
  useEffect(() => {
    if (platformParam) setChosenPlatform(platformParam);
  }, [platformParam]);

  // Determine active platform (from URL or stored)
  const platform = platformParam || getChosenPlatform();
  const isEntrance = platform === 'entrance';

  // Load schools only for entrance platform registration
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
        setTimeout(() => navigate(platformRedirect(platform)), 100);
      } else if (mode === 'register') {
        if (password !== confirm) throw new Error('Passwords do not match.');
        if (password.length < 6)  throw new Error('Password must be at least 6 characters.');
        // School is only required for entrance platform
        if (isEntrance && !school) throw new Error('Please select your school.');
        await register(email, password, name, 'student', school, platform);
        navigate(platformRedirect(platform));
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
      await googleLogin(false, platform);
      navigate(platformRedirect(platform));
    } catch (err) {
      if (err.code === 'auth/popup-blocked' || (err.message && err.message.includes('popup-blocked'))) {
        await googleLogin(true, platform);
        return;
      }
      let msg = err.message || '';
      if (msg.includes('popup-closed')) msg = 'Sign-in cancelled.';
      else if (msg.includes('network'))  msg = 'Network error. Check your connection.';
      setError(msg);
      setLoading(false);
    }
  };

  const F = "'Plus Jakarta Sans', system-ui, sans-serif";
  const H = "'Plus Jakarta Sans', system-ui, sans-serif";

  // Platform-specific branding
  const brand = isEntrance
    ? { icon: '🏫', name: 'Entrance Exam', sub: 'Nursing Schools Entrance Exam Platform', accent: '#F59E0B' }
    : { icon: '📚', name: 'NMCN CBT',      sub: 'Nursing Exam Prep Platform',             accent: '#15803D' };

  return (
    <div style={styles.page}>
      <div style={styles.card} className="anim-bounceIn">
        {/* Platform indicator strip at top */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 4,
          borderRadius: '24px 24px 0 0',
          background: brand.accent,
        }} />

        {/* Logo */}
        <div style={styles.logo}>
          <div style={{ ...styles.logoIcon, background: brand.accent }}>
            <svg width="28" height="28" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 8l36 12v26c0 24-16 40-36 46C30 86 14 70 14 46V20z" fill="#fff"/><path d="M45 30h10v14h14v10H55v14H45V54H31V44h14z" fill={brand.accent}/></svg>
          </div>
          <div>
            <div style={{ fontFamily: H, fontWeight: 800, fontSize: 20, color: '#14532D', letterSpacing: 1 }}>
              {brand.name}
            </div>
            <div style={{ fontSize: 11, color: '#4B5E52', marginTop: 1, fontFamily: F }}>
              {brand.sub}
            </div>
          </div>
        </div>

        {/* Platform badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: `${brand.accent}18`, border: `1px solid ${brand.accent}44`,
          borderRadius: 20, padding: '4px 12px', marginBottom: 20,
          fontSize: 12, color: isEntrance ? '#92400E' : brand.accent, fontWeight: 700, fontFamily: F,
        }}>
          {isEntrance ? '🏫 Nursing Schools Entrance Exam' : '📚 NMCN CBT — Nursing Council Exam'}
        </div>

        {/* Title */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontFamily: H, fontWeight: 800, color: '#14532D', fontSize: 'clamp(1.4rem,3vw,2rem)', marginBottom: 6 }}>
            {mode === 'login'    && 'Welcome Back!'}
            {mode === 'register' && 'Create Account'}
            {mode === 'forgot'   && 'Reset Password'}
          </h2>
          <p style={{ fontSize: 14, color: '#4B5E52', lineHeight: 1.5, fontFamily: F, fontWeight: 700 }}>
            {mode === 'login'    && 'Sign in to continue your exam preparation'}
            {mode === 'register' && `Join thousands of nursing students preparing ${isEntrance ? 'for entrance exams' : 'for NMCN'}`}
            {mode === 'forgot'   && 'Enter your email to receive a reset link'}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Full Name */}
          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label" style={{ fontFamily: F, fontWeight: 700, color: '#14532D' }}>
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
            <label className="form-label" style={{ fontFamily: F, fontWeight: 700, color: '#14532D' }}>
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
              <label className="form-label" style={{ fontFamily: F, fontWeight: 700, color: '#14532D' }}>
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
              <label className="form-label" style={{ fontFamily: F, fontWeight: 700, color: '#14532D' }}>
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

          {/* School selector — only for entrance platform registration */}
          {mode === 'register' && isEntrance && (
            <div className="form-group">
              <label className="form-label" style={{ fontFamily: F, fontWeight: 700, color: '#14532D' }}>
                🏫 Your Nursing School
              </label>
              <select
                className="form-input form-select"
                value={school}
                onChange={e => setSchool(e.target.value)}
                required
                style={{
                  ...styles.input,
                  color: school ? '#FFFFFF' : '#4B5E52',
                  fontFamily: F, fontWeight: 700,
                }}
              >
                <option value="" disabled style={{ background: '#FFFFFF', color: '#4B5E52' }}>
                  {schoolsLoading ? 'Loading schools…' : '— Select your school —'}
                </option>
                {schools.map(s => (
                  <option key={s.id} value={s.name} style={{ background: '#FFFFFF', color: '#14301F' }}>
                    {s.name}
                  </option>
                ))}
                <option value="Other" style={{ background: '#FFFFFF', color: '#14301F' }}>Other</option>
              </select>
              <p style={{ fontSize: 12, fontFamily: F, fontWeight: 700, color: '#4B5E52', marginTop: 4 }}>
                This determines which leaderboard you appear on. Can be changed in your profile.
              </p>
            </div>
          )}

          {error   && <div className="alert alert-error"><span>⚠️</span>{error}</div>}
          {success && <div className="alert alert-success"><span>✅</span>{success}</div>}

          {mode === 'login' && (
            <button type="button" onClick={() => { setMode('forgot'); setError(''); }}
              style={{ alignSelf: 'flex-end', background: 'none', border: 'none', color: '#15803D', fontSize: 13, cursor: 'pointer', fontFamily: F, textDecoration: 'underline', fontWeight: 700 }}>
              Forgot password?
            </button>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            disabled={loading}
            style={{
              fontFamily: F, fontWeight: 800, fontSize: 16, height: 52, borderRadius: 26,
              background: brand.accent,
              borderColor: brand.accent,
            }}
          >
            {loading ? <><span className="spinner spinner-sm" />Processing…</> : (
              mode === 'login'    ? 'Login' :
              mode === 'register' ? 'Register' :
              'Send Reset Link'
            )}
          </button>
        </form>

        {/* Google */}
        {mode !== 'forgot' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 12px' }}>
              <div style={{ flex: 1, height: 1, background: '#BBF7D0' }} />
              <span style={{ fontSize: 12, color: '#4B5E52', fontWeight: 700, textTransform: 'uppercase', fontFamily: F }}>or</span>
              <div style={{ flex: 1, height: 1, background: '#BBF7D0' }} />
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
              <span style={{ fontSize: 14, color: '#4B5E52', fontFamily: F, fontWeight: 700 }}>Don't have an account?</span>
              <button style={{ background: 'none', border: 'none', color: '#15803D', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: F, textDecoration: 'underline' }}
                onClick={() => { setMode('register'); setError(''); }}>
                Create one free
              </button>
            </>
          )}
          {(mode === 'register' || mode === 'forgot') && (
            <>
              <span style={{ fontSize: 14, color: '#4B5E52', fontFamily: F, fontWeight: 700 }}>Already have an account?</span>
              <button style={{ background: 'none', border: 'none', color: '#15803D', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: F, textDecoration: 'underline' }}
                onClick={() => { setMode('login'); setError(''); }}>
                Sign in
              </button>
            </>
          )}
        </div>

        {/* Switch platform link */}
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <a
            href={isEntrance ? '/auth?platform=nmcn' : '/auth?platform=entrance'}
            style={{ fontSize: 12, color: '#4B5E52', fontFamily: F, fontWeight: 700, textDecoration: 'underline' }}
          >
            {isEntrance ? '← Switch to NMCN CBT platform' : '← Switch to Entrance Exam platform'}
          </a>
        </div>

        <div style={{ textAlign: 'center', fontSize: 12, color: '#4B5E52', marginTop: 14, padding: '10px', background: '#F0FDF4', borderRadius: 8, fontFamily: F, fontWeight: 700 }}>
          🏥 {isEntrance ? 'For nursing school applicants & Post-UTME candidates' : 'Exclusively for NMCN-registered nursing students'}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#F0FDF4',
    padding: '20px', position: 'relative', overflow: 'hidden',
  },
  bgOrb1: {
    position: 'absolute', width: 400, height: 400, borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(21,128,61,0.18) 0%, transparent 70%)',
    top: -100, right: -100, pointerEvents: 'none',
  },
  bgOrb2: {
    position: 'absolute', width: 350, height: 350, borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(30,58,138,0.25) 0%, transparent 70%)',
    bottom: -80, left: -80, pointerEvents: 'none',
  },
  card: {
    background: '#FFFFFF', border: '1px solid #BBF7D0',
    borderRadius: 28, padding: '44px 36px 36px', width: '100%', maxWidth: 460,
    boxShadow: '0 10px 40px rgba(20,83,45,0.12)',
    position: 'relative', overflow: 'hidden',
  },
  logo: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 },
  logoIcon: {
    width: 48, height: 48, borderRadius: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 22, flexShrink: 0,
  },
  input: {
    background: '#FFFFFF',
    border: '1.5px solid #BBF7D0',
    color: '#14301F',
  },
  eyeBtn: {
    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 4,
  },
  googleBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    width: '100%', padding: '11px 20px', borderRadius: 10, cursor: 'pointer',
    background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.15)',
    color: '#fff', fontSize: 14, fontWeight: 700, transition: 'all 0.2s',
  },
};
