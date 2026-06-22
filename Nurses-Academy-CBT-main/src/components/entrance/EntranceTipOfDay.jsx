// src/components/entrance/EntranceTipOfDay.jsx
// "Tip of the Day" for the Nursing School Entrance Exam dashboard.
// These are O-level / JAMB-style tips covering the subjects tested in Nigerian
// nursing school entrance exams: English Language, Mathematics, Biology,
// Chemistry, Physics, and General Knowledge / Current Affairs.
//
// Completely separate from the NMCN CBT TipOfDay (which covers professional
// nursing topics). Uses its own localStorage key so the two never interfere.

import { useState } from 'react';

const H = "'Arial Black', Arial, sans-serif";
const F = "'Times New Roman', Times, serif";

const TIPS = [
  // ── English Language ─────────────────────────────────────────────────────
  { icon: '📝', cat: 'English Language', tip: 'Concord (subject-verb agreement): A collective noun takes a singular verb when acting as a unit ("The team is ready") but plural when members act individually ("The team are arguing"). Nigerian entrance exams test this constantly.' },
  { icon: '📝', cat: 'English Language', tip: 'Comprehension strategy: Read the questions BEFORE the passage. This primes your brain to notice relevant details as you read, saving time and improving accuracy.' },
  { icon: '📝', cat: 'English Language', tip: 'Common confused words: "Affect" (verb – to influence) vs "Effect" (noun – the result). "Principle" (a rule/belief) vs "Principal" (head of a school, or main/primary). These appear in every entrance exam.' },
  { icon: '📝', cat: 'English Language', tip: 'Antonyms trick: For antonym questions, eliminate options that are synonyms or unrelated first. The correct antonym is usually the most direct opposite, not a word that is merely "different".' },
  { icon: '📝', cat: 'English Language', tip: 'Tense consistency: If a passage or sentence begins in past tense, all subsequent verbs describing the same sequence of events must also be past tense. Switching tenses mid-sentence is a common trap.' },
  { icon: '📝', cat: 'English Language', tip: 'Idioms to know: "By hook or by crook" (by any means possible), "A bolt from the blue" (unexpected event), "Bite the bullet" (endure pain), "Burn the midnight oil" (study/work late). These appear in comprehension and idiom questions.' },
  { icon: '📝', cat: 'English Language', tip: 'Sentence structure: A sentence must have a subject and a predicate (verb). A common exam trap presents a phrase as a sentence — if there is no main verb, it is a fragment, not a complete sentence.' },

  // ── Mathematics ──────────────────────────────────────────────────────────
  { icon: '🔢', cat: 'Mathematics', tip: 'BODMAS rule (order of operations): Brackets → Orders (powers/roots) → Division → Multiplication → Addition → Subtraction. Always work strictly left to right within the same level of priority.' },
  { icon: '🔢', cat: 'Mathematics', tip: 'Percentage shortcuts: To find 10% of any number, move the decimal one place left. 5% = half of 10%. 15% = 10% + 5%. 20% = double of 10%. Mental arithmetic using these saves time on the exam.' },
  { icon: '🔢', cat: 'Mathematics', tip: 'Quadratic equations: Always try factorisation first (fastest). If it does not factorise cleanly, use the quadratic formula: x = (−b ± √(b²−4ac)) / 2a. The discriminant (b²−4ac) tells you the nature of roots: positive = 2 real roots, zero = 1 root, negative = no real roots.' },
  { icon: '🔢', cat: 'Mathematics', tip: 'Fractions tip: To compare fractions quickly, cross-multiply. For 3/4 vs 5/7 — compare 3×7=21 with 5×4=20. Since 21>20, then 3/4 > 5/7. No need to find common denominators for comparison.' },
  { icon: '🔢', cat: 'Mathematics', tip: 'Circle geometry: Angle in a semicircle = 90°. Angles in the same segment are equal. Angle at centre = twice angle at circumference subtended by same arc. These three rules answer most circle theorem questions.' },
  { icon: '🔢', cat: 'Mathematics', tip: 'Simple vs compound interest: Simple Interest = PRT/100. Compound Interest = P(1 + R/100)ⁿ − P. The difference between them is the interest-on-interest effect, which entrance exams love to test.' },
  { icon: '🔢', cat: 'Mathematics', tip: 'Sets and Venn diagrams: For two overlapping sets A and B: n(A∪B) = n(A) + n(B) − n(A∩B). For three sets, add the three individual sets, subtract the three pairwise intersections, then add back the triple intersection.' },

  // ── Biology ──────────────────────────────────────────────────────────────
  { icon: '🧬', cat: 'Biology', tip: 'Cell organelles — the key ones for entrance exams: Mitochondria = powerhouse (ATP via aerobic respiration). Ribosome = protein synthesis. Chloroplast = photosynthesis (plant cells only). Nucleus = genetic information. Cell membrane = selective permeability.' },
  { icon: '🧬', cat: 'Biology', tip: 'Photosynthesis equation: 6CO₂ + 6H₂O + light energy → C₆H₁₂O₆ + 6O₂. Light reaction occurs in thylakoids (produces ATP and NADPH). Dark reaction (Calvin cycle) occurs in stroma (fixes CO₂ into glucose).' },
  { icon: '🧬', cat: 'Biology', tip: 'Genetics ratios: A monohybrid cross of two heterozygotes (Aa × Aa) gives the 3:1 phenotype ratio. A dihybrid cross (AaBb × AaBb) gives the 9:3:3:1 ratio. Blood groups follow co-dominance — IA and IB are both dominant over i.' },
  { icon: '🧬', cat: 'Biology', tip: 'Digestive enzymes: Salivary amylase (mouth) → breaks starch. Pepsin (stomach) → breaks proteins. Lipase (small intestine) → breaks fats. Trypsin (small intestine) → breaks proteins. Remember the site and substrate for each.' },
  { icon: '🧬', cat: 'Biology', tip: 'Osmosis vs diffusion: Diffusion = movement of molecules from high to low concentration (no membrane needed). Osmosis = movement of WATER across a semi-permeable membrane from low solute to high solute concentration. Osmosis is a specific type of diffusion.' },
  { icon: '🧬', cat: 'Biology', tip: 'Classification of organisms (mnemonic): "King Philip Came Over For Good Spaghetti" — Kingdom, Phylum, Class, Order, Family, Genus, Species. Humans = Kingdom Animalia, Phylum Chordata, Class Mammalia, Order Primates, Family Hominidae, Genus Homo, Species sapiens.' },
  { icon: '🧬', cat: 'Biology', tip: 'Ecosystem terms: Producer = makes own food via photosynthesis (plants, algae). Primary consumer = eats producers (herbivores). Secondary consumer = eats primary consumers. Decomposer = breaks down dead matter (bacteria, fungi). Energy flows in one direction; nutrients are cycled.' },

  // ── Chemistry ────────────────────────────────────────────────────────────
  { icon: '⚗️', cat: 'Chemistry', tip: 'Periodic table trends (going left to right across a period): Atomic number increases. Atomic radius decreases (more protons pull electrons closer). Ionisation energy increases. Electronegativity increases. Metallic character decreases.' },
  { icon: '⚗️', cat: 'Chemistry', tip: 'Valency shortcut: Group I → valency 1. Group II → valency 2. Group III → valency 3. Group IV → valency 4. Group V → valency 3. Group VI → valency 2. Group VII → valency 1. Group 0 → valency 0 (noble gases). Use this to write chemical formulae quickly.' },
  { icon: '⚗️', cat: 'Chemistry', tip: 'Acid-base indicators: Litmus — red in acid, blue in alkali. Phenolphthalein — colourless in acid, pink in alkali. Methyl orange — red in acid, yellow in alkali. Universal indicator gives a full pH colour range from red (pH 1) to violet (pH 14).' },
  { icon: '⚗️', cat: 'Chemistry', tip: 'Electrolysis rules: At the cathode (−ve electrode): cations (positive ions) are reduced (gain electrons). At the anode (+ve electrode): anions (negative ions) are oxidised (lose electrons). Mnemonic: OILRIG — Oxidation Is Loss, Reduction Is Gain (of electrons).' },
  { icon: '⚗️', cat: 'Chemistry', tip: 'Mole calculations: Moles = Mass ÷ Molar mass. Moles = Volume (dm³) ÷ 22.4 (at STP for gases). Moles = Concentration (mol/dm³) × Volume (dm³). Memorise these three forms — mole questions appear in every entrance exam.' },
  { icon: '⚗️', cat: 'Chemistry', tip: 'Organic chemistry naming: Meth- (1 carbon), Eth- (2), Prop- (3), But- (4), Pent- (5), Hex- (6). Suffix: -ane (alkane, single bond), -ene (alkene, double bond), -yne (alkyne, triple bond), -anol (alcohol), -anoic acid (carboxylic acid).' },
  { icon: '⚗️', cat: 'Chemistry', tip: 'Solubility rules: All nitrates are soluble. All sodium, potassium, and ammonium salts are soluble. Most chlorides are soluble (except AgCl, PbCl₂). Most sulphates are soluble (except BaSO₄, PbSO₄, CaSO₄). Most carbonates and hydroxides are insoluble (except Group I and ammonium).' },

  // ── Physics ──────────────────────────────────────────────────────────────
  { icon: '⚡', cat: 'Physics', tip: 'Newton\'s three laws: (1) An object stays at rest or moves at constant velocity unless acted upon by a net external force. (2) F = ma (force = mass × acceleration). (3) Every action has an equal and opposite reaction. These are the backbone of mechanics questions.' },
  { icon: '⚡', cat: 'Physics', tip: 'Ohm\'s law and circuits: V = IR (Voltage = Current × Resistance). In series circuits: total resistance = R₁ + R₂ + R₃ (resistances add). In parallel circuits: 1/Rₜ = 1/R₁ + 1/R₂ + 1/R₃ (reciprocals add). Current is the same in series; voltage divides.' },
  { icon: '⚡', cat: 'Physics', tip: 'Equations of motion (for uniform acceleration): v = u + at. s = ut + ½at². v² = u² + 2as. Where u = initial velocity, v = final velocity, a = acceleration, s = displacement, t = time. Learn which equation to use based on which variable is missing.' },
  { icon: '⚡', cat: 'Physics', tip: 'Wave properties: Speed = Frequency × Wavelength (v = fλ). Transverse waves (e.g. light, water waves) — oscillation perpendicular to wave direction. Longitudinal waves (e.g. sound) — oscillation parallel to wave direction. Sound cannot travel in a vacuum; light can.' },
  { icon: '⚡', cat: 'Physics', tip: 'Pressure formulas: Pressure = Force ÷ Area (P = F/A) for solids. Pressure in a liquid = ρgh (density × gravitational field strength × depth). Atmospheric pressure at sea level ≈ 101,325 Pa ≈ 760 mmHg. Hydraulic machines use Pascal\'s principle: pressure is transmitted equally in all directions.' },
  { icon: '⚡', cat: 'Physics', tip: 'Electromagnetic spectrum (lowest to highest frequency): Radio waves → Microwaves → Infrared → Visible light → Ultraviolet → X-rays → Gamma rays. All travel at the speed of light (3 × 10⁸ m/s) in a vacuum. Higher frequency = higher energy = shorter wavelength.' },
  { icon: '⚡', cat: 'Physics', tip: 'Work, energy, power: Work = Force × Distance (W = Fd). Kinetic Energy = ½mv². Potential Energy = mgh. Power = Work ÷ Time (P = W/t). Efficiency = (Useful energy output ÷ Total energy input) × 100%. Energy is always conserved — it converts, never disappears.' },

  // ── General Knowledge / Current Affairs ──────────────────────────────────
  { icon: '🌍', cat: 'General Knowledge', tip: 'Nigeria\'s government structure: Three tiers — Federal, State, Local Government. Three arms — Executive (President/Governor), Legislature (NASS/State House of Assembly), Judiciary (Courts). Nigeria operates a presidential system (unlike the UK\'s parliamentary system).' },
  { icon: '🌍', cat: 'General Knowledge', tip: 'Nursing regulatory body: The Nursing and Midwifery Council of Nigeria (NMCN) regulates nursing and midwifery practice in Nigeria. It was established by Decree No. 89 of 1979. Knowing NMCN\'s role is essential for any nursing school application.' },
  { icon: '🌍', cat: 'General Knowledge', tip: 'HIV/AIDS facts for entrance exams: HIV attacks CD4+ T-cells (helper T-lymphocytes), weakening the immune system. AIDS is the advanced stage. Transmission: unprotected sex, contaminated needles, mother-to-child (pregnancy/birth/breastfeeding). Not transmitted by casual contact.' },
  { icon: '🌍', cat: 'General Knowledge', tip: 'First aid priorities — the ABCs: Airway (ensure it is open), Breathing (check and support), Circulation (control bleeding, check pulse). In any emergency, secure the airway first before anything else. This is the universal first aid foundation.' },
  { icon: '🌍', cat: 'General Knowledge', tip: 'Nigeria geography essentials: Capital = Abuja (FCT). Largest city by population = Lagos. Highest mountain = Chappal Waddi (Taraba State). Longest river = River Niger (flows through Nigeria into the Niger Delta). These facts appear frequently in GK sections.' },
  { icon: '🌍', cat: 'General Knowledge', tip: 'Common logical reasoning traps: Correlation ≠ Causation. "All A are B" does NOT mean "All B are A". A valid argument can have a false conclusion if the premises are false. Practice spotting these in verbal reasoning questions.' },
];

function todayTipIndex() {
  const d = new Date();
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  return dayOfYear % TIPS.length;
}

// Distinct localStorage key from the NMCN TipOfDay to prevent cross-contamination
const DISMISS_KEY = 'entrance_tip_dismissed';

export default function EntranceTipOfDay() {
  const [dismissed, setDismissed] = useState(() => {
    const today = new Date().toISOString().slice(0, 10);
    return localStorage.getItem(DISMISS_KEY) === today;
  });
  const [expanded, setExpanded] = useState(true);

  if (dismissed) return null;

  const tip = TIPS[todayTipIndex()];

  const handleDismiss = () => {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(DISMISS_KEY, today);
    setDismissed(true);
  };

  // Colour accent per subject
  const catColor = {
    'English Language': '#2563EB',
    'Mathematics':      '#7C3AED',
    'Biology':          '#16A34A',
    'Chemistry':        '#D97706',
    'Physics':          '#0891B2',
    'General Knowledge':'#DC2626',
  }[tip.cat] || '#0D9488';

  return (
    <div style={{
      background: `linear-gradient(135deg, ${catColor}10 0%, ${catColor}06 100%)`,
      border: `1.5px solid ${catColor}30`,
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
          <div style={{ fontFamily: H, fontWeight: 900, fontSize: 13, color: catColor }}>
            💡 Entrance Exam Tip of the Day
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: F }}>
            {tip.cat} · Changes daily
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
            background: `${catColor}18`, color: catColor,
          }}>
            {tip.cat}
          </span>
          <span style={{
            fontSize: 14, color: 'var(--text-muted)',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 0.2s',
          }}>▾</span>
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
          borderTop: `1px solid ${catColor}18`,
        }}>
          <p style={{
            fontFamily: F, fontSize: 14, color: 'var(--text-primary)',
            lineHeight: 1.75, margin: '12px 0 0', fontWeight: 700,
          }}>
            {tip.tip}
          </p>
        </div>
      )}
    </div>
  );
}
