// src/components/shared/TipOfDay.jsx
// "Tip of the Day" — a rotating nursing exam tip or mnemonic shown on the
// dashboard. Changes daily (keyed to YYYY-MM-DD). Gives students a reason
// to open the app even on rest days.

import { useState } from 'react';

const H = "'Arial Black', Arial, sans-serif";
const F = "'Times New Roman', Times, serif";

const TIPS = [
  { icon: '💊', cat: 'Pharmacology', tip: 'Digoxin toxicity triad: Bradycardia + Yellow/green visual halos + GI upset (nausea, vomiting). Always check apical pulse for 1 full minute before giving.' },
  { icon: '❤️', cat: 'Cardiovascular', tip: 'MONA for MI: Morphine → Oxygen → Nitrates → Aspirin. Administer in that order to reduce cardiac workload and pain.' },
  { icon: '🧠', cat: 'Neuro', tip: 'FAST for stroke: Face drooping, Arm weakness, Speech difficulty, Time to call emergency. Document exact time of symptom onset — it determines eligibility for tPA.' },
  { icon: '🩸', cat: 'Haematology', tip: 'Normal haemoglobin: Males 13.5–17.5 g/dL, Females 12–15.5 g/dL. Values below 8 g/dL usually require transfusion.' },
  { icon: '💉', cat: 'IV Therapy', tip: 'Infiltration vs Extravasation: Infiltration = non-vesicant fluid leaks → cool, oedematous site. Extravasation = vesicant leaks → causes tissue necrosis. STOP infusion immediately for both.' },
  { icon: '🫁', cat: 'Respiratory', tip: 'COPD patients are "hypoxic drivers" — their respiratory drive depends on LOW O₂, not high CO₂. Keep O₂ saturation at 88–92%, not 98–100%.' },
  { icon: '🏥', cat: 'Infection Control', tip: 'MRSA and VRE require Contact Precautions (gloves + gown). TB requires Airborne Precautions (N95 mask, negative pressure room). Meningitis = Droplet Precautions.' },
  { icon: '🤰', cat: 'Obstetrics', tip: 'PIH priority: Magnesium sulfate is both the treatment AND toxicity risk. Antidote = Calcium gluconate. Monitor reflexes, urine output (≥25 mL/hr), and respiratory rate.' },
  { icon: '👶', cat: 'Paediatrics', tip: 'Mnemonic for normal paediatric vital signs: "Younger = Faster". Newborn HR 120–160, Toddler 90–140, School-age 70–110. Respiratory rates follow same pattern.' },
  { icon: '🧪', cat: 'Lab Values', tip: 'Normal potassium: 3.5–5.0 mEq/L. Hypokalaemia causes muscle weakness + U wave on ECG. Hyperkalaemia causes peaked T waves + cardiac arrest risk. Both affect digoxin toxicity.' },
  { icon: '💊', cat: 'Pharmacology', tip: 'Warfarin antidote = Vitamin K (slow) or Fresh Frozen Plasma (fast). Heparin antidote = Protamine sulfate. Know which is which — exam loves this distinction.' },
  { icon: '🩺', cat: 'Assessment', tip: 'Glasgow Coma Scale (GCS): Eyes (1–4) + Verbal (1–5) + Motor (1–6) = max 15. Score ≤8 = severe brain injury, consider intubation. AVPU is the simpler bedside version.' },
  { icon: '🫀', cat: 'Cardiovascular', tip: 'Left-sided heart failure → pulmonary oedema (fluid backs into lungs) → crackles, dyspnoea, pink frothy sputum. Right-sided → peripheral oedema, JVD, hepatomegaly.' },
  { icon: '🔬', cat: 'Microbiology', tip: 'Gram +ve cocci in clusters = Staphylococcus. Gram +ve cocci in chains = Streptococcus. Gram –ve rods = Enterobacteriaceae (E. coli, Klebsiella, Salmonella). This distinction drives antibiotic choice.' },
  { icon: '🧠', cat: 'Mental Health', tip: 'Maslow first, always. A patient threatening suicide is physiological + safety priority. Remove means, initiate 1:1 observation, document, notify physician — in that sequence.' },
  { icon: '💉', cat: 'Insulin', tip: 'Insulin onset order (fastest to slowest): Lispro/Aspart (rapid) → Regular (short) → NPH (intermediate) → Glargine/Detemir (long). Rapid-acting = give with meals. Long-acting = bedtime.' },
  { icon: '🩹', cat: 'Wound Care', tip: 'Wound healing stages: Haemostasis (0–3 days) → Inflammation (1–5 days) → Proliferation (5–21 days) → Remodelling (21 days–2 years). Infection prolongs inflammation and delays healing.' },
  { icon: '🫁', cat: 'ABG Interpretation', tip: 'ABG mnemonic ROME: Respiratory Opposite (pH↑/CO₂↓ or pH↓/CO₂↑), Metabolic Equal (pH↑/HCO₃↑ or pH↓/HCO₃↓). Normal: pH 7.35–7.45, PaCO₂ 35–45, HCO₃ 22–26.' },
  { icon: '🏥', cat: 'Prioritisation', tip: 'NMCN exam priority rule: Airway → Breathing → Circulation → Safety (ABCs). Among same-level problems, actual > potential, acute > chronic, life-threatening > non-life-threatening.' },
  { icon: '💧', cat: 'Fluids', tip: 'Isotonic fluids (0.9% NaCl, Lactated Ringer\'s) stay in intravascular space — use for dehydration. Hypotonic (0.45% NaCl) shifts into cells. Hypertonic (3% NaCl) pulls fluid from cells.' },
  { icon: '🤱', cat: 'Obstetrics', tip: 'Fetal heart rate decelerations: Early = head compression (benign). Late = uteroplacental insufficiency (ominous — reposition, O₂, stop oxytocin). Variable = cord compression (reposition).' },
  { icon: '🔴', cat: 'Emergency', tip: 'Anaphylaxis priority: Epinephrine 1:1000 IM (lateral thigh) FIRST — before antihistamines, before steroids. Then airway, then call for help. Every minute without epi increases mortality.' },
  { icon: '🧬', cat: 'Genetics', tip: 'Autosomal dominant diseases (Huntington\'s, Marfan\'s) — one affected parent = 50% risk per child. Autosomal recessive (sickle cell, cystic fibrosis) — both parents carry gene = 25% affected risk.' },
  { icon: '💊', cat: 'Antibiotics', tip: 'Penicillin allergy cross-reactivity with cephalosporins is only ~1–2% (not 10% as commonly taught). However, always ask — if history of anaphylaxis to penicillin, avoid all beta-lactams.' },
  { icon: '🩺', cat: 'Ethics', tip: 'NMCN code of ethics pillars: Autonomy (patient decides), Beneficence (do good), Non-maleficence (do no harm), Justice (fair treatment). Autonomy overrides beneficence in competent adults.' },
  { icon: '🧪', cat: 'Urinalysis', tip: 'Normal urine: pale-yellow, pH 4.5–8, specific gravity 1.010–1.025, no glucose/protein/ketones. Cloudy + nitrites + leukocyte esterase = UTI until proven otherwise.' },
  { icon: '🫀', cat: 'ECG', tip: 'ECG paper: small box = 0.04 sec, large box = 0.2 sec. Normal PR interval = 3–5 small boxes (0.12–0.20 sec). Prolonged PR = 1st degree AV block. Normal QRS < 0.12 sec (3 small boxes).' },
  { icon: '👁️', cat: 'Ophthalmology', tip: 'Glaucoma: increased intraocular pressure damages optic nerve. Closed-angle glaucoma is an emergency — sudden severe eye pain + halos + N&V. Open-angle is chronic and painless.' },
  { icon: '🦴', cat: 'Orthopaedics', tip: '5 Ps of compartment syndrome: Pain (especially with passive stretch), Pressure, Paralysis, Paraesthesia, Pallor/Pulselessness. Pain out of proportion to injury is the EARLIEST sign.' },
  { icon: '🧠', cat: 'Neuro', tip: 'Cushing\'s triad = late sign of raised ICP: Hypertension (widened pulse pressure) + Bradycardia + Irregular respirations. It means brain herniation is imminent — act immediately.' },
];

function todayTipIndex() {
  const d = new Date();
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  return dayOfYear % TIPS.length;
}

export default function TipOfDay() {
  const [dismissed, setDismissed] = useState(() => {
    const today = new Date().toISOString().slice(0, 10);
    return localStorage.getItem('tip_dismissed') === today;
  });
  const [expanded, setExpanded] = useState(true);

  if (dismissed) return null;

  const tip = TIPS[todayTipIndex()];

  const handleDismiss = () => {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem('tip_dismissed', today);
    setDismissed(true);
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(13,148,136,0.08) 0%, rgba(30,58,138,0.08) 100%)',
      border: '1.5px solid rgba(13,148,136,0.2)',
      borderRadius: 14, marginBottom: 20, overflow: 'hidden',
    }}>
      {/* Header row */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 20 }}>{tip.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: H, fontWeight: 900, fontSize: 13, color: 'var(--teal)' }}>
            💡 Tip of the Day
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: F }}>
            {tip.cat} · Changes daily
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
            background: 'rgba(13,148,136,0.12)', color: 'var(--teal)',
          }}>
            {tip.cat}
          </span>
          <span style={{ fontSize: 14, color: 'var(--text-muted)', transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
            ▾
          </span>
          <button
            onClick={e => { e.stopPropagation(); handleDismiss(); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: 14, padding: '2px 4px',
              lineHeight: 1, borderRadius: 4,
            }}
            title="Dismiss for today"
          >✕</button>
        </div>
      </div>

      {/* Tip body */}
      {expanded && (
        <div style={{
          padding: '0 16px 14px',
          borderTop: '1px solid rgba(13,148,136,0.12)',
        }}>
          <p style={{
            fontFamily: F, fontSize: 14, color: 'var(--text-primary)',
            lineHeight: 1.75, margin: '12px 0 0',
          }}>
            {tip.tip}
          </p>
        </div>
      )}
    </div>
  );
}
