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
const DRIVE_LINKS_COLLECTION = 'lectureNoteDriveLinks';

// ── Drive folder links (per specialty) ─────────────────────────────────────
// Doc shape (lectureNoteDriveLinks/{specialtyId}): {
//   url: string          // full Drive folder URL as pasted by admin
//   folderId: string     // extracted folder ID, used to build the embed src
//   updatedAt, updatedBy
// }

/** Pulls the folder ID out of any Drive folder URL, or returns a raw ID as-is. */
export function extractDriveFolderId(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  const m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(s)) return s;
  return null;
}

/** { url, folderId } for one specialty, or null if none is set. */
export async function fetchDriveLink(specialtyId) {
  if (!specialtyId) return null;
  const snap = await getDoc(doc(db, DRIVE_LINKS_COLLECTION, specialtyId));
  return snap.exists() ? snap.data() : null;
}

/** All specialties that currently have a Drive link set, keyed by specialtyId. */
export async function fetchAllDriveLinks() {
  const snap = await getDocs(collection(db, DRIVE_LINKS_COLLECTION));
  const map = {};
  snap.docs.forEach(d => { map[d.id] = d.data(); });
  return map;
}

export async function saveDriveLink(specialtyId, url, uid) {
  const folderId = extractDriveFolderId(url);
  if (!folderId) throw new Error('That doesn\'t look like a valid Google Drive folder link.');
  await setDoc(doc(db, DRIVE_LINKS_COLLECTION, specialtyId), {
    url: String(url).trim(),
    folderId,
    updatedAt: serverTimestamp(),
    updatedBy: uid || null,
  });
}

export async function deleteDriveLink(specialtyId) {
  await deleteDoc(doc(db, DRIVE_LINKS_COLLECTION, specialtyId));
}

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
// Supports two input layouts, auto-detected from the header row:
//
// 1) Simple layout — one row per note:
//      specialty, topic, content
//
// 2) "Course export" layout — one row per subtopic, several subtopics make
//    up one note. Common when notes are exported from a syllabus/course
//    outline (e.g. "Unit, Section Title, Subtopic / Concept, Detailed
//    Content / Description"). Rows sharing the same Section Title are
//    merged into a single note, with each subtopic rendered as its own
//    heading + paragraph inside that note. This layout has no specialty
//    column, so the admin picks one specialty for the whole file via
//    `defaultSpecialty`.
//
// Column names are matched case-insensitively and tolerate the "/" variants
// shown above (e.g. "Subtopic / Concept", "Detailed Content / Description").

function pick(row, ...names) {
  for (const n of names) {
    const key = Object.keys(row).find(k => k.trim().toLowerCase() === n);
    if (key && row[key] != null && String(row[key]).trim() !== '') return row[key];
  }
  return '';
}

function isCourseExportLayout(headerKeys) {
  const keys = headerKeys.map(k => k.trim().toLowerCase());
  return keys.some(k => k.startsWith('section title')) &&
    keys.some(k => k.startsWith('detailed content') || k.startsWith('content'));
}

function prepareSimpleRows(rows, { defaultSpecialty } = {}) {
  const prepared = [];
  const skipped = [];
  rows.forEach((row, i) => {
    const specialtyRaw = pick(row, 'specialty');
    const topic = String(pick(row, 'topic', 'title')).trim();
    const contentRaw = pick(row, 'content', 'note', 'notes');
    const specialty = resolveSpecialtyId(specialtyRaw) || defaultSpecialty || null;

    if (!specialty || !topic) {
      skipped.push({ row: i + 2, reason: !specialty ? `Unrecognized specialty "${specialtyRaw}"` : 'Missing topic' });
      return;
    }
    prepared.push({ specialty, topic, contentHtml: textToHtml(contentRaw), order: i });
  });
  return { prepared, skipped };
}

function prepareCourseExportRows(rows, { defaultSpecialty } = {}) {
  const prepared = [];
  const skipped = [];
  if (!defaultSpecialty) {
    return { prepared, skipped: [{ row: 1, reason: 'This CSV has no specialty column — choose a specialty for the whole file before importing.' }] };
  }

  const groups = new Map(); // key -> { unit, topic, parts: [] }
  const order = [];

  rows.forEach((row, i) => {
    const unit = String(pick(row, 'unit')).trim();
    const topic = String(pick(row, 'section title')).trim();
    const subtopic = String(pick(row, 'subtopic / concept', 'subtopic/concept', 'subtopic')).trim();
    const content = String(pick(row, 'detailed content / description', 'detailed content/description', 'detailed content', 'content')).trim();

    if (!topic) { skipped.push({ row: i + 2, reason: 'Missing Section Title' }); return; }

    const key = `${unit}::${topic}`;
    if (!groups.has(key)) { groups.set(key, { unit, topic, parts: [] }); order.push(key); }
    groups.get(key).parts.push({ subtopic, content });
  });

  order.forEach((key, idx) => {
    const g = groups.get(key);
    const body = g.parts.map(p => {
      const heading = p.subtopic ? `<h3>${escapeHtml(p.subtopic)}</h3>` : '';
      return heading + textToHtml(p.content);
    }).join('');
    const unitTag = g.unit ? `<p><em>${escapeHtml(g.unit)}</em></p>` : '';
    prepared.push({ specialty: defaultSpecialty, topic: g.topic, contentHtml: unitTag + body, order: idx });
  });

  return { prepared, skipped };
}

// Takes rows already parsed by Papa.parse({header:true}) and writes them in
// batches of 400 (Firestore batch limit is 500 writes).
// `defaultSpecialty` (a NURSING_CATEGORIES id) is used for rows/files that
// don't specify their own specialty column.
export async function bulkImportNotes(rows, uid, { defaultSpecialty } = {}) {
  if (!rows.length) return { written: 0, skipped: [], total: 0 };

  const layout = isCourseExportLayout(Object.keys(rows[0]))
    ? prepareCourseExportRows(rows, { defaultSpecialty })
    : prepareSimpleRows(rows, { defaultSpecialty });

  const { prepared, skipped } = layout;

  let written = 0;
  for (let i = 0; i < prepared.length; i += 400) {
    const chunk = prepared.slice(i, i + 400);
    const batch = writeBatch(db);
    chunk.forEach(({ specialty, topic, contentHtml, order }) => {
      batch.set(doc(collection(db, COLLECTION)), {
        specialty, topic, contentHtml, order,
        published: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: uid || null,
      });
    });
    await batch.commit();
    written += chunk.length;
  }

  return { written, skipped, total: rows.length };
}

export const CSV_TEMPLATE_HEADER = 'specialty,topic,content\n';
export const CSV_TEMPLATE_EXAMPLE =
  'General Nursing (RN),Heart Failure Overview,"Heart failure is the inability of the heart to pump enough blood to meet the body needs.\n\nKey signs include dyspnea, oedema, and fatigue."\n';
