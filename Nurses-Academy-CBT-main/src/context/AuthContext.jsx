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
  signInWithRedirect,
  getRedirectResult,
} from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let profileUnsub = null;

    // ── Handle Google redirect result on page load ──────────────
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
    }).catch(console.error);

    const authUnsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (profileUnsub) { profileUnsub(); profileUnsub = null; }

      if (firebaseUser) {
        setUser(firebaseUser);
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
      uid:          cred.user.uid,
      name,
      email,
      role,
      subscribed:   false,
      accessLevel:  'free',
      createdAt:    serverTimestamp(),
      examHistory:  [],
      totalScore:   0,
      totalExams:   0,
      completedExams: [],
      examScores:   {},
      bookmarkCount: 0,
      streak:       0,
    });
    return cred;
  };

  // ── Google Sign-In (redirect — works on all hosted domains) ────
  const googleLogin = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithRedirect(auth, provider);
    // Page will redirect to Google, then come back — result handled in useEffect above
  };

  const logout = () => signOut(auth);

  const resetPassword = (email) => sendPasswordResetEmail(auth, email);

  const refreshProfile = () => {};

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      login, register, logout, resetPassword, refreshProfile, googleLogin,
      isAdmin:      profile?.role === 'admin',
      isSubscribed: profile?.subscribed || profile?.accessLevel === 'full',
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
