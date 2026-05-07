// src/data/seedCourses.js
//
// One-time seed script for the `courses` Firestore collection.
//
// Field names match CoursesManager exactly:
//   label    (not "name")      — the course display name
//   category (not "specialty") — matches NURSING_CATEGORIES id values
//   icon, description, active, order, createdAt
//
// HOW TO USE:
//   Drop <SeedCoursesButton /> anywhere in your admin panel (e.g. top of
//   CoursesManager) and click it once. Safe to re-run — existing courses
//   are never overwritten or duplicated.
//
// TO ADD MORE SPECIALTIES LATER:
//   Append new entries to SEED_COURSES below and re-run.
//   Only courses that don't already exist (matched on label + category)
//   will be written.

import {
  collection, addDoc, getDocs,
  query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';

// ── Seed data ─────────────────────────────────────────────────────────────────
//
// `category` must match the `id` values in your NURSING_CATEGORIES array.
// `order` preserves the official NMCN curriculum sequence.
// `icon` can be changed per-course in CoursesManager after seeding.

export const SEED_COURSES = [

  // ── General Nursing (Basic RN) — 26 courses ───────────────────────────────
  { category: 'general_nursing', order:  1, label: 'Anatomy and Physiology',                                                               icon: '🦴' },
  { category: 'general_nursing', order:  2, label: 'Foundation of Nursing',                                                                icon: '🏥' },
  { category: 'general_nursing', order:  3, label: 'Use of English / Communication Skills',                                                icon: '📢' },
  { category: 'general_nursing', order:  4, label: 'Applied Physics',                                                                      icon: '⚗️' },
  { category: 'general_nursing', order:  5, label: 'Applied Chemistry',                                                                    icon: '🧪' },
  { category: 'general_nursing', order:  6, label: 'Sociology / Social and Behavioural Science',                                          icon: '🌍' },
  { category: 'general_nursing', order:  7, label: 'Introduction to Information and Communication Technology (ICT) / Nursing Informatics', icon: '💻' },
  { category: 'general_nursing', order:  8, label: 'Nutrition and Dietetics',                                                              icon: '🥗' },
  { category: 'general_nursing', order:  9, label: 'Medical-Surgical Nursing',                                                             icon: '🔪' },
  { category: 'general_nursing', order: 10, label: 'Primary Health Care',                                                                  icon: '🏘️' },
  { category: 'general_nursing', order: 11, label: 'Psychology',                                                                           icon: '🧠' },
  { category: 'general_nursing', order: 12, label: 'Microbiology',                                                                         icon: '🔬' },
  { category: 'general_nursing', order: 13, label: 'Pharmacology',                                                                         icon: '💊' },
  { category: 'general_nursing', order: 14, label: 'Reproductive Health',                                                                  icon: '🎗️' },
  { category: 'general_nursing', order: 15, label: 'Biostatistics / Research Statistics',                                                  icon: '📊' },
  { category: 'general_nursing', order: 16, label: 'Research Methodology',                                                                 icon: '📋' },
  { category: 'general_nursing', order: 17, label: 'Community Health Nursing',                                                             icon: '🌿' },
  { category: 'general_nursing', order: 18, label: 'Mental Health / Psychiatric Nursing',                                                  icon: '💆' },
  { category: 'general_nursing', order: 19, label: 'Emergency and Disaster Nursing',                                                       icon: '🚨' },
  { category: 'general_nursing', order: 20, label: 'Home Health Care Nursing',                                                             icon: '🏠' },
  { category: 'general_nursing', order: 21, label: 'Principles of Management and Teaching',                                                icon: '📈' },
  { category: 'general_nursing', order: 22, label: 'Research Project',                                                                     icon: '🎓' },
  { category: 'general_nursing', order: 23, label: 'Quality Improvement and Patient Safety',                                               icon: '⭐' },
  { category: 'general_nursing', order: 24, label: 'Politics and Governance in Nursing',                                                   icon: '⚖️' },
  { category: 'general_nursing', order: 25, label: 'Introduction to Seminar Presentation / Professional Writing and Term Paper',          icon: '📖' },
  { category: 'general_nursing', order: 26, label: 'Entrepreneurship',                                                                     icon: '🏋️' },

  // ── Basic Midwifery (NMCN curriculum) — 29 courses ────────────────────────
  { category: 'basic_midwifery', order:  1, label: 'Anatomy and Physiology',                                                               icon: '🦴' },
  { category: 'basic_midwifery', order:  2, label: 'Foundation of Nursing',                                                                icon: '🏥' },
  { category: 'basic_midwifery', order:  3, label: 'Use of English / Communication Skills',                                                icon: '📢' },
  { category: 'basic_midwifery', order:  4, label: 'Applied Physics',                                                                      icon: '⚗️' },
  { category: 'basic_midwifery', order:  5, label: 'Applied Chemistry',                                                                    icon: '🧪' },
  { category: 'basic_midwifery', order:  6, label: 'Social and Behavioural Science',                                                       icon: '🌍' },
  { category: 'basic_midwifery', order:  7, label: 'Nutrition and Dietetics',                                                              icon: '🥗' },
  { category: 'basic_midwifery', order:  8, label: 'Primary Health Care',                                                                  icon: '🏘️' },
  { category: 'basic_midwifery', order:  9, label: 'Microbiology',                                                                         icon: '🔬' },
  { category: 'basic_midwifery', order: 10, label: 'Pharmacology',                                                                         icon: '💊' },
  { category: 'basic_midwifery', order: 11, label: 'Medical-Surgical Nursing',                                                             icon: '🔪' },
  { category: 'basic_midwifery', order: 12, label: 'Reproductive Health',                                                                  icon: '🎗️' },
  { category: 'basic_midwifery', order: 13, label: 'Normal Midwifery',                                                                     icon: '🤰' },
  { category: 'basic_midwifery', order: 14, label: 'Complicated Midwifery',                                                                icon: '⚠️' },
  { category: 'basic_midwifery', order: 15, label: 'Community Midwifery',                                                                  icon: '🏘️' },
  { category: 'basic_midwifery', order: 16, label: 'Child Health',                                                                         icon: '🧸' },
  { category: 'basic_midwifery', order: 17, label: 'Family Planning',                                                                      icon: '👨‍👩‍👧' },
  { category: 'basic_midwifery', order: 18, label: 'Family Care (Expectant Family Project)',                                               icon: '🍼' },
  { category: 'basic_midwifery', order: 19, label: 'Mental Health Nursing',                                                                icon: '💆' },
  { category: 'basic_midwifery', order: 20, label: 'Emergency and Disaster Nursing (including midwifery emergencies)',                     icon: '🚨' },
  { category: 'basic_midwifery', order: 21, label: 'Home Health Care Nursing',                                                             icon: '🏠' },
  { category: 'basic_midwifery', order: 22, label: 'Nursing Informatics / Introduction to Information and Communication Technology (ICT)', icon: '💻' },
  { category: 'basic_midwifery', order: 23, label: 'Research Methodology / Research and Statistics / Biostatistics',                      icon: '📊' },
  { category: 'basic_midwifery', order: 24, label: 'Research Project',                                                                     icon: '🎓' },
  { category: 'basic_midwifery', order: 25, label: 'Principles of Management and Teaching',                                                icon: '📈' },
  { category: 'basic_midwifery', order: 26, label: 'Quality Improvement and Patient Safety',                                               icon: '⭐' },
  { category: 'basic_midwifery', order: 27, label: 'Politics and Governance in Nursing',                                                   icon: '⚖️' },
  { category: 'basic_midwifery', order: 28, label: 'Entrepreneurship',                                                                     icon: '🏋️' },
  { category: 'basic_midwifery', order: 29, label: 'Introduction to Seminar Presentation / Professional Writing and Term Paper',          icon: '📖' },

  // ── Add future specialties here ───────────────────────────────────────────
  // { category: 'post_basic_perioperative', order: 1, label: 'Perioperative Nursing Principles', icon: '🔪' },
];

// ── Runner ────────────────────────────────────────────────────────────────────

/**
 * Writes all SEED_COURSES to Firestore, skipping any that already exist.
 * Duplicate check is on label + category (case-sensitive).
 *
 * @param {function} onProgress  Optional (message: string) => void callback
 * @returns {Promise<{ added: number, skipped: number, errors: number }>}
 */
export async function runSeed(onProgress = () => {}) {
  const coursesRef = collection(db, 'courses');

  onProgress(`Checking Firestore — ${SEED_COURSES.length} courses to process…`);

  // Load all existing courses in one read
  const existingSnap = await getDocs(query(coursesRef, orderBy('label', 'asc')));
  const existingSet  = new Set(
    existingSnap.docs.map(d => `${d.data().category}__${d.data().label}`)
  );

  let added   = 0;
  let skipped = 0;
  let errors  = 0;

  for (const course of SEED_COURSES) {
    const key = `${course.category}__${course.label}`;

    if (existingSet.has(key)) {
      skipped++;
      onProgress(`⏭ Skipped (exists): [${course.category}] ${course.label}`);
      continue;
    }

    try {
      await addDoc(coursesRef, {
        label:       course.label,
        icon:        course.icon  || '📖',
        category:    course.category,
        description: '',
        order:       course.order,
        active:      true,
        createdAt:   serverTimestamp(),
      });
      added++;
      onProgress(`✅ Added: [${course.category}] ${course.label}`);
    } catch (e) {
      errors++;
      onProgress(`❌ Error: [${course.category}] ${course.label} — ${e.message}`);
      console.error('Seed error:', course.label, e);
    }
  }

  onProgress(`Done — ${added} added, ${skipped} skipped, ${errors} errors.`);
  return { added, skipped, errors };
}
