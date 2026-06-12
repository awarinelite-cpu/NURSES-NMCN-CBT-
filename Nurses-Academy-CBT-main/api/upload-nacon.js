// api/upload-nacon.js — v3: correct collection + delete wrong ones + NACON school
// Visit: /api/upload-nacon?secret=nacon2021
// DELETE this file after successful upload.

import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore, collection, addDoc, getDocs, deleteDoc,
  query, where, serverTimestamp, writeBatch, doc
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAsSmqpkrXEMLL4wdoEn_jD3juAy8Z-w9A",
  authDomain: "elitecarehub-a80da.firebaseapp.com",
  projectId: "elitecarehub-a80da",
  storageBucket: "elitecarehub-a80da.firebasestorage.app",
  messagingSenderId: "76292607120",
  appId: "1:76292607120:web:29ac5fae7fb4e58876dc15"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// Correct answer as A/B/C/D letter from correctIndex 0/1/2/3
const idx2letter = i => ['A','B','C','D'][i];

const QUESTIONS = [
  // ── ENGLISH LANGUAGE (Q1–20) ─────────────────────────────────────
  { questionText:"Why do you worry about such _____ matters?", options:{A:"Insignificant",B:"Significant",C:"Non-Significant",D:"Unsignificant"}, correctAnswer:"A", subject:"English Language" },
  { questionText:"It was difficult to _____ a man walking on the moon two centuries ago.", options:{A:"Contrive",B:"Perceive",C:"Conceive",D:"Imagine"}, correctAnswer:"C", subject:"English Language" },
  { questionText:"This section of the test will _____ questions on set passages.", options:{A:"Consist",B:"Comprise",C:"Contain",D:"Carry"}, correctAnswer:"C", subject:"English Language" },
  { questionText:"Animals in _____ behave differently from animals living in the natural habitat.", options:{A:"Prison",B:"Bondage",C:"Captivity",D:"Slavery"}, correctAnswer:"C", subject:"English Language" },
  { questionText:"After months of tedious climbing, the team reached the _____ of the mountain.", options:{A:"End",B:"Summit",C:"Height",D:"Terminal"}, correctAnswer:"B", subject:"English Language" },
  { questionText:"After Jerry had made the bed, he _____ on it.", options:{A:"Layed on it",B:"Laid",C:"Lied",D:"Lay"}, correctAnswer:"D", subject:"English Language" },
  { questionText:"Knowledge of figures of speech as well as idioms and lexical terms _____ in this section.", options:{A:"Is tested",B:"Have been tested",C:"Are tested",D:"Were tested"}, correctAnswer:"A", subject:"English Language" },
  { questionText:"The buildings damaged by the rainstorm _____ schools, hospitals and private houses.", options:{A:"Included",B:"Include",C:"Were included",D:"Was including"}, correctAnswer:"A", subject:"English Language" },
  { questionText:"I would have been off to see Amarachi at Aja by the time you _____ tomorrow.", options:{A:"Returned",B:"Return",C:"Are returning",D:"Would return"}, correctAnswer:"B", subject:"English Language" },
  { questionText:"The lecturer said that we _____ be able to finish the next chapter this evening.", options:{A:"Must",B:"Can",C:"Shall",D:"Should"}, correctAnswer:"D", subject:"English Language" },
  { questionText:"The official had allegedly been taking bribes. What does this sentence imply?", options:{A:"It was proved that the official had been taking bribes.",B:"The official accused some people of taking bribes.",C:"Some people accused the official of taking bribes.",D:"The official had been taking bribes without feeling any guilt."}, correctAnswer:"C", subject:"English Language" },
  { questionText:"There's a door at either end of the building. What does this mean?", options:{A:"The building has two ends, but I do not know which has a door.",B:"The building has many ends with a door.",C:"The building has two ends, but only one door.",D:"The building has two ends and two doors."}, correctAnswer:"D", subject:"English Language" },
  { questionText:"He could not have rewarded them more handsomely. What does this mean?", options:{A:"He rewarded them very well.",B:"He did not reward them very well.",C:"He spoke to them in a very generous way.",D:"He rewarded them well, and he is also a good-looking man."}, correctAnswer:"A", subject:"English Language" },
  { questionText:"There should be a playing field for women entering politics. What does this mean?", options:{A:"Sports facility should be provided for women entering politics.",B:"Special privileges should be given to women entering politics.",C:"Men and women should be able to compete in the political arena on equal basis.",D:"Women should not be allowed to enter politics."}, correctAnswer:"C", subject:"English Language" },
  { questionText:"The woman won't have live through the night. What does this mean?", options:{A:"The woman survived her ordeal but not without some help.",B:"The woman might have lived if she hadn't got right support.",C:"It was likely the woman died before morning.",D:"From all indications, the woman was taken much worse, though she overcame her ordeal."}, correctAnswer:"C", subject:"English Language" },
  { questionText:"My advice to Courtney was to look before she leap. What does this mean?", options:{A:"Courtney was advised to leap only after looking.",B:"Courtney was advised to weigh her decision by looking and leaping.",C:"Courtney was advised to consider her opinions before reaching any decisions.",D:"Courtney was advised to consider the consequences before taking action."}, correctAnswer:"D", subject:"English Language" },
  { questionText:"Choose the option with the same stress pattern as: DOVETAIL", options:{A:"Proviso",B:"Jargon",C:"Simplicity",D:"Psychiatry"}, correctAnswer:"B", subject:"English Language" },
  { questionText:"Choose the option with the same stress pattern as: APPARENT", options:{A:"Paragraph",B:"Arrested",C:"Appetite",D:"Telephone"}, correctAnswer:"B", subject:"English Language" },
  { questionText:"Choose the option with the same stress pattern as: UNFAIR", options:{A:"First-class",B:"Instant",C:"Insight",D:"Towards"}, correctAnswer:"D", subject:"English Language" },
  { questionText:"Choose the option with the same vowel sound as the underlined letters in: HURT", options:{A:"Hate",B:"Hut",C:"Girl",D:"Hot"}, correctAnswer:"B", subject:"English Language" },
  // ── CHEMISTRY (Q21–40) ───────────────────────────────────────────
  { questionText:"The body contains how many percent of oxygen?", options:{A:"65%",B:"18%",C:"72%",D:"80%"}, correctAnswer:"A", subject:"Chemistry" },
  { questionText:"Which of the following is a poisonous gas that if inhaled reacts with haemoglobin in blood competing with oxygen?", options:{A:"CO2",B:"CO",C:"NO2",D:"SO2"}, correctAnswer:"B", subject:"Chemistry" },
  { questionText:"Which of the following chemical structures represents formaldehyde?", options:{A:"HCHO",B:"CH3CHO",C:"CH3COCH3",D:"CH3CoCH2COOH"}, correctAnswer:"A", subject:"Chemistry" },
  { questionText:"Oxygen taken into the lungs combines with haemoglobin in the blood to form _____.", options:{A:"Carboxyhaemoglobin",B:"Hydroxyl heamin",C:"Nitrohaemin",D:"Oxyhaemoglobin"}, correctAnswer:"D", subject:"Chemistry" },
  { questionText:"The normal pH of human blood is about?", options:{A:"6.5",B:"5.5",C:"7.4",D:"8.5"}, correctAnswer:"C", subject:"Chemistry" },
  { questionText:"Substances that resist changes in pH when either an acid or base is introduced into them are called _____.", options:{A:"Neutral substances",B:"Acidic substances",C:"Alkaline substances",D:"Buffers"}, correctAnswer:"D", subject:"Chemistry" },
  { questionText:"The air constitutes how many percentage of oxygen?", options:{A:"78%",B:"50%",C:"21%",D:"45%"}, correctAnswer:"C", subject:"Chemistry" },
  { questionText:"Which of the following scientists discovered oxygen?", options:{A:"Emil Fischer",B:"Scheele",C:"Dalton",D:"Becquerel"}, correctAnswer:"B", subject:"Chemistry" },
  { questionText:"One of the following is known as wood alcohol.", options:{A:"Ethyl alcohol",B:"Methyl alcohol",C:"Glycerol",D:"Propane"}, correctAnswer:"B", subject:"Chemistry" },
  { questionText:"Alcohols burn, thus forming carbon dioxide and _____.", options:{A:"CO",B:"SO2",C:"H2O",D:"CO2"}, correctAnswer:"C", subject:"Chemistry" },
  { questionText:"One of the following is a primary alcohol.", options:{A:"Butanol",B:"Propan-2-ol",C:"2-methyl propan-2-ol",D:"180propyl alcohol"}, correctAnswer:"A", subject:"Chemistry" },
  { questionText:"Which of the following contains three OH groups per molecule?", options:{A:"Tertiary alcohol",B:"Secondary alcohol",C:"Primary alcohol",D:"Trihydric alcohol"}, correctAnswer:"D", subject:"Chemistry" },
  { questionText:"The lower members of alkane series are _____.", options:{A:"Liquid",B:"Gases",C:"Solvent",D:"Solids"}, correctAnswer:"B", subject:"Chemistry" },
  { questionText:"In carbon monoxide poisoning, the tissues cannot obtain a sufficient supply of _____.", options:{A:"H2O",B:"CO2",C:"O2",D:"N2"}, correctAnswer:"C", subject:"Chemistry" },
  { questionText:"Automobile exhaust gas and many illuminating gases are poisonous because they contain _____.", options:{A:"N2",B:"HCl",C:"CO2",D:"CO"}, correctAnswer:"D", subject:"Chemistry" },
  { questionText:"The word halogen means _____.", options:{A:"Acid formers",B:"Alkali formers",C:"Salt formers",D:"Water formers"}, correctAnswer:"C", subject:"Chemistry" },
  { questionText:"One of the following is a halogen.", options:{A:"Na",B:"Cl2",C:"K",D:"O2"}, correctAnswer:"B", subject:"Chemistry" },
  { questionText:"Acid containing only two elements are called _____.", options:{A:"Temperature acid",B:"Tertiary acid",C:"Binary acid",D:"Saturated acid"}, correctAnswer:"C", subject:"Chemistry" },
  { questionText:"Which of the following is a salt?", options:{A:"HCl",B:"H2SO4",C:"HNO3",D:"NaCl"}, correctAnswer:"D", subject:"Chemistry" },
  { questionText:"Reaction in which water is one of the reacting compounds is called _____.", options:{A:"Condensation",B:"Haemolysis",C:"Hydrolysis",D:"Catalysis"}, correctAnswer:"C", subject:"Chemistry" },
  // ── PHYSICS (Q41–55) ─────────────────────────────────────────────
  { questionText:"Which of the following is most suitable for use as an altimeter?", options:{A:"A mercury barometer",B:"A Fortin barometer",C:"A mercury manometer",D:"An aneroid barometer"}, correctAnswer:"D", subject:"Physics" },
  { questionText:"A body weight W N rests on a smooth plane inclined at angle theta to the horizontal. What is the resolved part of the weight in Newtons along the plane?", options:{A:"W sin(theta)",B:"W cos(theta)",C:"W sec(theta)",D:"W tan(theta)"}, correctAnswer:"A", subject:"Physics" },
  { questionText:"A small metal ball thrown vertically upwards from a tower with initial velocity 20m/s takes 6s to reach ground level. Determine the height of the tower. (g=10ms-2)", options:{A:"60m",B:"80m",C:"100m",D:"120m"}, correctAnswer:"B", subject:"Physics" },
  { questionText:"An object moves with uniform speed round a circle. Its acceleration has _____.", options:{A:"Constant magnitude and constant direction",B:"Constant magnitude and varying direction",C:"Varying magnitude but constant direction",D:"Varying magnitude and varying direction"}, correctAnswer:"B", subject:"Physics" },
  { questionText:"A body of mass 100g moving at 10.0 m/s collides with a wall and bounces back at 2m/s. Calculate the change in momentum.", options:{A:"0.8 Ns",B:"1.2 Ns",C:"12.0 Ns",D:"80.0 Ns"}, correctAnswer:"B", subject:"Physics" },
  { questionText:"Find the tension T in a diagram where the system is in Equilibrium.", options:{A:"200/3 N",B:"100/3 N",C:"300/3 N",D:"100 N"}, correctAnswer:"C", subject:"Physics" },
  { questionText:"A spring of force constant 1500 N/M acted upon by a constant force of 75N. Calculate the potential energy stored in the spring.", options:{A:"1.9 J",B:"3.2 J",C:"3.8 J",D:"5.0 J"}, correctAnswer:"A", subject:"Physics" },
  { questionText:"A wheel and axle have radii 80cm and 10cm. Efficiency is 0.85 and applied force is 1200N. What load will it raise?", options:{A:"8.0N",B:"6.8N",C:"816N",D:"9600.0N"}, correctAnswer:"C", subject:"Physics" },
  { questionText:"A body under a force with semi-circular force-displacement graph moves through 24 metres. What is the work done?", options:{A:"36 nJ",B:"72 nJ",C:"144 nJ",D:"288 nJ"}, correctAnswer:"C", subject:"Physics" },
  { questionText:"A 20kg mass is pulled up a 30-degree slope with 75% efficiency. What force is required? (g=10ms-2)", options:{A:"13.3N",B:"73.5N",C:"133.3N",D:"533.2N"}, correctAnswer:"C", subject:"Physics" },
  { questionText:"A spring balance is 25cm long with 5N and 30cm long with 10N. What is its length with 3N? (Hooke's Law)", options:{A:"15.0cm",B:"17.0cm",C:"20.0cm",D:"23.0cm"}, correctAnswer:"D", subject:"Physics" },
  { questionText:"A stone weighs 15.0g in water and 10.0g in liquid of relative density 2.0. What is its mass in air?", options:{A:"5.0g",B:"12.0g",C:"20.0g",D:"25.0g"}, correctAnswer:"D", subject:"Physics" },
  { questionText:"A pilot records 63cm Hg and ground observer records 75cm Hg. Calculate the height of the plane. (Relative density of Hg=13.0, density of air=0.00013)", options:{A:"1200m",B:"6300m",C:"7500cm",D:"13800m"}, correctAnswer:"B", subject:"Physics" },
  { questionText:"In which of the following is surface tension important?", options:{A:"The floating of a ship in water",B:"The floating of a dry needle in water",C:"The floating of a balloon in air",D:"The diffusion of sugar solution across a membrane"}, correctAnswer:"B", subject:"Physics" },
  { questionText:"A thermometer registers -30S at ice point and 90S at steam point. What is the Celsius temperature for 60S?", options:{A:"25.0C",B:"50.0C",C:"66.7C",D:"42C"}, correctAnswer:"C", subject:"Physics" },
  // ── BIOLOGY (Q56–80) ─────────────────────────────────────────────
  { questionText:"Growth in living things is brought about by the _____.", options:{A:"Deposition of new material from the surroundings",B:"Synthesis of new material from within the body",C:"Absorption of water and minerals",D:"Elasticity of the cell"}, correctAnswer:"B", subject:"Biology" },
  { questionText:"In unicellular organisms, the structure responsible for reproduction is the _____.", options:{A:"Cytoplasm",B:"Lysosome",C:"Mitochondrion",D:"Nucleus"}, correctAnswer:"D", subject:"Biology" },
  { questionText:"The head-foot is a structure mostly found in _____.", options:{A:"Mollusca",B:"Reptile",C:"Arthropoda",D:"Amphibia"}, correctAnswer:"A", subject:"Biology" },
  { questionText:"Which of the following flatworms is free-living?", options:{A:"Tapeworm",B:"Planaria",C:"Liverfluke",D:"Ascaris"}, correctAnswer:"B", subject:"Biology" },
  { questionText:"In which of the following is a diploblastic level of specialization found?", options:{A:"Phylum Platyhelminthes",B:"Phylum Nematode",C:"Phylum Annelida",D:"Phylum Coelenterate"}, correctAnswer:"D", subject:"Biology" },
  { questionText:"Seed-producing vascular plants belong to the _____.", options:{A:"Phylum Thallophyta",B:"Phylum Spermatophyte",C:"Phylum Pteridophyta",D:"Phylum Bryophyta"}, correctAnswer:"B", subject:"Biology" },
  { questionText:"The part of the mammalian alimentary system where protein is finally digested is _____.", options:{A:"Duodenum",B:"Jejunum",C:"Ileum",D:"Rectum"}, correctAnswer:"C", subject:"Biology" },
  { questionText:"When a cell is placed in a hypertonic solution, it will _____.", options:{A:"Retain its normal size",B:"Reduce in size",C:"Increase in size",D:"Burst"}, correctAnswer:"B", subject:"Biology" },
  { questionText:"An organism with an open transport system is _____.", options:{A:"Grasshopper",B:"Earthworm",C:"Rat",D:"Lizard"}, correctAnswer:"A", subject:"Biology" },
  { questionText:"Gaseous exchange in tadpoles takes place in the _____.", options:{A:"Lungs",B:"Gills",C:"Mouth",D:"Operculum"}, correctAnswer:"B", subject:"Biology" },
  { questionText:"In plants, the end product of breakdown of glucose in the absence of oxygen is _____.", options:{A:"Ethane",B:"Lactic acid",C:"Ethanol",D:"Pyruvic acid"}, correctAnswer:"C", subject:"Biology" },
  { questionText:"The red colour of petals in plants results from deposits of _____.", options:{A:"Resins",B:"Tannins",C:"Anthocyanins",D:"Oils"}, correctAnswer:"C", subject:"Biology" },
  { questionText:"Which of the following vertebrae is found in the waist of a man?", options:{A:"Caudal",B:"Cervical",C:"Sacral",D:"Lumbar"}, correctAnswer:"D", subject:"Biology" },
  { questionText:"The main feature of pentadactyl limbs is the presence of _____.", options:{A:"Five phalanges",B:"Three tarsals",C:"Four carpals",D:"Five metacarpals"}, correctAnswer:"A", subject:"Biology" },
  { questionText:"Which of the following produces secretions that help in controlling the level of calcium in the blood?", options:{A:"Gonad",B:"Parathyroid",C:"Pancreas",D:"Pituitary gland"}, correctAnswer:"B", subject:"Biology" },
  { questionText:"Edaphic ecological factors relate to _____.", options:{A:"Water",B:"Soil",C:"The topography",D:"The atmosphere"}, correctAnswer:"B", subject:"Biology" },
  { questionText:"The abiotic factor common to all habitats is _____.", options:{A:"Turbidity",B:"Salinity",C:"Rainfall",D:"Humidity"}, correctAnswer:"D", subject:"Biology" },
  { questionText:"The instrument used for measuring relative humidity is a _____.", options:{A:"Pooter",B:"pH meter",C:"Hygrometer",D:"Hydrometer"}, correctAnswer:"C", subject:"Biology" },
  { questionText:"Which of the following is an ectoparasite of a cow?", options:{A:"Housefly",B:"Ascaris",C:"Tick",D:"Taenia"}, correctAnswer:"C", subject:"Biology" },
  { questionText:"Excess carbon (IV) oxide in the atmosphere could lead to _____.", options:{A:"Global warming",B:"High rainfall",C:"Algal bloom",D:"Condensation"}, correctAnswer:"A", subject:"Biology" },
  { questionText:"Trees resistant to fire and drought are commonly found in the _____.", options:{A:"Tropical rainforest",B:"Savanna",C:"Desert",D:"Montane forest"}, correctAnswer:"B", subject:"Biology" },
  { questionText:"The function of ribosomes in cells is _____.", options:{A:"Protein synthesis",B:"Starch synthesis",C:"Transport of materials",D:"Lipid storage"}, correctAnswer:"A", subject:"Biology" },
  { questionText:"If the gall bladder of a mammal is damaged, which will be most seriously affected?", options:{A:"Glycolysis",B:"Digestion of starch",C:"Digestion of fats",D:"Digestion of protein"}, correctAnswer:"C", subject:"Biology" },
  { questionText:"In the mammalian respiratory system, exchange of gases occurs in the _____.", options:{A:"Lungs",B:"Bronchi",C:"Bronchioles",D:"Alveoli"}, correctAnswer:"D", subject:"Biology" },
  { questionText:"In mammals, the placenta performs functions similar to those of _____.", options:{A:"Lungs, kidney, and digestive system",B:"Lungs, heart and nervous system",C:"Liver, intestine and reproductive system",D:"Intestines, heart and digestive system"}, correctAnswer:"A", subject:"Biology" },
  // ── MATHEMATICS (Q81–87) ─────────────────────────────────────────
  { questionText:"Convert 35 to a number in base two.", options:{A:"1011 (base 2)",B:"10011 (base 2)",C:"100011 (base 2)",D:"110010 (base 2)"}, correctAnswer:"B", subject:"Mathematics" },
  { questionText:"Simplify (1/4) raised to the power of negative half.", options:{A:"8",B:"4",C:"1/4",D:"3/8"}, correctAnswer:"B", subject:"Mathematics" },
  { questionText:"A cloth measured as 6.10m but actual length is 6.35m. Find the percentage error to 2 decimal places.", options:{A:"3.05%",B:"3.94%",C:"15.00%",D:"25.00%"}, correctAnswer:"B", subject:"Mathematics" },
  { questionText:"Simplify: (8^(2/3) x 27^(-1/3)) / 64^(1/3)", options:{A:"-3",B:"1/9",C:"1/3",D:"27/8"}, correctAnswer:"C", subject:"Mathematics" },
  { questionText:"Solve the equation 5x² - 4x - 1 = 0", options:{A:"1 and 1/5",B:"-1 and 1/5",C:"1 and 1/5",D:"1 and -1/5"}, correctAnswer:"D", subject:"Mathematics" },
  { questionText:"Make S the subject of the formula V = K / sqrt(T - S)", options:{A:"S = (T - K²)/V²",B:"S = (K² - T)/V²",C:"S = (T - V²)/K²",D:"S = T(V² - K²)/V²"}, correctAnswer:"A", subject:"Mathematics" },
  { questionText:"For what values of X is the expression (x - 5)/(x² - 2x - 3) not defined?", options:{A:"3 and 1",B:"-1 and -3",C:"-1 and 3",D:"3 and -2"}, correctAnswer:"C", subject:"Mathematics" },
  // ── CHEMISTRY continued (Q88–100) ────────────────────────────────
  { questionText:"One of these professions has no need for Chemistry.", options:{A:"Miners",B:"Philosophers",C:"Engineers",D:"Geologists"}, correctAnswer:"B", subject:"Chemistry" },
  { questionText:"One of these is NOT a chemical change.", options:{A:"Sublimation of solids",B:"Rusting",C:"Slaking of quicklime",D:"Fermentation of glucose"}, correctAnswer:"A", subject:"Chemistry" },
  { questionText:"Which is the odd-one-out among Air, Sand, Urine, Blood?", options:{A:"Air",B:"Sand",C:"Urine",D:"Blood"}, correctAnswer:"A", subject:"Chemistry" },
  { questionText:"Method adopted in the separation of common salt (NaCl) from water is _____.", options:{A:"Evaporation",B:"Decantation",C:"Crystallization",D:"Sieving"}, correctAnswer:"C", subject:"Chemistry" },
  { questionText:"Fractional distillation is used to separate _____.", options:{A:"An insoluble substance from a soluble volatile substance",B:"Substances which differ in their solubilities in a solvent",C:"Gas, liquid or solid impurities from a mixture",D:"Liquids with differing boiling points"}, correctAnswer:"D", subject:"Chemistry" },
  { questionText:"A mixture of oil and water can be easily separated by _____.", options:{A:"Using a separating funnel",B:"Sublimation",C:"Evaporation to dryness",D:"Fractional crystallization"}, correctAnswer:"A", subject:"Chemistry" },
  { questionText:"The following are basic particles from which matter could be made EXCEPT _____.", options:{A:"Atom",B:"Ion",C:"Molecule",D:"Salt"}, correctAnswer:"D", subject:"Chemistry" },
  { questionText:"Atom is defined as _____.", options:{A:"The smallest part of an element which can take part in a chemical reaction.",B:"The smallest part of a molecule which can take part in a chemical reaction.",C:"The smallest part of a compound which can take part in a chemical reaction.",D:"The smallest part of a lattice which can take part in a chemical reaction."}, correctAnswer:"A", subject:"Chemistry" },
  { questionText:"Fractional crystallization is a method of separating _____.", options:{A:"Crude oil",B:"Liquid-liquid mixture",C:"Solids of different solubilities in a liquid",D:"Coal"}, correctAnswer:"C", subject:"Chemistry" },
  { questionText:"Fractional distillation is a method of separating _____.", options:{A:"Crude oil",B:"Liquid-liquid mixture",C:"Coal",D:"Solids of different solubilities in a liquid"}, correctAnswer:"A", subject:"Chemistry" },
  { questionText:"In paper and gas chromatography, the common feature between them is that they have _____.", options:{A:"Solid phase and moving phase",B:"Stationary phase and moving phase",C:"Long phase and stationary phase",D:"Chromatic phase and stationary phase"}, correctAnswer:"B", subject:"Chemistry" },
  { questionText:"Which of these requires crystallization most?", options:{A:"Drug making",B:"Cement making",C:"Paint making",D:"Perfume making"}, correctAnswer:"A", subject:"Chemistry" },
  { questionText:"From 12(6)Q and 13(6)Q, what phenomenon does Q show?", options:{A:"Isomerism",B:"Isotopy",C:"Allotropy",D:"Spectroscopy"}, correctAnswer:"B", subject:"Chemistry" },
];

export default async function handler(req, res) {
  if (req.query.secret !== 'nacon2021') {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  // 1. Sign in as admin
  try {
    await signInWithEmailAndPassword(auth, 'admin123@gmail.com', 'admin123@gmail.com');
  } catch (err) {
    return res.status(401).json({ error: 'Admin sign-in failed: ' + err.message });
  }

  // 2. Delete wrongly uploaded questions from `questions` collection
  let deleted = 0;
  try {
    const wrongSnap = await getDocs(query(
      collection(db, 'questions'),
      where('source', '==', 'NACON POST-UTME 2021 SET 47')
    ));
    const batch = writeBatch(db);
    wrongSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    deleted = wrongSnap.size;
  } catch (err) {
    // Continue even if delete fails
  }

  // 3. Find NACON school in entranceExamSchools (or use null if not created yet)
  let schoolId = null;
  let schoolName = 'NACON - Nigerian Army College of Nursing, Yaba';
  try {
    const schoolSnap = await getDocs(collection(db, 'entranceExamSchools'));
    const nacon = schoolSnap.docs.find(d => {
      const name = (d.data().name || '').toLowerCase();
      return name.includes('nacon') || name.includes('nigerian army') || name.includes('army college');
    });
    if (nacon) {
      schoolId = nacon.id;
      schoolName = nacon.data().name || schoolName;
    }
  } catch {}

  // 4. Upload to correct collection: entranceExamQuestions
  let success = 0, failed = 0, errors = [];

  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    try {
      await addDoc(collection(db, 'entranceExamQuestions'), {
        questionText:  q.questionText,
        options:       q.options,
        correctAnswer: q.correctAnswer,
        explanation:   '',
        diagramUrl:    '',
        questionType:  'text',
        schoolId:      schoolId,
        schoolName:    schoolName,
        year:          '2021',
        subject:       q.subject,
        active:        true,
        inDailyBank:   true,
        createdAt:     serverTimestamp(),
        updatedAt:     serverTimestamp(),
      });
      success++;
    } catch (err) {
      failed++;
      errors.push(`Q${i + 1}: ${err.message}`);
    }
  }

  return res.status(200).json({
    message: `Done! Deleted ${deleted} wrong questions. Uploaded ${success}/100 to entranceExamQuestions.`,
    deleted,
    success,
    failed,
    schoolId,
    schoolName,
    errors,
  });
}
