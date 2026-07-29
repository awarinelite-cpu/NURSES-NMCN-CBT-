// src/utils/lectureNotesUtils.js
//
// Lecture Notes feature.
// Firestore collection: 'lectureNotes'
// Doc shape: {
//   specialty:   string   // id from NURSING_CATEGORIES, e.g. 'general_nursing'
//   topic:       string   // the note title, shown in the topic list
//   contentHtml: string   // rich text body (Quill Delta rendered to HTML)
//   order:       number   // manual sort position within a specialty
//   published:   boolean  // hidden from students while false
//   createdAt, updatedAt: server timestamps
//   updatedBy:   string   // admin uid
// }
//
// CSV bulk import layout (header row required):
//   specialty, topic, content
//
//   - specialty: either the category id (e.g. "general_nursing") or the
//     label shown in the app (e.g. "General Nursing (RN)") — matched
//     case-insensitively against NURSING_CATEGORIES.
//   - topic: the note's title.
//   - content: plain text. Blank lines become paragraph breaks. If the
//     cell already starts with "<" it's treated as raw HTML and used as-is,
//     so an export from Word/Google Docs saved as HTML can be pasted in.

import {
  collection, query, where, orderBy, getDocs, getDoc, doc,
  addDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { NURSING_CATEGORIES } from '../data/categories';

const COLLECTION = 'lectureNotes';

// ── Specialty resolution ──────────────────────────────────────────────────
function normalize(s) {
  return String(s || '').toLowerCase().replace(/[\s_\-()]/g, '').trim();
}

export function resolveSpecialtyId(raw) {
  const n = normalize(raw);
  if (!n) return null;
  const byId = NURSING_CATEGORIES.find(c => normalize(c.id) === n);
  if (byId) return byId.id;
  const byLabel = NURSING_CATEGORIES.find(
    c => normalize(c.label) === n || normalize(c.shortLabel) === n,
  );
  if (byLabel) return byLabel.id;
  // loose contains-match as a last resort (e.g. "midwifery" vs "Midwifery (Post Basic)")
  const loose = NURSING_CATEGORIES.find(
    c => normalize(c.label).includes(n) || n.includes(normalize(c.shortLabel)),
  );
  return loose ? loose.id : null;
}

export function specialtyMeta(id) {
  return NURSING_CATEGORIES.find(c => c.id === id) || null;
}

// ── Plain text → HTML (used by CSV import) ────────────────────────────────
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function textToHtml(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('<')) return s; // already HTML
  return s
    .split(/\n{2,}/)
    .map(block => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

// ── Reads ──────────────────────────────────────────────────────────────────

/** Specialties that currently have at least one published note, with counts. */
export async function fetchSpecialtySummary({ includeUnpublished = false } = {}) {
  const snap = await getDocs(collection(db, COLLECTION));
  const counts = new Map();
  snap.docs.forEach(d => {
    const data = d.data();
    if (!includeUnpublished && data.published === false) return;
    counts.set(data.specialty, (counts.get(data.specialty) || 0) + 1);
  });
  return NURSING_CATEGORIES
    .filter(c => counts.has(c.id))
    .map(c => ({ ...c, count: counts.get(c.id) }));
}

/** All topics (notes) within a specialty, lightweight (no content body). */
export async function fetchTopics(specialtyId, { includeUnpublished = false } = {}) {
  if (!specialtyId) return [];
  const snap = await getDocs(query(
    collection(db, COLLECTION),
    where('specialty', '==', specialtyId),
  ));
  const rows = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(r => includeUnpublished || r.published !== false);
  rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.topic || '').localeCompare(b.topic || ''));
  return rows.map(({ contentHtml, ...rest }) => rest);
}

export async function fetchNote(noteId) {
  if (!noteId) return null;
  const snap = await getDoc(doc(db, COLLECTION, noteId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Full admin listing, newest first, all specialties. */
export async function fetchAllNotesForAdmin() {
  const snap = await getDocs(query(collection(db, COLLECTION), orderBy('updatedAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Writes ──────────────────────────────────────────────────────────────────

export async function createNote({ specialty, topic, contentHtml = '', order = 0, published = true }, uid) {
  const ref = await addDoc(collection(db, COLLECTION), {
    specialty, topic, contentHtml, order, published,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: uid || null,
  });
  return ref.id;
}

export async function updateNote(noteId, patch, uid) {
  await updateDoc(doc(db, COLLECTION, noteId), {
    ...patch,
    updatedAt: serverTimestamp(),
    updatedBy: uid || null,
  });
}

export async function deleteNote(noteId) {
  await deleteDoc(doc(db, COLLECTION, noteId));
}

// ── CSV bulk import ──────────────────────────────────────────────────────
// Takes rows already parsed by Papa.parse({header:true}) and writes them in
// batches of 400 (Firestore batch limit is 500 writes).
export async function bulkImportNotes(rows, uid) {
  const prepared = [];
  const skipped = [];

  rows.forEach((row, i) => {
    const specialtyRaw = row.specialty ?? row.Specialty ?? '';
    const topic = (row.topic ?? row.Topic ?? '').trim();
    const contentRaw = row.content ?? row.Content ?? row.note ?? row.Note ?? '';
    const specialty = resolveSpecialtyId(specialtyRaw);

    if (!specialty || !topic) {
      skipped.push({ row: i + 2, reason: !specialty ? `Unrecognized specialty "${specialtyRaw}"` : 'Missing topic' });
      return;
    }
    prepared.push({
      specialty,
      topic,
      contentHtml: textToHtml(contentRaw),
      order: 0,
      published: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: uid || null,
    });
  });

  let written = 0;
  for (let i = 0; i < prepared.length; i += 400) {
    const chunk = prepared.slice(i, i + 400);
    const batch = writeBatch(db);
    chunk.forEach(data => batch.set(doc(collection(db, COLLECTION)), data));
    await batch.commit();
    written += chunk.length;
  }

  return { written, skipped, total: rows.length };
}

export const CSV_TEMPLATE_HEADER = 'specialty,topic,content\n';
export const CSV_TEMPLATE_EXAMPLE =
  'General Nursing (RN),Heart Failure Overview,"Heart failure is the inability of the heart to pump enough blood to meet the body needs.\n\nKey signs include dyspnea, oedema, and fatigue."\n';
