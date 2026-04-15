// src/data/categories.js
// All nursing specialties and exam types for NMCN CBT platform

export const NURSING_CATEGORIES = [
  {
    id: 'general_nursing',
    label: 'General Nursing (RN)',
    shortLabel: 'General Nursing',
    icon: '🏥',
    color: '#0D9488',
    description: 'NMCN Basic Nursing Registration Examination',
    examType: 'basic',
  },
  {
    id: 'midwifery',
    label: 'Midwifery (Post Basic)',
    shortLabel: 'Midwifery',
    icon: '👶',
    color: '#7C3AED',
    description: 'Post Basic Midwifery Board Examination',
    examType: 'post_basic',
  },
  {
    id: 'mental_health',
    label: 'Mental Health / Psychiatric Nursing',
    shortLabel: 'Psychiatric Nursing',
    icon: '🧠',
    color: '#2563EB',
    description: 'Post Basic Psychiatric Nursing Board Examination',
    examType: 'post_basic',
  },
  {
    id: 'public_health',
    label: 'Public Health Nursing (PHN)',
    shortLabel: 'Public Health',
    icon: '🌍',
    color: '#16A34A',
    description: 'Post Basic Public Health Nursing Examination',
    examType: 'post_basic',
  },
  {
    id: 'perioperative',
    label: 'Peri-operative (Theatre) Nursing',
    shortLabel: 'Theatre Nursing',
    icon: '🔪',
    color: '#DC2626',
    description: 'Post Basic Theatre/Peri-operative Nursing Examination',
    examType: 'post_basic',
  },
  {
    id: 'orthopaedic',
    label: 'Orthopaedic Nursing',
    shortLabel: 'Orthopaedic',
    icon: '🦴',
    color: '#D97706',
    description: 'Post Basic Orthopaedic Nursing Examination',
    examType: 'post_basic',
  },
  {
    id: 'ophthalmic',
    label: 'Ophthalmic Nursing',
    shortLabel: 'Ophthalmic',
    icon: '👁️',
    color: '#0891B2',
    description: 'Post Basic Ophthalmic Nursing Examination',
    examType: 'post_basic',
  },
  {
    id: 'paediatric',
    label: 'Paediatric Nursing',
    shortLabel: 'Paediatric',
    icon: '🧒',
    color: '#F59E0B',
    description: 'Post Basic Paediatric Nursing Examination',
    examType: 'post_basic',
  },
  {
    id: 'accident_emergency',
    label: 'Accident & Emergency (A&E) Nursing',
    shortLabel: 'A&E Nursing',
    icon: '🚨',
    color: '#EF4444',
    description: 'Post Basic Accident & Emergency Nursing Examination',
    examType: 'post_basic',
  },
  {
    id: 'critical_care',
    label: 'Critical Care / Intensive Care Nursing',
    shortLabel: 'ICU/Critical Care',
    icon: '💊',
    color: '#8B5CF6',
    description: 'Post Basic Critical Care / ICU Nursing Examination',
    examType: 'post_basic',
  },
  {
    id: 'anaesthetist',
    label: 'Nurse Anaesthetist Programme',
    shortLabel: 'Anaesthetics',
    icon: '💉',
    color: '#14B8A8',
    description: 'Nurse Anaesthetist Board Examination',
    examType: 'post_basic',
  },
  {
    id: 'ent',
    label: 'Ear, Nose & Throat (ENT) Nursing',
    shortLabel: 'ENT Nursing',
    icon: '👂',
    color: '#F97316',
    description: 'Post Basic ENT Nursing Examination',
    examType: 'post_basic',
  },
  {
    id: 'occupational_health',
    label: 'Occupational Health Nursing',
    shortLabel: 'Occupational Health',
    icon: '⚕️',
    color: '#84CC16',
    description: 'Post Basic Occupational Health Nursing Examination',
    examType: 'post_basic',
  },
  {
    id: 'burns_plastic',
    label: 'Burns and Plastic Nursing',
    shortLabel: 'Burns & Plastics',
    icon: '🩹',
    color: '#EC4899',
    description: 'Post Basic Burns & Plastic Surgery Nursing Examination',
    examType: 'post_basic',
  },
  {
    id: 'cardiothoracic',
    label: 'Cardio-thoracic Nursing',
    shortLabel: 'Cardio-thoracic',
    icon: '❤️',
    color: '#E11D48',
    description: 'Post Basic Cardio-thoracic Nursing Examination',
    examType: 'post_basic',
  },
  {
    id: 'nephrology',
    label: 'Nephrology Nursing (Renal/Dialysis)',
    shortLabel: 'Nephrology',
    icon: '🫘',
    color: '#6366F1',
    description: 'Post Basic Nephrology / Renal Nursing Examination',
    examType: 'post_basic',
  },
  {
    id: 'oncology',
    label: 'Oncology Nursing (Cancer Care)',
    shortLabel: 'Oncology',
    icon: '🎗️',
    color: '#A855F7',
    description: 'Post Basic Oncology / Cancer Care Nursing Examination',
    examType: 'post_basic',
  },
  {
    id: 'community_nursing',
    label: 'Community Health Nursing',
    shortLabel: 'Community Nursing',
    icon: '🏘️',
    color: '#059669',
    description: 'Post Basic Community Health Nursing Examination',
    examType: 'post_basic',
  },
];

export const EXAM_YEARS = ['2020', '2021', '2022', '2023', '2024', '2025'];

// Used in ExamConfigPage and CategoryPickerPage — course_drill excluded
// because it has its own dedicated CourseDrillPage flow
export const EXAM_TYPES = [
  { id: 'past_questions',  label: 'NMCN Past Questions',  icon: '📚' },
  { id: 'hospital_finals', label: 'Hospital Final Exams',  icon: '🏨' },
  { id: 'mock_exam',       label: 'Mock Examination',      icon: '📝' },
  { id: 'daily_practice',  label: 'Daily Practice Quiz',   icon: '⚡' },
  { id: 'topic_drill',     label: 'Topic Drill',           icon: '🎯' },
];

// Full list including course_drill — used in QuestionsManager admin upload
export const ALL_EXAM_TYPES = [
  { id: 'past_questions',  label: 'NMCN Past Questions',  icon: '📚' },
  { id: 'hospital_finals', label: 'Hospital Final Exams',  icon: '🏨' },
  { id: 'mock_exam',       label: 'Mock Examination',      icon: '📝' },
  { id: 'daily_practice',  label: 'Daily Practice Quiz',   icon: '⚡' },
  { id: 'topic_drill',     label: 'Topic Drill',           icon: '🎯' },
  { id: 'course_drill',    label: 'Course Drill',          icon: '📖' },
];

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT NURSING COURSES
// Every course MUST have a `category` field matching a NURSING_CATEGORIES id.
// This makes filtering in CourseDrillPage & CourseDrillArchivePage work without
// any static lookup map. Courses shared across all specialties use
// category: 'general_nursing' as the primary home but will also appear under
// other specialties because CourseDrillPage shows 'all' courses by default
// when a specialty has no dedicated courses.
//
// To add more courses per specialty, either:
//   1. Add them here with the correct category, OR
//   2. Admin adds them in the admin panel (stored in Firestore 'courses' collection
//      with a `category` field) — they will automatically appear in student pages.
// ─────────────────────────────────────────────────────────────────────────────
export const DEFAULT_NURSING_COURSES = [
  // ── General Nursing (shared foundation courses) ──────────────────────────
  { id: 'anatomy',             label: 'Anatomy',                      icon: '🦴', category: 'general_nursing' },
  { id: 'physiology',          label: 'Physiology',                   icon: '🫀', category: 'general_nursing' },
  { id: 'medical_surgical',    label: 'Medical Surgical Nursing',     icon: '🏥', category: 'general_nursing' },
  { id: 'pharmacology',        label: 'Pharmacology',                 icon: '💊', category: 'general_nursing' },
  { id: 'fundamentals',        label: 'Fundamentals of Nursing',      icon: '📋', category: 'general_nursing' },
  { id: 'nutrition',           label: 'Nutrition & Dietetics',        icon: '🥗', category: 'general_nursing' },
  { id: 'microbiology',        label: 'Microbiology & Parasitology',  icon: '🦠', category: 'general_nursing' },
  { id: 'nursing_ethics',      label: 'Nursing Ethics & Law',         icon: '⚖️', category: 'general_nursing' },
  { id: 'nursing_research',    label: 'Nursing Research',             icon: '🔬', category: 'general_nursing' },
  { id: 'health_assessment',   label: 'Health Assessment',            icon: '🩺', category: 'general_nursing' },

  // ── Midwifery ─────────────────────────────────────────────────────────────
  { id: 'maternal_child',      label: 'Maternal & Child Health',      icon: '👶', category: 'midwifery' },
  { id: 'antenatal_care',      label: 'Antenatal Care',               icon: '🤰', category: 'midwifery' },
  { id: 'labour_delivery',     label: 'Labour & Delivery',            icon: '🍼', category: 'midwifery' },
  { id: 'postnatal_care',      label: 'Postnatal Care',               icon: '👩‍🍼', category: 'midwifery' },
  { id: 'neonatal_care',       label: 'Neonatal Care',                icon: '🧒', category: 'midwifery' },
  { id: 'family_planning',     label: 'Family Planning',              icon: '👨‍👩‍👧', category: 'midwifery' },
  { id: 'obstetric_comp',      label: 'Obstetric Complications',      icon: '⚠️', category: 'midwifery' },

  // ── Mental Health ─────────────────────────────────────────────────────────
  { id: 'psychiatric_nursing', label: 'Psychiatric Nursing',          icon: '🧠', category: 'mental_health' },
  { id: 'psychopharmacology',  label: 'Psychopharmacology',           icon: '💊', category: 'mental_health' },
  { id: 'mental_assessment',   label: 'Mental Health Assessment',     icon: '📋', category: 'mental_health' },
  { id: 'therapeutic_comm',    label: 'Therapeutic Communication',    icon: '🗣️', category: 'mental_health' },
  { id: 'substance_abuse',     label: 'Substance Abuse Nursing',      icon: '🚫', category: 'mental_health' },

  // ── Public Health ─────────────────────────────────────────────────────────
  { id: 'community_health',    label: 'Community Health Nursing',     icon: '🌍', category: 'public_health' },
  { id: 'epidemiology',        label: 'Epidemiology',                 icon: '📊', category: 'public_health' },
  { id: 'env_health',          label: 'Environmental Health',         icon: '🌿', category: 'public_health' },
  { id: 'health_education',    label: 'Health Education & Promotion', icon: '📢', category: 'public_health' },

  // ── Paediatric ────────────────────────────────────────────────────────────
  { id: 'paediatric_nursing',  label: 'Paediatric Nursing',           icon: '🧸', category: 'paediatric' },
  { id: 'child_dev',           label: 'Child Growth & Development',   icon: '📈', category: 'paediatric' },
  { id: 'paed_pharmacology',   label: 'Paediatric Pharmacology',      icon: '💉', category: 'paediatric' },

  // ── Critical Care ─────────────────────────────────────────────────────────
  { id: 'critical_care_nsg',   label: 'Critical Care Nursing',        icon: '🏥', category: 'critical_care' },
  { id: 'mechanical_vent',     label: 'Mechanical Ventilation',       icon: '🫁', category: 'critical_care' },
  { id: 'haemodynamics',       label: 'Haemodynamic Monitoring',      icon: '❤️', category: 'critical_care' },

  // ── Accident & Emergency ──────────────────────────────────────────────────
  { id: 'emergency_nursing',   label: 'Emergency Nursing',            icon: '🚨', category: 'accident_emergency' },
  { id: 'trauma_nursing',      label: 'Trauma Nursing',               icon: '🩹', category: 'accident_emergency' },
  { id: 'triage',              label: 'Triage Principles',            icon: '📋', category: 'accident_emergency' },

  // ── Peri-operative ────────────────────────────────────────────────────────
  { id: 'periop_nursing',      label: 'Peri-operative Nursing',       icon: '🔪', category: 'perioperative' },
  { id: 'scrub_techniques',    label: 'Scrub & Circulating Techniques',icon: '🧤', category: 'perioperative' },
  { id: 'anaesthesia_assist',  label: 'Anaesthesia Assistance',       icon: '😴', category: 'perioperative' },

  // ── Orthopaedic ───────────────────────────────────────────────────────────
  { id: 'ortho_nursing',       label: 'Orthopaedic Nursing',          icon: '🦴', category: 'orthopaedic' },
  { id: 'fracture_mgmt',       label: 'Fracture Management',          icon: '🩹', category: 'orthopaedic' },
  { id: 'rehabilitation',      label: 'Rehabilitation Nursing',       icon: '🏃', category: 'orthopaedic' },

  // ── Anaesthetics ──────────────────────────────────────────────────────────
  { id: 'anaesthetics_nursing',label: 'Anaesthetics Nursing',         icon: '💉', category: 'anaesthetist' },
  { id: 'anaesthetic_agents',  label: 'Anaesthetic Agents',           icon: '🧪', category: 'anaesthetist' },
  { id: 'airway_mgmt',         label: 'Airway Management',            icon: '🫁', category: 'anaesthetist' },

  // ── Ophthalmic ────────────────────────────────────────────────────────────
  { id: 'ophthalmic_nursing',  label: 'Ophthalmic Nursing',           icon: '👁️', category: 'ophthalmic' },
  { id: 'eye_pharmacology',    label: 'Ocular Pharmacology',          icon: '💊', category: 'ophthalmic' },

  // ── ENT ───────────────────────────────────────────────────────────────────
  { id: 'ent_nursing',         label: 'ENT Nursing',                  icon: '👂', category: 'ent' },
  { id: 'ent_procedures',      label: 'ENT Surgical Procedures',      icon: '🔬', category: 'ent' },

  // ── Nephrology ────────────────────────────────────────────────────────────
  { id: 'renal_nursing',       label: 'Renal Nursing',                icon: '🫘', category: 'nephrology' },
  { id: 'dialysis',            label: 'Dialysis Nursing',             icon: '🩸', category: 'nephrology' },

  // ── Oncology ──────────────────────────────────────────────────────────────
  { id: 'oncology_nursing',    label: 'Oncology Nursing',             icon: '🎗️', category: 'oncology' },
  { id: 'chemotherapy',        label: 'Chemotherapy Administration',  icon: '💉', category: 'oncology' },
  { id: 'palliative_care',     label: 'Palliative & End-of-Life Care',icon: '🕊️', category: 'oncology' },

  // ── Cardio-thoracic ───────────────────────────────────────────────────────
  { id: 'cardio_nursing',      label: 'Cardiothoracic Nursing',       icon: '❤️', category: 'cardiothoracic' },
  { id: 'cardiac_monitoring',  label: 'Cardiac Monitoring & ECG',     icon: '📈', category: 'cardiothoracic' },

  // ── Burns & Plastics ──────────────────────────────────────────────────────
  { id: 'burns_nursing',       label: 'Burns Nursing',                icon: '🔥', category: 'burns_plastic' },
  { id: 'wound_care',          label: 'Wound & Plastic Care Nursing', icon: '🩹', category: 'burns_plastic' },

  // ── Occupational Health ───────────────────────────────────────────────────
  { id: 'occup_health_nsg',    label: 'Occupational Health Nursing',  icon: '⚕️', category: 'occupational_health' },
  { id: 'workplace_safety',    label: 'Workplace Health & Safety',    icon: '🦺', category: 'occupational_health' },

  // ── Community Nursing ─────────────────────────────────────────────────────
  { id: 'community_nursing_p', label: 'Community Nursing Practice',   icon: '🏘️', category: 'community_nursing' },
  { id: 'home_based_care',     label: 'Home-Based Care',              icon: '🏠', category: 'community_nursing' },
];

export const SUBJECTS_BY_CATEGORY = {
  general_nursing: [
    'Anatomy & Physiology',
    'Medical-Surgical Nursing',
    'Pharmacology',
    'Fundamentals of Nursing',
    'Maternal & Child Health',
    'Community Health Nursing',
    'Psychiatric Nursing',
    'Nutrition & Dietetics',
    'Nursing Ethics & Law',
    'Microbiology & Parasitology',
  ],
  midwifery: [
    'Antenatal Care',
    'Labour & Delivery',
    'Postnatal Care',
    'Neonatal Care',
    'Obstetric Complications',
    'Family Planning',
    'Midwifery Ethics',
    'Pharmacology in Obstetrics',
  ],
  mental_health: [
    'Psychiatric Disorders',
    'Psychopharmacology',
    'Mental Health Assessment',
    'Therapeutic Communication',
    'Substance Abuse',
    'Child & Adolescent Psychiatry',
    'Forensic Psychiatry',
    'Community Mental Health',
  ],
};

export const DIFFICULTY_LEVELS = [
  { id: 'easy',   label: 'Easy',   color: '#16A34A' },
  { id: 'medium', label: 'Medium', color: '#D97706' },
  { id: 'hard',   label: 'Hard',   color: '#DC2626' },
];

export const ACCESS_PLANS = [
  {
    id: 'free',
    label: 'Free Trial',
    price: 0,
    duration: 'Forever',
    features: ['10 questions/day', '1 category', 'Basic analytics'],
    color: '#64748B',
  },
  {
    id: 'basic',
    label: 'Basic',
    price: 2500,
    duration: '30 days',
    features: ['Unlimited questions', '3 categories', 'Full analytics', 'Mock exams'],
    color: '#0D9488',
    popular: false,
  },
  {
    id: 'standard',
    label: 'Standard',
    price: 5000,
    duration: '90 days',
    features: ['All categories', 'Past questions 2020–2025', 'AI explanations', 'Performance tracking', 'Mock exams'],
    color: '#2563EB',
    popular: true,
  },
  {
    id: 'premium',
    label: 'Premium',
    price: 8000,
    duration: '6 months',
    features: ['Everything in Standard', 'Hospital finals', 'Daily practice', 'Priority support', 'Study notes PDF'],
    color: '#7C3AED',
    popular: false,
  },
];

export const BANK_DETAILS = {
  bank: 'Moniepoint',
  accountNumber: '7054641287',
  accountName: 'Awarin Elite',
  instructions: 'Use your registered email as payment description.',
};
