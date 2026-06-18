// src/components/student/StudyPlanPage.jsx
// AI-powered personalised study plan generator for NMCN CBT students.
// Collects exam date, weak topics, hours/day → calls Claude API → renders
// a structured week-by-week plan the student can follow and drill from.

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

// ── Design tokens (match rest of app) ────────────────────────────────────────
const H = "'Arial Black', Arial, sans-serif";
const F = "'Inter', 'Segoe UI', Arial, sans-serif";

const T = {
  primary:   'var(--text-primary)',
  muted:     'var(--text-muted)',
  teal:      'var(--teal, #0D9488)',
  gold:      '#F59E0B',
  red:       '#EF4444',
  green:     '#22C55E',
  purple:    '#7C3AED',
};

const C = {
  card:      'var(--bg-card)',
  border:    'var(--border)',
  primary:   'var(--bg-primary)',
  secondary: 'var(--bg-secondary)',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.max(0, Math.ceil(diff / 86400000));
}

function weeksUntil(dateStr) {
  const d = daysUntil(dateStr);
  return d === null ? null : Math.max(1, Math.ceil(d / 7));
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Card({ children, style = {} }) {
  return (
    <div style={{
      background: C.card, border: `1.5px solid ${C.border}`,
      borderRadius: 16, padding: '20px 22px', ...style,
    }}>
      {children}
    </div>
  );
}

function StepDot({ n, active, done }) {
  const bg = done ? T.teal : active ? T.teal : C.border;
  const color = (done || active) ? '#fff' : T.muted;
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
      background: bg, color, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontWeight: 800, fontSize: 12, fontFamily: H,
      transition: 'background .3s',
    }}>
      {done ? '✓' : n}
    </div>
  );
}

function PillToggle({ options, selected, onChange, multi = false }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map(o => {
        const isOn = multi ? selected.includes(o.id) : selected === o.id;
        return (
          <button
            key={o.id}
            onClick={() => {
              if (multi) {
                onChange(isOn ? selected.filter(x => x !== o.id) : [...selected, o.id]);
              } else {
                onChange(o.id);
              }
            }}
            style={{
              padding: '8px 14px', borderRadius: 20, cursor: 'pointer',
              fontFamily: F, fontSize: 13, fontWeight: isOn ? 700 : 500,
              border: `1.5px solid ${isOn ? T.teal : C.border}`,
              background: isOn ? 'rgba(13,148,136,0.12)' : C.primary,
              color: isOn ? T.teal : T.primary,
              transition: 'all .2s',
            }}
          >
            {o.icon && <span style={{ marginRight: 5 }}>{o.icon}</span>}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '40px 0' }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        border: `3px solid ${C.border}`,
        borderTop: `3px solid ${T.teal}`,
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ fontFamily: F, fontSize: 14, color: T.muted, margin: 0 }}>
        Claude is building your personalised plan…
      </p>
    </div>
  );
}

// ── Week plan card ────────────────────────────────────────────────────────────
function WeekCard({ week, onDrill }) {
  const [open, setOpen] = useState(week.weekNumber === 1);
  const urgencyColor =
    week.focus === 'high'   ? T.red :
    week.focus === 'medium' ? T.gold : T.green;

  return (
    <div style={{
      border: `1.5px solid ${C.border}`, borderRadius: 14,
      overflow: 'hidden', marginBottom: 12,
    }}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', background: C.card,
          border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: `${urgencyColor}20`, border: `1.5px solid ${urgencyColor}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: H, fontWeight: 900, fontSize: 13, color: urgencyColor,
        }}>
          W{week.weekNumber}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: H, fontWeight: 900, fontSize: 14, color: T.primary }}>
            {week.title}
          </div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
            {week.topics?.length || 0} topics · {week.hoursRequired}h recommended
          </div>
        </div>
        <span style={{ color: T.muted, fontSize: 16, transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>

      {/* Body */}
      {open && (
        <div style={{ padding: '0 16px 16px', background: C.primary }}>
          {/* Goal */}
          <p style={{ fontFamily: F, fontSize: 13, color: T.muted, margin: '12px 0 10px', lineHeight: 1.6 }}>
            🎯 <strong style={{ color: T.primary }}>Goal:</strong> {week.goal}
          </p>

          {/* Daily schedule */}
          {week.dailySchedule && (
            <div style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: '12px 14px', marginBottom: 12,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Daily Schedule
              </div>
              {week.dailySchedule.map((d, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  paddingBottom: i < week.dailySchedule.length - 1 ? 8 : 0,
                  marginBottom: i < week.dailySchedule.length - 1 ? 8 : 0,
                  borderBottom: i < week.dailySchedule.length - 1 ? `1px solid ${C.border}` : 'none',
                }}>
                  <span style={{ fontSize: 13, minWidth: 24 }}>{d.icon}</span>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.primary }}>{d.day}: </span>
                    <span style={{ fontSize: 13, color: T.muted }}>{d.activity}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Topics to drill */}
          {week.topics?.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Topics to drill
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {week.topics.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => onDrill(t)}
                    style={{
                      padding: '7px 13px', borderRadius: 20,
                      border: `1.5px solid ${T.teal}40`,
                      background: 'rgba(13,148,136,0.08)',
                      color: T.teal, fontSize: 12, fontWeight: 700,
                      cursor: 'pointer', fontFamily: F,
                      transition: 'background .2s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(13,148,136,0.18)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(13,148,136,0.08)'}
                  >
                    📚 {t.name} →
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tip */}
          {week.tip && (
            <div style={{
              marginTop: 12, padding: '10px 14px',
              background: 'rgba(245,158,11,0.07)',
              border: `1px solid rgba(245,158,11,0.25)`,
              borderRadius: 10, fontSize: 12, color: T.muted, lineHeight: 1.6,
            }}>
              💡 {week.tip}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StudyPlanPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  // Form state
  const [step, setStep]           = useState(1); // 1=setup, 2=generating, 3=plan
  const [examDate, setExamDate]   = useState('');
  const [hoursPerDay, setHours]   = useState('2');
  const [weakCats, setWeakCats]   = useState([]);   // selected category ids
  const [studyDays, setStudyDays] = useState(['Mon','Tue','Wed','Thu','Fri','Sat']);
  const [goal, setGoal]           = useState('pass');

  // Generated plan
  const [plan, setPlan]     = useState(null);
  const [error, setError]   = useState('');
  const [saved, setSaved]   = useState(false);

  // Session stats for AI context
  const [stats, setStats] = useState(null);

  // Load existing saved plan + session stats on mount
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        // Load saved plan
        const planSnap = await getDoc(doc(db, 'studyPlans', user.uid));
        if (!cancelled && planSnap.exists()) {
          const data = planSnap.data();
          setPlan(data.plan);
          setExamDate(data.examDate || '');
          setStep(3);
          setSaved(true);
        }

        // Load session stats for AI context
        const sessSnap = await getDocs(query(
          collection(db, 'examSessions'),
          where('userId', '==', user.uid),
        ));
        if (!cancelled) {
          const sessions = sessSnap.docs.map(d => d.data());
          const total    = sessions.length;
          const avgScore = total
            ? Math.round(sessions.reduce((s, x) => s + (x.scorePercent || 0), 0) / total)
            : 0;

          // Per-category averages
          const catStats = NURSING_CATEGORIES.map(cat => {
            const catSess = sessions.filter(s => s.category === cat.id);
            const avg = catSess.length
              ? Math.round(catSess.reduce((s, x) => s + (x.scorePercent || 0), 0) / catSess.length)
              : null;
            return { id: cat.id, label: cat.shortLabel, avg, count: catSess.length };
          }).filter(c => c.avg !== null);

          // Weak topics (< 60%)
          const topicMap = {};
          sessions.forEach(s => {
            if (!s.topic) return;
            const key = `${s.course}||${s.topic}`;
            if (!topicMap[key]) topicMap[key] = { topic: s.topic, course: s.course, total: 0, sum: 0 };
            topicMap[key].total++;
            topicMap[key].sum += (s.scorePercent || 0);
          });
          const weakTopics = Object.values(topicMap)
            .filter(t => t.total >= 2)
            .map(t => ({ ...t, avg: Math.round(t.sum / t.total) }))
            .filter(t => t.avg < 60)
            .sort((a, b) => a.avg - b.avg)
            .slice(0, 6);

          setStats({ total, avgScore, catStats, weakTopics });
        }
      } catch (e) {
        console.warn('StudyPlan load error:', e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // ── Generate plan via Claude API ──────────────────────────────────────────
  const generatePlan = useCallback(async () => {
    setStep(2);
    setError('');

    const weeks          = weeksUntil(examDate) || 8;
    const days           = daysUntil(examDate)  || 56;
    const selectedCats   = NURSING_CATEGORIES.filter(c => weakCats.includes(c.id));
    const studentName    = profile?.name || user?.displayName || 'Student';
    const totalSessions  = stats?.total || 0;
    const avgScore       = stats?.avgScore || 0;
    const weakTopics     = stats?.weakTopics || [];
    const catStats       = stats?.catStats || [];

    const systemPrompt = `You are an expert NMCN (Nursing and Midwifery Council of Nigeria) exam coach. 
Generate a personalised study plan as a JSON object ONLY — no markdown, no explanation, no preamble.
The JSON must match this exact schema:
{
  "summary": "2-3 sentence motivational overview of the plan",
  "totalWeeks": number,
  "examDate": "date string",
  "studentLevel": "beginner|intermediate|advanced",
  "weeks": [
    {
      "weekNumber": 1,
      "title": "Short week theme title",
      "goal": "One-sentence specific goal for the week",
      "focus": "high|medium|low",
      "hoursRequired": number,
      "topics": [
        { "name": "Topic name", "course": "course id or empty", "category": "category id or empty" }
      ],
      "dailySchedule": [
        { "icon": "emoji", "day": "Mon", "activity": "What to do and how long" }
      ],
      "tip": "One practical exam tip relevant to this week's content"
    }
  ],
  "generalTips": ["tip1", "tip2", "tip3"],
  "motivationalMessage": "Closing message personalised to the student"
}
Return ONLY valid JSON. No markdown fences.`;

    const userPrompt = `Create a ${weeks}-week NMCN CBT study plan for ${studentName}.

STUDENT DATA:
- Exam date: ${examDate} (${days} days / ${weeks} weeks away)
- Goal: ${goal === 'pass' ? 'Pass the NMCN exam' : goal === 'distinction' ? 'Score distinction (80%+)' : 'Improve current weak areas'}
- Available study days: ${studyDays.join(', ')} (${studyDays.length} days/week)
- Hours available per study day: ${hoursPerDay}h
- Total exam sessions completed: ${totalSessions}
- Current average score: ${avgScore}%

WEAK CATEGORIES (student selected as needing focus):
${selectedCats.length ? selectedCats.map(c => `- ${c.shortLabel} (${c.icon})`).join('\n') : '- No specific categories selected; use performance data below'}

PERFORMANCE DATA BY CATEGORY:
${catStats.length ? catStats.map(c => `- ${c.label}: ${c.avg}% avg (${c.count} sessions)`).join('\n') : '- No session data yet'}

WEAKEST TOPICS (below 60%):
${weakTopics.length ? weakTopics.map(t => `- ${t.topic} (${t.avg}%)`).join('\n') : '- No topic data yet; assume typical NMCN weak areas'}

IMPORTANT NMCN EXAM AREAS TO COVER:
General Nursing: Anatomy & Physiology, Medical-Surgical Nursing, Pharmacology, Nutrition, Maternal & Child Health, Community Health, Mental Health, Ethics & Law

Distribute topics across ${weeks} weeks, front-loading weak areas. Each week must have 3-6 specific drillable topics.
Daily schedule entries should cover exactly the days: ${studyDays.join(', ')}.`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });

      const data = await res.json();
      const raw  = data.content?.find(b => b.type === 'text')?.text || '';
      const clean = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);

      // Save to Firestore
      await setDoc(doc(db, 'studyPlans', user.uid), {
        plan: parsed, examDate, createdAt: Date.now(),
        userId: user.uid,
      });

      setPlan(parsed);
      setSaved(true);
      setStep(3);
    } catch (e) {
      console.error('Plan generation failed:', e);
      setError('Could not generate your plan. Please check your connection and try again.');
      setStep(1);
    }
  }, [examDate, hoursPerDay, weakCats, studyDays, goal, user, profile, stats]);

  // ── Drill handler ─────────────────────────────────────────────────────────
  const handleDrill = useCallback((topic) => {
    navigate('/exam/session', {
      state: {
        poolMode: true, examType: 'topic_drill',
        examName: `Drill: ${topic.name}`,
        category: topic.category || '',
        course:   topic.course   || '',
        topic:    topic.name,
        count: 20, doShuffle: true, timeLimit: 0,
      },
    });
  }, [navigate]);

  const resetPlan = () => {
    setPlan(null); setSaved(false); setStep(1); setError('');
    setWeakCats([]); setExamDate(''); setHours('2');
    setStudyDays(['Mon','Tue','Wed','Thu','Fri','Sat']); setGoal('pass');
  };

  // ── Min exam date = 7 days from today ────────────────────────────────────
  const minDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const dayOptions = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px', maxWidth: 760, margin: '0 auto' }}>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: 'rgba(124,58,237,0.12)', border: '1.5px solid rgba(124,58,237,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
          }}>📅</div>
          <div>
            <h1 style={{ fontFamily: H, fontWeight: 900, fontSize: 22, color: T.primary, margin: 0 }}>
              AI Study Plan
            </h1>
            <p style={{ fontFamily: F, fontSize: 13, color: T.muted, margin: 0 }}>
              Personalised week-by-week prep built around your exam date and weak areas
            </p>
          </div>
        </div>
      </div>

      {/* ── STEP 1: Setup form ── */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Stepper */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            {[
              { n: 1, label: 'Your details' },
              { n: 2, label: 'Weak areas' },
              { n: 3, label: 'Generate' },
            ].map((s, i, arr) => (
              <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <StepDot n={s.n} active={true} done={false} />
                <span style={{ fontSize: 13, fontFamily: F, color: T.muted }}>{s.label}</span>
                {i < arr.length - 1 && <div style={{ width: 24, height: 1.5, background: C.border }} />}
              </div>
            ))}
          </div>

          {/* Exam date */}
          <Card>
            <label style={{ fontFamily: H, fontWeight: 900, fontSize: 14, color: T.primary, display: 'block', marginBottom: 10 }}>
              📅 When is your NMCN exam?
            </label>
            <input
              type="date"
              min={minDate}
              value={examDate}
              onChange={e => setExamDate(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10,
                border: `1.5px solid ${examDate ? T.teal : C.border}`,
                background: C.primary, color: T.primary,
                fontFamily: F, fontSize: 14, boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            {examDate && (
              <p style={{ fontFamily: F, fontSize: 13, color: T.teal, margin: '8px 0 0' }}>
                ⏰ {daysUntil(examDate)} days away — {weeksUntil(examDate)} weeks to prepare
              </p>
            )}
          </Card>

          {/* Study goal */}
          <Card>
            <label style={{ fontFamily: H, fontWeight: 900, fontSize: 14, color: T.primary, display: 'block', marginBottom: 12 }}>
              🎯 What is your goal?
            </label>
            <PillToggle
              options={[
                { id: 'pass',        label: 'Pass the exam',       icon: '✅' },
                { id: 'distinction', label: 'Score 80%+',          icon: '🏅' },
                { id: 'improve',     label: 'Fix weak areas only',  icon: '📈' },
              ]}
              selected={goal}
              onChange={setGoal}
            />
          </Card>

          {/* Hours per day */}
          <Card>
            <label style={{ fontFamily: H, fontWeight: 900, fontSize: 14, color: T.primary, display: 'block', marginBottom: 12 }}>
              ⏱️ How many hours can you study per day?
            </label>
            <PillToggle
              options={[
                { id: '1',  label: '1 hour'    },
                { id: '2',  label: '2 hours'   },
                { id: '3',  label: '3 hours'   },
                { id: '4',  label: '4+ hours'  },
              ]}
              selected={hoursPerDay}
              onChange={setHours}
            />
          </Card>

          {/* Study days */}
          <Card>
            <label style={{ fontFamily: H, fontWeight: 900, fontSize: 14, color: T.primary, display: 'block', marginBottom: 12 }}>
              📆 Which days can you study?
            </label>
            <PillToggle
              options={dayOptions.map(d => ({ id: d, label: d }))}
              selected={studyDays}
              onChange={setStudyDays}
              multi
            />
            <p style={{ fontFamily: F, fontSize: 12, color: T.muted, margin: '10px 0 0' }}>
              {studyDays.length} days/week selected
            </p>
          </Card>

          {/* Weak categories */}
          <Card>
            <label style={{ fontFamily: H, fontWeight: 900, fontSize: 14, color: T.primary, display: 'block', marginBottom: 6 }}>
              ⚠️ Which nursing areas feel weakest?
            </label>
            <p style={{ fontFamily: F, fontSize: 12, color: T.muted, margin: '0 0 12px' }}>
              Select all that apply — Claude will front-load these in your plan
            </p>
            <PillToggle
              options={NURSING_CATEGORIES.map(c => ({ id: c.id, label: c.shortLabel, icon: c.icon }))}
              selected={weakCats}
              onChange={setWeakCats}
              multi
            />
          </Card>

          {/* Stats preview */}
          {stats && stats.total > 0 && (
            <Card style={{ background: 'rgba(13,148,136,0.04)', border: `1.5px solid rgba(13,148,136,0.2)` }}>
              <div style={{ fontFamily: H, fontWeight: 900, fontSize: 13, color: T.teal, marginBottom: 10 }}>
                📊 Your performance data will also be included
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13, color: T.muted }}>
                  <strong style={{ color: T.primary }}>{stats.total}</strong> sessions completed
                </div>
                <div style={{ fontSize: 13, color: T.muted }}>
                  <strong style={{ color: T.primary }}>{stats.avgScore}%</strong> average score
                </div>
                {stats.weakTopics.length > 0 && (
                  <div style={{ fontSize: 13, color: T.muted }}>
                    <strong style={{ color: T.red }}>{stats.weakTopics.length}</strong> weak topics detected
                  </div>
                )}
              </div>
            </Card>
          )}

          {error && (
            <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: `1.5px solid rgba(239,68,68,0.3)`, color: T.red, fontFamily: F, fontSize: 13 }}>
              ⚠️ {error}
            </div>
          )}

          {/* Generate button */}
          <button
            disabled={!examDate || studyDays.length === 0}
            onClick={generatePlan}
            style={{
              width: '100%', padding: '15px', borderRadius: 12,
              border: 'none', cursor: (!examDate || studyDays.length === 0) ? 'not-allowed' : 'pointer',
              background: (!examDate || studyDays.length === 0)
                ? C.border
                : 'linear-gradient(135deg, #7C3AED 0%, #0D9488 100%)',
              color: '#fff', fontFamily: H, fontWeight: 900, fontSize: 15,
              letterSpacing: 0.5, transition: 'opacity .2s',
              opacity: (!examDate || studyDays.length === 0) ? 0.5 : 1,
            }}
          >
            ✨ Generate My Study Plan
          </button>
        </div>
      )}

      {/* ── STEP 2: Generating ── */}
      {step === 2 && (
        <Card>
          <Spinner />
          <div style={{ textAlign: 'center', padding: '0 20px 20px' }}>
            <p style={{ fontFamily: F, fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
              Analysing your weak areas, available time, and exam date to build a
              plan that gives you the best chance of passing. This takes about 10 seconds.
            </p>
          </div>
        </Card>
      )}

      {/* ── STEP 3: Show plan ── */}
      {step === 3 && plan && (
        <div>
          {/* Plan header */}
          <Card style={{ marginBottom: 20, background: 'linear-gradient(135deg, rgba(124,58,237,0.08) 0%, rgba(13,148,136,0.08) 100%)', border: `1.5px solid rgba(124,58,237,0.2)` }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: H, fontWeight: 900, fontSize: 16, color: T.primary, marginBottom: 6 }}>
                  Your {plan.totalWeeks}-Week NMCN Study Plan 🎓
                </div>
                <p style={{ fontFamily: F, fontSize: 13, color: T.muted, margin: '0 0 12px', lineHeight: 1.6 }}>
                  {plan.summary}
                </p>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {examDate && (
                    <span style={{ fontSize: 12, fontFamily: F, color: T.teal, fontWeight: 700 }}>
                      📅 Exam: {new Date(examDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  )}
                  {examDate && (
                    <span style={{ fontSize: 12, fontFamily: F, color: T.gold, fontWeight: 700 }}>
                      ⏰ {daysUntil(examDate)} days left
                    </span>
                  )}
                  <span style={{ fontSize: 12, fontFamily: F, color: T.muted }}>
                    Level: <strong style={{ color: T.primary, textTransform: 'capitalize' }}>{plan.studentLevel}</strong>
                  </span>
                </div>
              </div>
              <button
                onClick={resetPlan}
                style={{
                  flexShrink: 0, padding: '7px 14px', borderRadius: 8,
                  border: `1.5px solid ${C.border}`, background: C.primary,
                  color: T.muted, fontFamily: F, fontSize: 12, cursor: 'pointer',
                }}
              >
                🔄 Regenerate
              </button>
            </div>
          </Card>

          {/* Week cards */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontFamily: H, fontWeight: 900, fontSize: 14, color: T.primary, marginBottom: 14 }}>
              📚 Weekly Breakdown
            </h3>
            {plan.weeks?.map(week => (
              <WeekCard key={week.weekNumber} week={week} onDrill={handleDrill} />
            ))}
          </div>

          {/* General tips */}
          {plan.generalTips?.length > 0 && (
            <Card style={{ marginBottom: 20 }}>
              <h3 style={{ fontFamily: H, fontWeight: 900, fontSize: 14, color: T.primary, marginBottom: 14 }}>
                💡 General Exam Tips
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {plan.generalTips.map((tip, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      background: 'rgba(13,148,136,0.12)', border: `1px solid rgba(13,148,136,0.25)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: H, fontWeight: 900, fontSize: 11, color: T.teal,
                    }}>
                      {i + 1}
                    </div>
                    <p style={{ fontFamily: F, fontSize: 13, color: T.muted, margin: 0, lineHeight: 1.6 }}>
                      {tip}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Motivational message */}
          {plan.motivationalMessage && (
            <Card style={{ background: 'rgba(34,197,94,0.05)', border: `1.5px solid rgba(34,197,94,0.2)`, marginBottom: 20 }}>
              <p style={{ fontFamily: F, fontSize: 14, color: T.muted, margin: 0, lineHeight: 1.7, fontStyle: 'italic' }}>
                🌟 {plan.motivationalMessage}
              </p>
            </Card>
          )}

          {saved && (
            <p style={{ fontFamily: F, fontSize: 12, color: T.muted, textAlign: 'center' }}>
              ✅ Plan saved — it will be here next time you visit
            </p>
          )}
        </div>
      )}
    </div>
  );
}
