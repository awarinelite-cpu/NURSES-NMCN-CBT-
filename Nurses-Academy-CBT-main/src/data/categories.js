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
  },   // ← make sure there's a comma here
  {
    id: 'community_nursing',
    label: 'Community Health Nursing',
    shortLabel: 'Community Nursing',
    icon: '🏘️',
    color: '#059669',
    description: 'Post Basic Community Health Nursing Examination',
    examType: 'post_basic',
  },
];  // ← this closes the array

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

// Default courses — admin can add more from the admin panel (stored in Firestore 'courses' collection)
export const DEFAULT_NURSING_COURSES = [
  { id: 'anatomy',              label: 'Anatomy',                     icon: '🦴' },
  { id: 'physiology',           label: 'Physiology',                  icon: '🫀' },
  { id: 'medical_surgical',     label: 'Medical Surgical Nursing',    icon: '🏥' },
  { id: 'pharmacology',         label: 'Pharmacology',                icon: '💊' },
  { id: 'fundamentals',         label: 'Fundamentals of Nursing',     icon: '📋' },
  { id: 'maternal_child',       label: 'Maternal & Child Health',     icon: '👶' },
  { id: 'community_health',     label: 'Community Health Nursing',    icon: '🌍' },
  { id: 'psychiatric_nursing',  label: 'Psychiatric Nursing',         icon: '🧠' },
  { id: 'nutrition',            label: 'Nutrition & Dietetics',       icon: '🥗' },
  { id: 'microbiology',         label: 'Microbiology & Parasitology', icon: '🦠' },
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
  bank: 'First Bank Nigeria',
  accountNumber: '3012345678',
  accountName: 'NMCN CBT Platform',
  instructions: 'Use your registered email as payment description.',
};