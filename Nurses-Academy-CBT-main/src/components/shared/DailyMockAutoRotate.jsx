// src/components/shared/DailyMockAutoRotate.jsx
//
// Renders nothing. When a signed-in user opens the app (or brings it back to
// the foreground) after the Lagos-midnight boundary, and today's Daily Mock
// pools have not been built yet, this rebuilds them. The first user of the
// day does the work; everyone else finds fresh pools already waiting.
// See src/utils/dailyMockRotation.js.

import { useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ensureDailyMockFresh, lagosDateKey } from '../../utils/dailyMockRotation';

export default function DailyMockAutoRotate() {
  const { user, profile } = useAuth();
  const uid     = user?.uid;
  const isAdmin = profile?.role === 'admin' || profile?.role === 'subadmin';
  const lastCheckedDay = useRef(null);
  const running        = useRef(false);

  useEffect(() => {
    if (!uid || !profile) return undefined;

    const check = async () => {
      const today = lagosDateKey();
      if (running.current || lastCheckedDay.current === today) return;
      running.current = true;
      const res = await ensureDailyMockFresh(uid, { isAdmin });
      // Only remember the day once we know pools are fresh, so a transient
      // failure is retried on the next foreground.
      if (res?.ok) lastCheckedDay.current = today;
      running.current = false;
    };

    check();
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [uid, profile, isAdmin]);

  return null;
}
