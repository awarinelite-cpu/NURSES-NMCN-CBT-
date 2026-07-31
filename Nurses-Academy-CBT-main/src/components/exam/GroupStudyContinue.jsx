// src/components/exam/GroupStudyContinue.jsx
// Route: /group-study/:sessionId
//
// Lands here when a group is sent back to the Group Study page after an
// exam — either because the host tapped "Start Another Exam" on the
// review screen, or because someone reloads/re-navigates while a session
// is still live. Just re-attaches to the existing studySessions doc and
// renders the same Group Study UI (GroupSessionLobby), picking up right
// at the exam-type / question-count step — the group call is untouched
// throughout, since it lives in GroupCallContext, not this route.

import { useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import GroupSessionLobby from './GroupSessionLobby';

export default function GroupStudyContinue() {
  const { sessionId } = useParams();
  const { user, profile } = useAuth();

  return (
    <GroupSessionLobby
      uid={user?.uid}
      name={profile?.name || user?.displayName || 'Participant'}
      existingSessionId={sessionId}
    />
  );
}
