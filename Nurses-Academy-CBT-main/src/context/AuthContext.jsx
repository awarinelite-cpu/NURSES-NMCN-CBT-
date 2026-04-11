// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let profileUnsub = null;

    const authUnsub = onAuthStateChanged(auth, (firebaseUser) => {
      // Clean up previous profile listener if any
      if (profileUnsub) { profileUnsub(); profileUnsub = null; }

      if (firebaseUser) {
        setUser(firebaseUser);
        // Real-time listener — profile updates instantly whenever
        // ExamSession (or anything else) writes to the user's Firestore doc
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
    const profileData = {
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
    };
    await setDoc(doc(db, 'users', cred.user.uid), profileData);
    // onSnapshot will pick this up automatically
    return cred;
  };

  const logout = () => signOut(auth);

  const resetPassword = (email) => sendPasswordResetEmail(auth, email);

  // refreshProfile kept for compatibility but onSnapshot makes it redundant
  const refreshProfile = () => {};

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      login, register, logout, resetPassword, refreshProfile,
      isAdmin:      profile?.role === 'admin',
      isSubscribed: profile?.subscribed || profile?.accessLevel === 'full',
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
