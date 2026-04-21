// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from 'firebase/auth';
import {
  doc, onSnapshot, setDoc, getDoc,
  updateDoc, serverTimestamp, collection,
  query, where, getDocs,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const AuthContext = createContext(null);

/* ── Get or create a stable device ID ── */
function getDeviceId() {
  let id = localStorage.getItem('nmcn_device_id');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('nmcn_device_id', id);
  }
  return id;
}

export function AuthProvider({ children }) {
  const [user,          setUser]          = useState(null);
  const [profile,       setProfile]       = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [deviceBlocked, setDeviceBlocked] = useState(false);
  const [blockReason,   setBlockReason]   = useState('');

  useEffect(() => {
    let profileUnsub = null;

    // Handle redirect result on page load (after signInWithRedirect)
    getRedirectResult(auth).then(async (result) => {
      if (result?.user) {
        const { uid, displayName, email } = result.user;
        const userRef = doc(db, 'users', uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          await setDoc(userRef, {
            uid,
            name:           displayName || '',
            email:          email || '',
            role:           'student',
            subscribed:     false,
            accessLevel:    'free',
            createdAt:      serverTimestamp(),
            examHistory:    [],
            totalScore:     0,
            totalExams:     0,
            completedExams: [],
            examScores:     {},
            bookmarkCount:  0,
            streak:         0,
          });
        }
      }
    }).catch(err => console.error('Redirect result error:', err));

    const authUnsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (profileUnsub) { profileUnsub(); profileUnsub = null; }

      if (firebaseUser) {
        setUser(firebaseUser);

        // ── Per-code device lock check ──────────────────────────────
        // Only enforce for subscribed non-admin users
        const userRef = doc(db, 'users', firebaseUser.uid);
        const snap    = await getDoc(userRef);

        if (snap.exists()) {
          const data = snap.data();

          if (data.subscribed && data.role !== 'admin' && data.accessCodeUsed) {
            const deviceId = getDeviceId();
            const codeUsed = data.accessCodeUsed;

            try {
              // Look up the access code document to verify device binding
              const codeSnap = await getDocs(
                query(
                  collection(db, 'accessCodes'),
                  where('code', '==', codeUsed)
                )
              );

              if (!codeSnap.empty) {
                const codeData = codeSnap.docs[0].data();

                // If code has a bound device that doesn't match this device → block
                if (
                  codeData.boundDeviceId &&
                  codeData.boundDeviceId !== deviceId
                ) {
                  setDeviceBlocked(true);
                  setBlockReason('device_mismatch');
                  setLoading(false);
                  return;
                }
              }
            } catch (e) {
              // If we can't check (e.g. offline), allow access — don't punish connectivity issues
              console.warn('Device check failed, allowing access:', e);
            }
          }

          setDeviceBlocked(false);
          setBlockReason('');
        }

        profileUnsub = onSnapshot(
          doc(db, 'users', firebaseUser.uid),
          (snap) => {
            if (snap.exists()) setProfile(snap.data());
            setLoading(false);
          },
          (err) => {
            console.error('Profile snapshot error:', err);
            setLoading(false);
          }
        );
      } else {
        setUser(null);
        setProfile(null);
        setDeviceBlocked(false);
        setBlockReason('');
        setLoading(false);
      }
    });

    return () => {
      authUnsub();
      if (profileUnsub) profileUnsub();
    };
  }, []);

  const login = (email, password) =>
    signInWithEmailAndPassword(auth, email, password);

  const register = async (email, password, name, role = 'student') => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, 'users', cred.user.uid), {
      uid:            cred.user.uid,
      name,
      email,
      role,
      subscribed:     false,
      accessLevel:    'free',
      createdAt:      serverTimestamp(),
      examHistory:    [],
      totalScore:     0,
      totalExams:     0,
      completedExams: [],
      examScores:     {},
      bookmarkCount:  0,
      streak:         0,
    });
    return cred;
  };

  // ── Google Sign-In (popup with redirect fallback) ─────────────
  const googleLogin = async (useRedirect = false) => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    if (useRedirect) {
      return signInWithRedirect(auth, provider);
    }

    const cred = await signInWithPopup(auth, provider);
    const { uid, displayName, email } = cred.user;

    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid,
        name:           displayName || '',
        email:          email || '',
        role:           'student',
        subscribed:     false,
        accessLevel:    'free',
        createdAt:      serverTimestamp(),
        examHistory:    [],
        totalScore:     0,
        totalExams:     0,
        completedExams: [],
        examScores:     {},
        bookmarkCount:  0,
        streak:         0,
      });
    }
    return cred;
  };

  const logout = () => signOut(auth);

  const resetPassword = (email) => sendPasswordResetEmail(auth, email);

  const refreshProfile = async () => {
    if (!user) return;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) setProfile(snap.data());
    } catch (err) {
      console.error('refreshProfile error:', err);
    }
  };

  return (
    <AuthContext.Provider value={{
      user, profile, loading, deviceBlocked,
      login, register, logout, resetPassword, refreshProfile, googleLogin,
      isAdmin:      profile?.role === 'admin',
      isSubscribed: profile?.subscribed || profile?.accessLevel === 'full',
    }}>
      {!loading && (
        deviceBlocked ? (
          <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg,#010810,#0A1628)', padding: 24,
          }}>
            <div style={{
              maxWidth: 420, width: '100%',
              background: 'rgba(239,68,68,0.08)',
              border: '2px solid rgba(239,68,68,0.4)',
              borderRadius: 20, padding: '40px 32px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>🔒</div>
              <h2 style={{ color: '#EF4444', fontFamily: "'Playfair Display',serif", margin: '0 0 12px' }}>
                Device Not Authorised
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, lineHeight: 1.8, margin: '0 0 8px' }}>
                Your access code is <strong style={{ color: '#fff' }}>locked to a different device</strong>.
              </p>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, lineHeight: 1.7, margin: '0 0 28px' }}>
                Each access code can only be used on <strong style={{ color: '#fff' }}>one device</strong>.
                If you lost or changed your device, contact your admin to reset the device lock.
              </p>
              <button
                onClick={() => signOut(auth)}
                style={{
                  width: '100%', padding: '12px', borderRadius: 10, cursor: 'pointer',
                  background: 'rgba(239,68,68,0.15)', color: '#EF4444',
                  fontWeight: 700, fontSize: 14,
                  border: '1px solid rgba(239,68,68,0.4)',
                }}
              >
                ← Sign Out
              </button>
            </div>
          </div>
        ) : children
      )}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
