// src/utils/questionParser.js
// ─────────────────────────────────────────────────────────────────────
// Supports ALL these formats:
//
// FORMAT A — Inline answer:
//   1. Question?
//   A. Option   B. Option   C. Option   D. Option
//   Answer: C
//
// FORMAT B — Separate answer key (paste in second textarea)
// FORMAT C — Options on separate lines with ANS: B
// FORMAT D — Inline options on same line as question
// FORMAT E — Mixed short options (2 per line)
// FORMAT F — Prose paragraph options with multi-line bodies
// FORMAT G — JSON object per question
// FORMAT H — Markdown --- separator blocks
//
// UNNUMBERED FORMAT — Questions without a number prefix are also supported.
//
// RICH TEXT SUPPORT:
//   **word or phrase**   → bold
//   __word or phrase__   → underline
//   *word or phrase*     → italic  (also _word or phrase_)
//
// ANSWER MARKERS (all equivalent):
//   Answer: B  /  Ans: B  /  *B  /  (B)  /  __B__  /  **B**
//
// EXPLANATION LINE BREAKS:
//   Multi-line explanations preserve \n so vertical math layout is kept.
//   Use <ExplanationText text={q.explanation} /> to render correctly.
//
// ─────────────────────────────────────────────────────────────────────

// ── Shuffle Utilities ─────────────────────────────────────────────────

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function shuffleQuestionOptions(question) {
  const options = question.options.map(o => typeof o === 'string' ? o : (o.text || ''));
  if (options.length < 2) return question;
  const correctText = options[question.correctIndex] ?? options[0];
  const shuffled    = shuffleArray(options);
  const newIndex    = shuffled.indexOf(correctText);
  return { ...question, options: shuffled, correctIndex: newIndex >= 0 ? newIndex : 0 };
}

export function shuffleAllQuestionsOptions(questions) {
  return questions.map(shuffleQuestionOptions);
}

// ── Answer Key Parser ─────────────────────────────────────────────────

export function parseAnswerKey(answerText) {
  if (!answerText?.trim()) return {};
  const normalized = answerText.replace(/\r/g, '').replace(/[\u00a0\u2000-\u200b\u3000]/g, ' ');
  const map = {};
  const pattern = /Q?(\d+)\s*[.):–\-]?\s*(?:Answer\s*:\s*)?([A-Ea-e])\b/gi;
  let m;
  while ((m = pattern.exec(normalized)) !== null) map[parseInt(m[1], 10)] = m[2].toUpperCase();
  if (Object.keys(map).length === 0) {
    const lines = normalized.split('\n').map(l => l.trim()).filter(Boolean);
    lines.forEach((line, i) => { const s = line.match(/^([A-Ea-e])\s*$/i); if (s) map[i + 1] = s[1].toUpperCase(); });
  }
  return map;
}

export function parseRationaleKey(answerText) {
  if (!answerText?.trim()) return {};
  const rationaleMap = {};
  const lines = answerText.replace(/\r/g, '').split('\n');
  let currentNum = null, currentRationale = '';
  for (const line of lines) {
    const trimmed = line.trim();
    const qLine = trimmed.match(/^Q?(\d+)\s*[.):–\-]?\s*(?:Answer\s*:\s*)?[A-Ea-e]\b/i);
    if (qLine) {
      if (currentNum !== null && currentRationale) rationaleMap[currentNum] = currentRationale.trim();
      currentNum = parseInt(qLine[1], 10); currentRationale = ''; continue;
    }
    const ratLine = trimmed.match(/^(rationale|explanation|explain|reason|note)[\s\.\:\-]*/i);
    if (ratLine && currentNum !== null) {
      currentRationale = trimmed.replace(/^(rationale|explanation|explain|reason|note)[\s\.\:\-]*/i, '').trim(); continue;
    }
    if (currentNum !== null && currentRationale && trimmed) currentRationale += '\n' + trimmed;
  }
  if (currentNum !== null && currentRationale) rationaleMap[currentNum] = currentRationale.trim();
  return rationaleMap;
}

// ── FORMAT G: JSON Block Pre-processor ───────────────────────────────

function parseJsonBlocks(rawText) {
  const questions = [], optLetters = ['A','B','C','D','E'];
  const segments = [];
  let depth = 0, start = -1;
  for (let i = 0; i < rawText.length; i++) {
    const ch = rawText[i];
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') { depth--; if (depth === 0 && start !== -1) { segments.push(rawText.slice(start, i+1)); start = -1; } }
  }
  const arrayMatch = rawText.match(/^\s*(\[[\s\S]*\])\s*$/);
  if (arrayMatch) { try { const arr = JSON.parse(arrayMatch[1]); if (Array.isArray(arr)) arr.forEach(o => segments.push(JSON.stringify(o))); } catch(_){} }
  for (const seg of segments) {
    let obj; try { obj = JSON.parse(seg); } catch(_){ continue; }
    const qText = obj.question||obj.q||obj.Question||obj.Q||''; if (!qText||typeof qText!=='string') continue;
    const rawOpts = obj.options||obj.Options||obj.choices||obj.Choices||[]; if (!Array.isArray(rawOpts)||rawOpts.length<2) continue;
    const answerRaw = (obj.answer||obj.Answer||obj.correct||obj.Correct||'').toString().trim();
    const explanation = (obj.explanation||obj.Explanation||obj.rationale||obj.Rationale||'').toString().trim();
    const parsedOpts = rawOpts.map((o,idx) => { const str=(typeof o==='string'?o:JSON.stringify(o)).trim(); const px=str.match(/^([A-Ea-e])[\.\)\-:]\s*/); return px?{letter:px[1].toUpperCase(),text:str.slice(px[0].length).trim()}:{letter:optLetters[idx]||String.fromCharCode(65+idx),text:str}; });
    parsedOpts.sort((a,b)=>optLetters.indexOf(a.letter)-optLetters.indexOf(b.letter));
    const al = answerRaw.match(/^([A-Ea-e])\b/i)?.[1]?.toUpperCase()||null;
    const ci = al!==null?parsedOpts.findIndex(o=>o.letter===al):-1;
    questions.push({ _fromJson:true, question:qText.trim(), options:parsedOpts.map(o=>o.text), correctIndex:ci>=0?ci:0, explanation, imageUrl:'', explanationImageUrl:'', _hasAnswer:ci>=0, _sortedLetters:parsedOpts.map(o=>o.letter) });
  }
  return questions;
}

// ── FORMAT H: Markdown Separator Block Pre-processor ─────────────────

function _splitInlineOptions(line) {
  const positions = [];
  const re = /(?:^|\s)([A-Ea-e])[\.]\s+/g;
  let m;
  while ((m = re.exec(line)) !== null) positions.push({ letter: m[1].toUpperCase(), index: m.index === 0 ? 0 : m.index+1 });
  if (positions.length < 2) return null;
  return positions.map((p,i) => { const end = i+1<positions.length?positions[i+1].index:line.length; return { letter:p.letter, text:line.slice(p.index,end).trim().replace(/^[A-Ea-e]\.\s*/i,'').trim() }; });
}

function parseMarkdownSeparatorBlocks(rawText, startSeq = 1) {
  const optLetters = ['A','B','C','D','E'];
  const questions = [];
  let seqCounter = startSeq - 1;
  const blocks = rawText.split(/^[\-\*\_]{3,}\s*$/m).map(b=>b.trim()).filter(Boolean);
  for (const block of blocks) {
    if (/^(\d+[\.\)]\s*|Q\s*\d+[\.\):\s])/.test(block)) continue;
    if (/^\s*\{/.test(block)) continue;
    const lines = block.split('\n').map(l=>l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    seqCounter++;
    let questionLines=[], optionMap={}, answerLetter=null, explanationLines=[], inExplanation=false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^(answer|ans|correct|key|solution)[\s\.\:\-]*/i.test(line)) {
        const cl = line.replace(/^(answer|ans|correct|key|solution)[\s\.\:\-]*/i,'').trim();
        const mm = cl.match(/^([A-Ea-e])\b/i); if (mm) answerLetter=mm[1].toUpperCase();
        inExplanation=false; continue;
      }
      if (/^(explanation|explain|rationale|reason|note|solution)[\s\.\:\-]*/i.test(line)) {
        const rest=line.replace(/^(explanation|explain|rationale|reason|note|solution)[\s\.\:\-]*/i,'').trim();
        if (rest) explanationLines.push(rest); inExplanation=true; continue;
      }
      if (inExplanation) { explanationLines.push(line); continue; }
      const inlineOpts = _splitInlineOptions(line);
      if (inlineOpts&&inlineOpts.length>=2) { inlineOpts.forEach(o=>{ if(!optionMap[o.letter]) optionMap[o.letter]=o.text; }); continue; }
      const so = line.match(/^([A-Ea-e])[\.\)\-:]\s+(.+)$/i);
      if (so) { const lt=so[1].toUpperCase(); if(!optionMap[lt]) optionMap[lt]=so[2].trim(); continue; }
      if (Object.keys(optionMap).length===0) questionLines.push(line);
    }
    const questionText = questionLines.join(' ').trim();
    if (!questionText||Object.keys(optionMap).length<2) continue;
    const sortedOpts = Object.entries(optionMap).sort((a,b)=>optLetters.indexOf(a[0])-optLetters.indexOf(b[0]));
    const ci = answerLetter!==null?sortedOpts.findIndex(([l])=>l===answerLetter):-1;
    questions.push({ _fromSeparatorBlock:true, _seq:seqCounter, _qNumber:seqCounter, question:questionText, options:sortedOpts.map(([,t])=>t), correctIndex:ci>=0?ci:0, explanation:explanationLines.join('\n').trim(), imageUrl:'', explanationImageUrl:'', _hasAnswer:ci>=0, _sortedLetters:sortedOpts.map(([l])=>l) });
  }
  return questions;
}

// ── Main Parser ───────────────────────────────────────────────────────

export function parseQuestionsFromText(rawText, answerKeyText = '') {
  const answerKey    = parseAnswerKey(answerKeyText);
  const rationaleMap = parseRationaleKey(answerKeyText);

  let cleanedText = rawText;
  const jsonQuestions = parseJsonBlocks(rawText);

  if (jsonQuestions.length > 0) {
    let depth=0,start=-1,stripped='',lastEnd=0;
    for (let i=0;i<rawText.length;i++) {
      const ch=rawText[i];
      if(ch==='{'){if(depth===0)start=i;depth++;}
      else if(ch==='}'){depth--;if(depth===0&&start!==-1){const seg=rawText.slice(start,i+1);let isQ=false;try{const o=JSON.parse(seg);if(o&&(o.q||o.question||o.Question||o.Q))isQ=true;}catch(_){}if(isQ){stripped+=rawText.slice(lastEnd,start);lastEnd=i+1;}start=-1;}}
    }
    stripped+=rawText.slice(lastEnd);
    cleanedText=stripped;
  }

  const separatorQuestions = parseMarkdownSeparatorBlocks(cleanedText);
  if (separatorQuestions.length > 0) {
    cleanedText = cleanedText.replace(/(^|\n)[\-\*\_]{3,}\s*\n([\s\S]*?)(?=([\-\*\_]{3,}|\d+[\.\)]\s|\Z))/gm,(match,prefix,body)=>{
      if(/^\d+[\.\)]\s/.test(body.trim()))return match; return prefix+'\n';
    });
  }

  // Normalize line endings; preserve \n
  cleanedText = cleanedText.replace(/\r\n/g,'\n').replace(/\r/g,'\n').replace(/[\u00a0\u2000-\u200b\u3000]/g,' ');

  const lines = cleanedText.split('\n').map(l => l.trim()).filter(Boolean);
  const questions = [];
  let current = null;
  let seqCounter = 0;
  const optLetters = ['A','B','C','D','E'];

  const isQuestionLine    = l => /^(\d+[\.\)]\s*|Q\s*\d+[\.\):\s]\s*|Question\s*\d+[\.\):\s]\s*)/i.test(l);
  const isOptionLine      = l => /^([A-Ea-e][\.\)\-:]|\([A-Ea-e]\))\s*.+/i.test(l);
  const isAnswerLine      = l => {
    const t=l.trim();
    return /^\*[A-Ea-e]$/.test(t)||/^__[A-Ea-e]__$/.test(t)||/^\*\*[A-Ea-e]\*\*$/.test(t)||/^\([A-Ea-e]\)$/.test(t)||/^(answer|ans|correct|key|solution)[\s\.\:\-]*/i.test(t);
  };
  const isExplanationLine = l => /^(explanation|explain|rationale|reason|note|solution)[\s\.\:\-]*/i.test(l);

  const extractImageTag   = text => { const mm=text.match(/\[image:\s*(https?:\/\/[^\]]+)\]/i); return mm?{url:mm[1].trim(),text:text.replace(mm[0],'').trim()}:{url:'',text}; };
  const getQuestionNumber = l => { const mm=l.match(/^(\d+)/); return mm?parseInt(mm[1]):null; };
  const extractOptionLetter = l => { const mm=l.match(/^([A-Ea-e])[\.\)\-:]|\(([A-Ea-e])\)/i); return mm?(mm[1]||mm[2]).toUpperCase():null; };
  const extractOptionText   = l => l.replace(/^([A-Ea-e][\.\)\-:]|\([A-Ea-e]\))\s*/i,'').trim();
  const extractAnswerLetter = l => {
    const t=l.trim();
    const star=t.match(/^\*([A-Ea-e])$/i);       if(star)  return star[1].toUpperCase();
    const du=t.match(/^__([A-Ea-e])__$/i);        if(du)    return du[1].toUpperCase();
    const ds=t.match(/^\*\*([A-Ea-e])\*\*$/i);   if(ds)    return ds[1].toUpperCase();
    const pa=t.match(/^\(([A-Ea-e])\)$/i);        if(pa)    return pa[1].toUpperCase();
    const cl=t.replace(/^(answer|ans|correct|key|solution)[\s\.\:\-]*/i,'').trim();
    const mm=cl.match(/^([A-Ea-e])\b/i); return mm?mm[1].toUpperCase():null;
  };
  const extractInlineOptions = l => {
    const op=/\b([A-D])\.\s*([^A-D\.]{2,}?)(?=\s+[A-D]\.|$)/g,opts=[];let mm;
    while((mm=op.exec(l))!==null)opts.push({letter:mm[1].toUpperCase(),text:mm[2].trim()});
    return opts.length>=2?opts:null;
  };
  const extractDoubleOptions = l => {
    const mm=l.match(/^([A-Ea-e])[\.\)]\s*(.+?)\s{2,}([A-Ea-e])[\.\)]\s*(.+)$/i);
    return mm?[{letter:mm[1].toUpperCase(),text:mm[2].trim()},{letter:mm[3].toUpperCase(),text:mm[4].trim()}]:null;
  };
  const isProseParagraphOption = l => /^[A-Ea-e][\.\)]\s+.{10,}$/i.test(l)&&!extractDoubleOptions(l);

  const saveQuestion = () => {
    if (!current||!current.question||current.options.length<2) return;
    const sortedOpts=[...current.options].sort((a,b)=>optLetters.indexOf(a.letter)-optLetters.indexOf(b.letter));
    let correctLetter=null;
    if(current.answerLetter)correctLetter=current.answerLetter;
    else if(answerKey[current.qNumber]!==undefined)correctLetter=answerKey[current.qNumber];
    const ci=correctLetter!==null?sortedOpts.findIndex(o=>o.letter===correctLetter):-1;
    questions.push({ question:current.question.trim(), options:sortedOpts.map(o=>o.text), correctIndex:ci>=0?ci:-1, explanation:current.explanation||'', imageUrl:current.imageUrl||'', explanationImageUrl:current.explanationImageUrl||'', _seq:current.seq, _qNumber:current.qNumber, _hasAnswer:ci>=0, _sortedLetters:sortedOpts.map(o=>o.letter) });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^[\-\*\_]{3,}\s*$/.test(line)) continue;

    if (isQuestionLine(line)) {
      saveQuestion();
      seqCounter++;
      const labelNum = getQuestionNumber(line)||seqCounter;
      let qText = line.replace(/^(\d+[\.\)]\s*|Q\s*\d+[\.\):\s]\s*|Question\s*\d+[\.\):\s]\s*)/i,'').trim();
      const qImg = extractImageTag(qText); qText=qImg.text;
      const inlineOpts = extractInlineOptions(qText);
      if (inlineOpts&&inlineOpts.length>=2) {
        const fp=qText.search(/\b[A-D]\.\s/); if(fp>0)qText=qText.substring(0,fp).trim();
        current={question:qText,options:inlineOpts,answerLetter:null,explanation:'',seq:seqCounter,qNumber:labelNum,imageUrl:qImg.url,explanationImageUrl:''};
      } else {
        current={question:qText,options:[],answerLetter:null,explanation:'',seq:seqCounter,qNumber:labelNum,imageUrl:qImg.url,explanationImageUrl:''};
      }
      continue;
    }

    // AUTO-START: unnumbered question
    if (!current) {
      if (!isOptionLine(line)&&!isAnswerLine(line)&&!isExplanationLine(line)) {
        seqCounter++;
        const qImg=extractImageTag(line);
        current={question:qImg.text,options:[],answerLetter:null,explanation:'',seq:seqCounter,qNumber:seqCounter,imageUrl:qImg.url,explanationImageUrl:''};
      }
      continue;
    }

    if (!isAnswerLine(line)&&!isExplanationLine(line)) {
      const double=extractDoubleOptions(line);
      if (double) { double.forEach(o=>{if(!current.options.find(x=>x.letter===o.letter))current.options.push(o);}); continue; }
    }

    if (isProseParagraphOption(line)&&!isAnswerLine(line)&&!isExplanationLine(line)) {
      const letter=extractOptionLetter(line); let text=extractOptionText(line);
      while(i+1<lines.length){const next=lines[i+1];if(isQuestionLine(next)||isOptionLine(next)||isAnswerLine(next)||isExplanationLine(next)||/^[\-\*\_]{3,}\s*$/.test(next))break;text+=' '+next;i++;}
      if(letter&&text&&!current.options.find(o=>o.letter===letter))current.options.push({letter,text:text.trim()});
      continue;
    }

    if (isOptionLine(line)) {
      const letter=extractOptionLetter(line),text=extractOptionText(line);
      if(letter&&text&&!current.options.find(o=>o.letter===letter))current.options.push({letter,text});
      continue;
    }

    if (isAnswerLine(line)) { current.answerLetter=extractAnswerLetter(line); continue; }

    if (isExplanationLine(line)) {
      // Strip "Explanation:" prefix, keep rest of line as first part
      const firstPart = line.replace(/^(explanation|explain|rationale|reason|note|solution)[\s\.\:\-]*/i,'').trim();
      const explLines = firstPart ? [firstPart] : [];
      // Collect continuation lines, preserving each line separately
      while(i+1<lines.length){
        const next=lines[i+1];
        if(isQuestionLine(next)||isOptionLine(next)||isAnswerLine(next)||/^[\-\*\_]{3,}/.test(next))break;
        explLines.push(next); i++;
      }
      // Join with \n — preserves vertical math layout
      const explImg = extractImageTag(explLines.join('\n'));
      current.explanation = explImg.text;
      if(explImg.url)current.explanationImageUrl=explImg.url;
      continue;
    }

    if (current.options.length===0&&!isOptionLine(line)) current.question+=' '+line;
  }

  saveQuestion();

  let mergedSeq=questions.length;
  jsonQuestions.forEach(q=>{mergedSeq++;q._seq=mergedSeq;q._qNumber=mergedSeq;});
  separatorQuestions.forEach(q=>{mergedSeq++;q._seq=mergedSeq;q._qNumber=mergedSeq;});

  const allQuestions=[...questions,...jsonQuestions,...separatorQuestions];
  allQuestions.sort((a,b)=>(a._seq||0)-(b._seq||0));

  if (Object.keys(answerKey).length>0) {
    const pa=Object.entries(answerKey).sort((a,b)=>parseInt(a[0])-parseInt(b[0])).map(([,l])=>l);
    allQuestions.forEach((q,posIdx)=>{
      if(!q.explanation&&rationaleMap[q._qNumber])q.explanation=rationaleMap[q._qNumber];
      if(q._hasAnswer)return;
      let letter=answerKey[q._qNumber];
      if(letter===undefined&&posIdx<pa.length)letter=pa[posIdx];
      if(letter!==undefined){const idx=q._sortedLetters?q._sortedLetters.indexOf(letter):optLetters.indexOf(letter);q.correctIndex=idx>=0?idx:0;q._hasAnswer=true;}
      else q.correctIndex=0;
    });
  } else {
    allQuestions.forEach(q=>{if(q.correctIndex<0)q.correctIndex=0;});
  }

  return allQuestions;
}

export function validateQuestion(q) {
  const errors=[];
  if(!q.question||q.question.trim().length<5)errors.push('Question text too short.');
  if(!q.options||q.options.length<2)errors.push('Need at least 2 options.');
  if(q.correctIndex===undefined||q.correctIndex<0)errors.push('No correct answer marked.');
  if(q.options&&q.correctIndex>=q.options.length)errors.push('Correct index out of range.');
  return errors;
}

export function formatQuestionForFirestore(q, meta={}) {
  const options=Array.isArray(q.options)?q.options.map(o=>(typeof o==='string'?o:o.text||'').trim()):[];
  return {
    question:q.question.trim(), options,
    correctIndex:(q.correctIndex!==undefined&&q.correctIndex>=0)?q.correctIndex:0,
    explanation:q.explanation||'',
    imageUrl:q.imageUrl||'', explanationImageUrl:q.explanationImageUrl||'',
    category:meta.category||'general_nursing', examType:meta.examType||'past_questions',
    year:meta.year||'2024', subject:meta.subject||'', difficulty:meta.difficulty||'medium',
    tags:meta.tags||[], source:meta.source||'', course:meta.course||'', topic:meta.topic||'',
    active:true, createdAt:new Date().toISOString(),
  };
}
