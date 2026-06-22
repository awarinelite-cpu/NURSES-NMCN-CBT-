// src/components/entrance/EntranceTipOfDay.jsx
// "Tip of the Day" for the Nursing School Entrance Exam dashboard.
// 50 static tips covering O-level subjects: English Language, Mathematics,
// Biology, Chemistry, Physics, and General Knowledge.
//
// Selection: dayOfYear % TIPS.length — same tip for all users on the same day.
// Dismiss:   localStorage key 'entrance_tip_dismissed' stores YYYY-MM-DD.
// Completely separate from the NMCN CBT TipOfDay ('tip_dismissed' key).

import { useState } from 'react';

const H = "'Arial Black', Arial, sans-serif";
const F = "'Times New Roman', Times, serif";

const TIPS = [
  // ── English Language (10 tips) ────────────────────────────────────────────
  { icon: '📝', cat: 'English Language', tip: 'Concord (subject-verb agreement): A collective noun takes a singular verb when acting as a unit ("The team is ready") but plural when members act individually ("The team are arguing"). Nigerian entrance exams test this constantly.' },
  { icon: '📝', cat: 'English Language', tip: 'Comprehension strategy: Read the questions BEFORE the passage. This primes your brain to notice relevant details as you read, saving time and improving accuracy on every comprehension question.' },
  { icon: '📝', cat: 'English Language', tip: 'Common confused words: "Affect" (verb – to influence) vs "Effect" (noun – the result). "Principle" (a rule/belief) vs "Principal" (head of a school, or main/primary). These appear in every entrance exam.' },
  { icon: '📝', cat: 'English Language', tip: 'Antonyms trick: For antonym questions, eliminate options that are synonyms or unrelated first. The correct antonym is always the most direct opposite — not merely a word that is "different" in some way.' },
  { icon: '📝', cat: 'English Language', tip: 'Tense consistency: If a passage begins in past tense, all subsequent verbs describing the same sequence of events must also be past tense. Switching tenses mid-sentence is a common multiple-choice trap.' },
  { icon: '📝', cat: 'English Language', tip: 'Idioms to know: "By hook or by crook" (by any means), "A bolt from the blue" (unexpected event), "Bite the bullet" (endure pain), "Burn the midnight oil" (work late). Idiom questions appear in every O-level English paper.' },
  { icon: '📝', cat: 'English Language', tip: 'Sentence structure: Every complete sentence needs a subject and a predicate (verb). A common trap presents a phrase as a sentence — if there is no main verb, it is a fragment, not a complete sentence.' },
  { icon: '📝', cat: 'English Language', tip: 'Register and style: Formal writing avoids contractions (use "do not" not "don\'t"), slang, and first-person opinion words like "I think." Entrance exam essays marked on appropriate register score higher.' },
  { icon: '📝', cat: 'English Language', tip: 'Punctuation — the apostrophe: Use apostrophes for possession ("the nurse\'s uniform") and contractions ("it\'s" = "it is"). "Its" without an apostrophe is the possessive pronoun. This distinction appears in error-correction questions.' },
  { icon: '📝', cat: 'English Language', tip: 'Oral English: Stress usually falls on content words (nouns, main verbs, adjectives) and NOT on function words (prepositions, articles, conjunctions). Syllable stress patterns are tested — e.g. PHOtograph vs phoTOgraphy.' },

  // ── Mathematics (10 tips) ─────────────────────────────────────────────────
  { icon: '🔢', cat: 'Mathematics', tip: 'BODMAS rule (order of operations): Brackets → Orders (powers/roots) → Division → Multiplication → Addition → Subtraction. Always work left to right within the same level of priority.' },
  { icon: '🔢', cat: 'Mathematics', tip: 'Percentage shortcuts: 10% of any number = move decimal one place left. 5% = half of 10%. 15% = 10% + 5%. 20% = double of 10%. These mental shortcuts save valuable exam time.' },
  { icon: '🔢', cat: 'Mathematics', tip: 'Quadratic equations: Try factorisation first (fastest method). If it does not factorise cleanly, use the formula: x = (−b ± √(b²−4ac)) / 2a. The discriminant b²−4ac tells you: positive = 2 real roots, zero = 1 root, negative = no real roots.' },
  { icon: '🔢', cat: 'Mathematics', tip: 'Fractions comparison tip: To compare fractions quickly, cross-multiply. For 3/4 vs 5/7 — compare 3×7=21 with 5×4=20. Since 21>20, then 3/4 > 5/7. No need to find a common denominator just for comparison.' },
  { icon: '🔢', cat: 'Mathematics', tip: 'Circle geometry rules: Angle in a semicircle = 90°. Angles in the same segment are equal. Angle at centre = twice the angle at the circumference subtended by the same arc. These three rules solve most circle theorem questions.' },
  { icon: '🔢', cat: 'Mathematics', tip: 'Simple vs compound interest: Simple Interest = PRT/100. Compound Interest = P(1 + R/100)ⁿ − P. The difference between them is interest being earned on interest — the earlier you start, the larger the gap.' },
  { icon: '🔢', cat: 'Mathematics', tip: 'Sets and Venn diagrams: For two overlapping sets A and B: n(A∪B) = n(A) + n(B) − n(A∩B). For three sets, add the three individual sets, subtract the three pairwise intersections, then add back the triple intersection.' },
  { icon: '🔢', cat: 'Mathematics', tip: 'Indices (laws of exponents): aᵐ × aⁿ = aᵐ⁺ⁿ · aᵐ ÷ aⁿ = aᵐ⁻ⁿ · (aᵐ)ⁿ = aᵐⁿ · a⁰ = 1 · a⁻ⁿ = 1/aⁿ. Memorise all six laws — index questions appear in every WAEC/NECO Mathematics paper.' },
  { icon: '🔢', cat: 'Mathematics', tip: 'Probability basics: P(event) = Number of favourable outcomes ÷ Total possible outcomes. P(A or B) = P(A) + P(B) − P(A and B). P(A and B) for independent events = P(A) × P(B). Values always fall between 0 and 1.' },
  { icon: '🔢', cat: 'Mathematics', tip: 'Number bases: To convert from base n to base 10, multiply each digit by its positional value (nᵖ). To convert from base 10 to base n, repeatedly divide by n and read remainders upward. Binary (base 2) and octal (base 8) are most tested.' },

  // ── Biology (10 tips) ─────────────────────────────────────────────────────
  { icon: '🧬', cat: 'Biology', tip: 'Cell organelles — key ones for entrance exams: Mitochondria = ATP production (aerobic respiration). Ribosome = protein synthesis. Chloroplast = photosynthesis (plants only). Nucleus = genetic control. Cell membrane = selective permeability.' },
  { icon: '🧬', cat: 'Biology', tip: 'Photosynthesis equation: 6CO₂ + 6H₂O + light energy → C₆H₁₂O₆ + 6O₂. Light reaction in thylakoids produces ATP and NADPH. Dark reaction (Calvin cycle) in stroma fixes CO₂ into glucose.' },
  { icon: '🧬', cat: 'Biology', tip: 'Genetics ratios: Monohybrid cross (Aa × Aa) = 3:1 phenotype ratio. Dihybrid cross (AaBb × AaBb) = 9:3:3:1. Blood groups use co-dominance — IA and IB are both dominant over i (group O). Know all four ABO genotypes.' },
  { icon: '🧬', cat: 'Biology', tip: 'Digestive enzymes: Salivary amylase (mouth) → starch. Pepsin (stomach, acidic pH) → proteins. Lipase (small intestine) → fats. Trypsin (small intestine, alkaline pH) → proteins. Know the site, substrate, and pH for each enzyme.' },
  { icon: '🧬', cat: 'Biology', tip: 'Osmosis vs diffusion: Diffusion = movement of molecules from high to low concentration (no membrane needed). Osmosis = movement of WATER only across a semi-permeable membrane from low solute to high solute concentration.' },
  { icon: '🧬', cat: 'Biology', tip: 'Classification mnemonic: "King Philip Came Over For Good Spaghetti" — Kingdom, Phylum, Class, Order, Family, Genus, Species. Humans: Kingdom Animalia, Phylum Chordata, Class Mammalia, Order Primates, Genus Homo, Species sapiens.' },
  { icon: '🧬', cat: 'Biology', tip: 'Ecosystem terms: Producer = makes own food (plants, algae). Primary consumer = eats producers (herbivores). Secondary consumer = eats primary consumers. Decomposer = breaks down dead matter (bacteria, fungi). Energy flows one way; nutrients cycle.' },
  { icon: '🧬', cat: 'Biology', tip: 'Mitosis vs meiosis: Mitosis = 1 division, 2 identical diploid daughter cells (growth/repair). Meiosis = 2 divisions, 4 haploid cells (gamete production). Only meiosis causes genetic variation through crossing-over and independent assortment.' },
  { icon: '🧬', cat: 'Biology', tip: 'Transport in plants: Water and minerals travel upward through xylem (dead cells, cohesion-tension). Sugars travel up and down through phloem (living cells, pressure flow). Remember: Xylem = water, Phloem = food (sugar).' },
  { icon: '🧬', cat: 'Biology', tip: 'Hormones in humans: Insulin (pancreas) lowers blood glucose. Glucagon (pancreas) raises it. ADH (pituitary) retains water in kidneys. Adrenaline (adrenal medulla) = fight-or-flight. Oestrogen and progesterone control the menstrual cycle.' },

  // ── Chemistry (10 tips) ───────────────────────────────────────────────────
  { icon: '⚗️', cat: 'Chemistry', tip: 'Periodic table trends across a period (left to right): Atomic number increases. Atomic radius decreases (more protons pull electrons inward). Ionisation energy increases. Electronegativity increases. Metallic character decreases.' },
  { icon: '⚗️', cat: 'Chemistry', tip: 'Valency shortcut: Group I → 1. Group II → 2. Group III → 3. Group IV → 4. Group V → 3. Group VI → 2. Group VII → 1. Group 0 → 0. Use valency to write chemical formulae quickly — swap and simplify.' },
  { icon: '⚗️', cat: 'Chemistry', tip: 'Acid-base indicators: Litmus — red in acid, blue in alkali. Phenolphthalein — colourless in acid, pink in alkali. Methyl orange — red in acid, yellow in alkali. Universal indicator shows a pH colour range from red (pH 1) to violet (pH 14).' },
  { icon: '⚗️', cat: 'Chemistry', tip: 'Electrolysis: At the cathode (−ve): cations are REDUCED (gain electrons). At the anode (+ve): anions are OXIDISED (lose electrons). Mnemonic: OILRIG — Oxidation Is Loss, Reduction Is Gain of electrons.' },
  { icon: '⚗️', cat: 'Chemistry', tip: 'Mole calculations — the three forms: Moles = Mass ÷ Molar mass. Moles = Volume (dm³) ÷ 22.4 (gas at STP). Moles = Concentration (mol/dm³) × Volume (dm³). Every mole calculation uses one of these three — identify which and substitute.' },
  { icon: '⚗️', cat: 'Chemistry', tip: 'Organic naming: Meth(1), Eth(2), Prop(3), But(4), Pent(5), Hex(6) carbons. Suffixes: -ane (single bond), -ene (double bond), -yne (triple bond), -anol (alcohol), -anoic acid (carboxylic acid). Combine prefix + suffix to name any compound.' },
  { icon: '⚗️', cat: 'Chemistry', tip: 'Solubility rules: ALL nitrates soluble. ALL sodium/potassium/ammonium salts soluble. Most chlorides soluble (except AgCl, PbCl₂). Most sulphates soluble (except BaSO₄, PbSO₄). Most carbonates and hydroxides insoluble (except Group I). Know these for precipitation questions.' },
  { icon: '⚗️', cat: 'Chemistry', tip: 'Types of bonding: Ionic = metal + non-metal, forms giant lattice, high melting point. Covalent = non-metal + non-metal, shares electrons, can be simple molecular (low m.p.) or giant covalent (high m.p.). Metallic = metal atoms share delocalised electrons.' },
  { icon: '⚗️', cat: 'Chemistry', tip: 'Contact process for H₂SO₄: S + O₂ → SO₂ → SO₃ (with V₂O₅ catalyst at 450°C) → H₂SO₄. Haber process for NH₃: N₂ + 3H₂ ⇌ 2NH₃ (iron catalyst, 450°C, 200 atm). Know both industrial processes and their conditions.' },
  { icon: '⚗️', cat: 'Chemistry', tip: 'Reactivity series (high to low): K, Na, Ca, Mg, Al, Zn, Fe, Pb, Cu, Ag, Au. More reactive metals displace less reactive ones from solutions. Metals above hydrogen react with dilute acids; those below do not.' },

  // ── Physics (10 tips) ─────────────────────────────────────────────────────
  { icon: '⚡', cat: 'Physics', tip: 'Newton\'s three laws: (1) Object stays at rest or constant velocity unless a net force acts. (2) F = ma. (3) Every action has an equal and opposite reaction. These three laws underpin ALL mechanics questions in O-level Physics.' },
  { icon: '⚡', cat: 'Physics', tip: 'Ohm\'s law and circuits: V = IR. Series: total R = R₁ + R₂ + R₃ (resistances add, current same throughout). Parallel: 1/Rₜ = 1/R₁ + 1/R₂ (reciprocals add, voltage same across each branch).' },
  { icon: '⚡', cat: 'Physics', tip: 'Equations of motion (uniform acceleration): v = u + at · s = ut + ½at² · v² = u² + 2as. Identify the missing variable and pick the equation that doesn\'t contain it. Always list u, v, a, s, t before choosing.' },
  { icon: '⚡', cat: 'Physics', tip: 'Wave properties: Speed = Frequency × Wavelength (v = fλ). Transverse waves (light, water) — oscillation perpendicular to direction. Longitudinal waves (sound) — oscillation parallel. Sound needs a medium; light does not.' },
  { icon: '⚡', cat: 'Physics', tip: 'Pressure formulas: P = F/A (solids). P = ρgh (liquids — density × g × depth). Standard atmospheric pressure ≈ 101,325 Pa ≈ 760 mmHg ≈ 76 cmHg. Pascal\'s principle: pressure transmitted equally in all directions in a fluid.' },
  { icon: '⚡', cat: 'Physics', tip: 'Electromagnetic spectrum (lowest to highest frequency): Radio → Microwave → Infrared → Visible → Ultraviolet → X-ray → Gamma. All travel at 3×10⁸ m/s in a vacuum. Higher frequency = higher energy = shorter wavelength.' },
  { icon: '⚡', cat: 'Physics', tip: 'Work, energy, power: Work = Force × Distance (W = Fd, unit: Joule). KE = ½mv². PE = mgh. Power = Work ÷ Time (unit: Watt). Efficiency = (Useful output ÷ Total input) × 100%. Energy is always conserved — it converts, never disappears.' },
  { icon: '⚡', cat: 'Physics', tip: 'Heat transfer methods: Conduction = through solids (vibrating particles pass energy along). Convection = through fluids (hot fluid rises, cool fluid sinks, forming convection currents). Radiation = through vacuum (infrared electromagnetic waves, no medium needed).' },
  { icon: '⚡', cat: 'Physics', tip: 'Lenses and mirrors: Convex lens / concave mirror = converging (brings rays together, can form real images). Concave lens / convex mirror = diverging (spreads rays apart, always forms virtual images). Law of reflection: angle of incidence = angle of reflection.' },
  { icon: '⚡', cat: 'Physics', tip: 'Atomic structure: Protons and neutrons in the nucleus; electrons orbit in shells. Atomic number = number of protons. Mass number = protons + neutrons. Isotopes = same proton number, different neutron number. Radioactive decay: alpha (α), beta (β), gamma (γ) emissions.' },
];

function todayTipIndex() {
  const d = new Date();
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  return dayOfYear % TIPS.length;
}

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

  const catColor = {
    'English Language': '#2563EB',
    'Mathematics':      '#7C3AED',
    'Biology':          '#16A34A',
    'Chemistry':        '#D97706',
    'Physics':          '#0891B2',
  }[tip.cat] || '#DC2626';

  return (
    <div style={{
      background: `linear-gradient(135deg, ${catColor}10 0%, ${catColor}06 100%)`,
      border: `1.5px solid ${catColor}30`,
      borderRadius: 14, marginBottom: 20, overflow: 'hidden',
    }}>
      {/* Header row */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer' }}
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
        <div style={{ padding: '0 16px 14px', borderTop: `1px solid ${catColor}18` }}>
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
