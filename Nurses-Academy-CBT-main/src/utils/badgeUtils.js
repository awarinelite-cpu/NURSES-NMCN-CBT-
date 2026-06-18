// src/utils/badgeUtils.js
// Badge definitions and evaluation logic for The Elite Nurses CBT platform.
// Badges are computed from examSessions, streakData, and bookmarks.
// Earned badges are stored in users/{uid}/badges (Firestore doc).

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

// ── Badge Definitions ────────────────────────────────────────────────────────
export const BADGES = [
  // Streak badges
  { id: 'streak_3',     icon: '🔥', label: '3-Day Warrior',      desc: 'Practice 3 days in a row',           color: '#F97316', category: 'streak'   },
  { id: 'streak_7',     icon: '🔥', label: 'Week Champion',       desc: 'Practice 7 days in a row',           color: '#EF4444', category: 'streak'   },
  { id: 'streak_14',    icon: '💫', label: 'Fortnight Legend',    desc: 'Practice 14 days in a row',          color: '#A855F7', category: 'streak'   },
  { id: 'streak_30',    icon: '👑', label: '30-Day King/Queen',   desc: 'Practice 30 days in a row',          color: '#F59E0B', category: 'streak'   },

  // Score badges
  { id: 'perfect_score',icon: '💯', label: 'Perfect Score',       desc: 'Score 100% in any exam',             color: '#0D9488', category: 'score'    },
  { id: 'score_70',     icon: '🌟', label: 'High Achiever',       desc: 'Average score above 70%',            color: '#22C55E', category: 'score'    },
  { id: 'score_80',     icon: '🏅', label: 'Excellence Award',    desc: 'Average score above 80%',            color: '#3B82F6', category: 'score'    },
  { id: 'score_90',     icon: '🎖️', label: 'Distinction',         desc: 'Average score above 90%',            color: '#F59E0B', category: 'score'    },

  // Volume badges
  { id: 'exams_5',      icon: '📝', label: 'Getting Started',     desc: 'Complete 5 exams',                   color: '#64748B', category: 'volume'   },
  { id: 'exams_25',     icon: '📚', label: 'Dedicated Student',   desc: 'Complete 25 exams',                  color: '#0D9488', category: 'volume'   },
  { id: 'exams_50',     icon: '🎓', label: 'Scholar',             desc: 'Complete 50 exams',                  color: '#7C3AED', category: 'volume'   },
  { id: 'exams_100',    icon: '🏆', label: 'Centurion',           desc: 'Complete 100 exams',                 color: '#F59E0B', category: 'volume'   },

  // Questions badges
  { id: 'q_100',        icon: '💡', label: '100 Questions',       desc: 'Answer 100 questions',               color: '#0EA5E9', category: 'volume'   },
  { id: 'q_500',        icon: '⚡', label: '500 Questions',       desc: 'Answer 500 questions',               color: '#F97316', category: 'volume'   },
  { id: 'q_1000',       icon: '🚀', label: 'Question Master',     desc: 'Answer 1,000 questions',             color: '#A855F7', category: 'volume'   },

  // Bookmark badges
  { id: 'bookmark_10',  icon: '🔖', label: 'Bookworm',            desc: 'Bookmark 10 questions',              color: '#14B8A6', category: 'other'    },
  { id: 'bookmark_50',  icon: '📌', label: 'Knowledge Hoarder',   desc: 'Bookmark 50 questions',              color: '#8B5CF6', category: 'other'    },

  // Special badges
  { id: 'first_exam',   icon: '🎯', label: 'First Step',          desc: 'Complete your first exam',           color: '#22C55E', category: 'special'  },
  { id: 'daily_champ',  icon: '⚡', label: 'Daily Champion',      desc: 'Complete 10 daily practice sessions',color: '#F59E0B', category: 'special'  },
  { id: 'mock_master',  icon: '📋', label: 'Mock Master',         desc: 'Complete 5 mock exams',              color: '#EF4444', category: 'special'  },
  { id: 'night_owl',    icon: '🦉', label: 'Night Owl',           desc: 'Study after 10PM',                   color: '#6366F1', category: 'special'  },
  { id: 'early_bird',   icon: '🐦', label: 'Early Bird',          desc: 'Study before 6AM',                   color: '#F59E0B', category: 'special'  },
];

export const BADGE_MAP = Object.fromEntries(BADGES.map(b => [b.id, b]));

// ── Evaluate which badges a student has earned ───────────────────────────────
// sessions: array of examSession docs
// streakData: { currentStreak, longestStreak }
// bookmarkCount: number
// Returns array of badge ids that should be awarded
export function evaluateBadges({ sessions = [], streakData = {}, bookmarkCount = 0 }) {
  const earned = new Set();

  const totalExams     = sessions.length;
  const totalQuestions = sessions.reduce((s, e) => s + (e.totalQuestions || 0), 0);
  const avgScore       = totalExams
    ? Math.round(sessions.reduce((s, e) => s + (e.score || 0), 0) / totalExams)
    : 0;
  const longestStreak  = streakData?.longestStreak || 0;
  const currentStreak  = streakData?.currentStreak || 0;

  // Streak
  if (longestStreak >= 3  || currentStreak >= 3)  earned.add('streak_3');
  if (longestStreak >= 7  || currentStreak >= 7)  earned.add('streak_7');
  if (longestStreak >= 14 || currentStreak >= 14) earned.add('streak_14');
  if (longestStreak >= 30 || currentStreak >= 30) earned.add('streak_30');

  // Score
  if (sessions.some(e => (e.score || 0) >= 100))  earned.add('perfect_score');
  if (avgScore >= 70 && totalExams >= 5)           earned.add('score_70');
  if (avgScore >= 80 && totalExams >= 5)           earned.add('score_80');
  if (avgScore >= 90 && totalExams >= 5)           earned.add('score_90');

  // Volume — exams
  if (totalExams >= 1)   earned.add('first_exam');
  if (totalExams >= 5)   earned.add('exams_5');
  if (totalExams >= 25)  earned.add('exams_25');
  if (totalExams >= 50)  earned.add('exams_50');
  if (totalExams >= 100) earned.add('exams_100');

  // Volume — questions
  if (totalQuestions >= 100)  earned.add('q_100');
  if (totalQuestions >= 500)  earned.add('q_500');
  if (totalQuestions >= 1000) earned.add('q_1000');

  // Bookmarks
  if (bookmarkCount >= 10) earned.add('bookmark_10');
  if (bookmarkCount >= 50) earned.add('bookmark_50');

  // Daily practice
  const dailySessions = sessions.filter(e => e.examType === 'daily_practice');
  if (dailySessions.length >= 10) earned.add('daily_champ');

  // Mock exams
  const mockSessions = sessions.filter(e => e.examType === 'mock_exam');
  if (mockSessions.length >= 5) earned.add('mock_master');

  // Time-based: night owl / early bird (check session timestamps)
  sessions.forEach(e => {
    if (!e.completedAt) return;
    const d = e.completedAt.toDate ? e.completedAt.toDate() : new Date(e.completedAt);
    const hour = d.getHours();
    if (hour >= 22 || hour < 3) earned.add('night_owl');
    if (hour >= 4  && hour < 6) earned.add('early_bird');
  });

  return [...earned];
}

// ── Save badges to Firestore ─────────────────────────────────────────────────
export async function syncBadges(uid, newlyEarnedIds) {
  if (!uid || !newlyEarnedIds.length) return [];
  const ref  = doc(db, 'users', uid, 'badges', 'earned');
  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data().badgeIds || []) : [];
  const existingSet = new Set(existing);
  const brandNew = newlyEarnedIds.filter(id => !existingSet.has(id));
  if (!brandNew.length) return [];
  const merged = [...new Set([...existing, ...newlyEarnedIds])];
  await setDoc(ref, { badgeIds: merged, updatedAt: new Date().toISOString() });
  return brandNew; // returns only newly unlocked ones for toast/confetti
}

// ── Fetch earned badges for a user ──────────────────────────────────────────
export async function fetchBadges(uid) {
  if (!uid) return [];
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'badges', 'earned'));
    if (!snap.exists()) return [];
    return snap.data().badgeIds || [];
  } catch { return []; }
}
