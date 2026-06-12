// api/upload-nacon.js — Vercel Serverless Function (v2: signs in as admin)
// Visit: https://nurses-nmcn-cbt.vercel.app/api/upload-nacon?secret=nacon2021
// DELETE this file after successful upload.

import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';

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
const db = getFirestore(app);

const QUESTIONS = [
  // ── ENGLISH LANGUAGE (Q1–20) ─────────────────────────────────────
  { question: "Why do you worry about such _____ matters?", options: ["Insignificant","Significant","Non-Significant","Unsignificant"], correctIndex: 0, subject: "English Language", topic: "Vocabulary" },
  { question: "It was difficult to _____ a man walking on the moon two centuries ago.", options: ["Contrive","Perceive","Conceive","Imagine"], correctIndex: 2, subject: "English Language", topic: "Vocabulary" },
  { question: "This section of the test will _____ questions on set passages.", options: ["Consist","Comprise","Contain","Carry"], correctIndex: 2, subject: "English Language", topic: "Vocabulary" },
  { question: "Animals in _____ behave differently from animals living in the natural habitat.", options: ["Prison","Bondage","Captivity","Slavery"], correctIndex: 2, subject: "English Language", topic: "Vocabulary" },
  { question: "After months of tedious climbing, the team reached the _____ of the mountain.", options: ["End","Summit","Height","Terminal"], correctIndex: 1, subject: "English Language", topic: "Vocabulary" },
  { question: "After Jerry had made the bed, he _____ on it.", options: ["Layed on it","Laid","Lied","Lay"], correctIndex: 3, subject: "English Language", topic: "Grammar" },
  { question: "Knowledge of figures of speech as well as idioms and lexical terms _____ in this section.", options: ["Is tested","Have been tested","Are tested","Were tested"], correctIndex: 0, subject: "English Language", topic: "Grammar" },
  { question: "The buildings damaged by the rainstorm _____ schools, hospitals and private houses.", options: ["Included","Include","Were included","Was including"], correctIndex: 0, subject: "English Language", topic: "Grammar" },
  { question: "I would have been off to see Amarachi at Aja by the time you _____ tomorrow.", options: ["Returned","Return","Are returning","Would return"], correctIndex: 1, subject: "English Language", topic: "Grammar" },
  { question: "The lecturer said that we _____ be able to finish the next chapter this evening.", options: ["Must","Can","Shall","Should"], correctIndex: 3, subject: "English Language", topic: "Grammar" },
  { question: "The official had allegedly been taking bribes. What does this sentence imply?", options: ["It was proved that the official had been taking bribes.","The official accused some people of taking bribes.","Some people accused the official of taking bribes.","The official had been taking bribes without feeling any guilt."], correctIndex: 2, subject: "English Language", topic: "Comprehension" },
  { question: "There's a door at either end of the building. What does this mean?", options: ["The building has two ends, but I do not know which of the two has a door.","The building has many ends with a door.","The building has two ends, but only one door.","The building has two ends and two doors."], correctIndex: 3, subject: "English Language", topic: "Comprehension" },
  { question: "He could not have rewarded them more handsomely. What does this mean?", options: ["He rewarded them very well.","He did not reward them very well.","He spoke to them in a very generous way.","He rewarded them well, and he is also a good-looking man."], correctIndex: 0, subject: "English Language", topic: "Comprehension" },
  { question: "There should be a playing field for women entering politics. What does this mean?", options: ["Sports facility should be provided for women entering politics.","Special privileges should be given to women entering politics.","Men and women should be able to compete in the political arena on equal basis.","Women should not be allowed to enter politics."], correctIndex: 2, subject: "English Language", topic: "Comprehension" },
  { question: "The woman won't have live through the night. What does this mean?", options: ["The woman survived her ordeal but not without some help.","The woman might have lived if she hadn't got right support.","It was likely the woman died before morning.","From all indications, the woman was taken much worse, though she overcame her ordeal."], correctIndex: 2, subject: "English Language", topic: "Comprehension" },
  { question: "My advice to Courtney was to look before she leap. What does this mean?", options: ["Courtney was advised to leap only after looking.","Courtney was advised to weigh her decision by looking and leaping.","Courtney was advised to consider her opinions before reaching any decisions.","Courtney was advised to consider the consequences before taking action."], correctIndex: 3, subject: "English Language", topic: "Comprehension" },
  { question: "Choose the option with the same stress pattern as: DOVETAIL", options: ["Proviso","Jargon","Simplicity","Psychiatry"], correctIndex: 1, subject: "English Language", topic: "Phonology" },
  { question: "Choose the option with the same stress pattern as: APPARENT", options: ["Paragraph","Arrested","Appetite","Telephone"], correctIndex: 1, subject: "English Language", topic: "Phonology" },
  { question: "Choose the option with the same stress pattern as: UNFAIR", options: ["First-class","Instant","Insight","Towards"], correctIndex: 3, subject: "English Language", topic: "Phonology" },
  { question: "Choose the option with the same vowel sound as the underlined letters in: HURT", options: ["Hate","Hut","Girl","Hot"], correctIndex: 1, subject: "English Language", topic: "Phonology" },
  // ── CHEMISTRY (Q21–40) ───────────────────────────────────────────
  { question: "The body contains how many percent of oxygen?", options: ["65%","18%","72%","80%"], correctIndex: 0, subject: "Chemistry", topic: "Biochemistry" },
  { question: "Which of the following is a poisonous gas that if inhaled reacts with haemoglobin in blood competing with oxygen?", options: ["CO2","CO","NO2","SO2"], correctIndex: 1, subject: "Chemistry", topic: "Inorganic Chemistry" },
  { question: "Which of the following chemical structures represents formaldehyde?", options: ["HCHO","CH3CHO","CH3COCH3","CH3CoCH2COOH"], correctIndex: 0, subject: "Chemistry", topic: "Organic Chemistry" },
  { question: "Oxygen taken into the lungs combines with haemoglobin in the blood to form _____.", options: ["Carboxyhaemoglobin","Hydroxyl heamin","Nitrohaemin","Oxyhaemoglobin"], correctIndex: 3, subject: "Chemistry", topic: "Biochemistry" },
  { question: "The normal pH of human blood is about?", options: ["6.5","5.5","7.4","8.5"], correctIndex: 2, subject: "Chemistry", topic: "Biochemistry" },
  { question: "Substances that resist changes in pH when either an acid or base is introduced into them are called _____.", options: ["Neutral substances","Acidic substances","Alkaline substances","Buffers"], correctIndex: 3, subject: "Chemistry", topic: "Physical Chemistry" },
  { question: "The air constitutes how many percentage of oxygen?", options: ["78%","50%","21%","45%"], correctIndex: 2, subject: "Chemistry", topic: "Inorganic Chemistry" },
  { question: "Which of the following scientists discovered oxygen?", options: ["Emil Fischer","Scheele","Dalton","Becquerel"], correctIndex: 1, subject: "Chemistry", topic: "Inorganic Chemistry" },
  { question: "One of the following is known as wood alcohol.", options: ["Ethyl alcohol","Methyl alcohol","Glycerol","Propane"], correctIndex: 1, subject: "Chemistry", topic: "Organic Chemistry" },
  { question: "Alcohols burn, thus forming carbon dioxide and _____.", options: ["CO","SO2","H2O","CO2"], correctIndex: 2, subject: "Chemistry", topic: "Organic Chemistry" },
  { question: "One of the following is a primary alcohol.", options: ["Butanol","Propan-2-ol","2-methyl propan-2-ol","180propyl alcohol"], correctIndex: 0, subject: "Chemistry", topic: "Organic Chemistry" },
  { question: "Which of the following contains three OH groups per molecule?", options: ["Tertiary alcohol","Secondary alcohol","Primary alcohol","Trihydric alcohol"], correctIndex: 3, subject: "Chemistry", topic: "Organic Chemistry" },
  { question: "The lower members of alkane series are _____.", options: ["Liquid","Gases","Solvent","Solids"], correctIndex: 1, subject: "Chemistry", topic: "Organic Chemistry" },
  { question: "In carbon monoxide poisoning, the tissues cannot obtain a sufficient supply of _____.", options: ["H2O","CO2","O2","N2"], correctIndex: 2, subject: "Chemistry", topic: "Inorganic Chemistry" },
  { question: "Automobile exhaust gas and many illuminating gases are poisonous because they contain _____.", options: ["N2","HCl","CO2","CO"], correctIndex: 3, subject: "Chemistry", topic: "Inorganic Chemistry" },
  { question: "The word halogen means _____.", options: ["Acid formers","Alkali formers","Salt formers","Water formers"], correctIndex: 2, subject: "Chemistry", topic: "Inorganic Chemistry" },
  { question: "One of the following is a halogen.", options: ["Na","Cl2","K","O2"], correctIndex: 1, subject: "Chemistry", topic: "Inorganic Chemistry" },
  { question: "Acid containing only two elements are called _____.", options: ["Temperature acid","Tertiary acid","Binary acid","Saturated acid"], correctIndex: 2, subject: "Chemistry", topic: "Inorganic Chemistry" },
  { question: "Which of the following is a salt?", options: ["HCl","H2SO4","HNO3","NaCl"], correctIndex: 3, subject: "Chemistry", topic: "Inorganic Chemistry" },
  { question: "Reaction in which water is one of the reacting compounds is called _____.", options: ["Condensation","Haemolysis","Hydrolysis","Catalysis"], correctIndex: 2, subject: "Chemistry", topic: "Physical Chemistry" },
  // ── PHYSICS (Q41–55) ─────────────────────────────────────────────
  { question: "Which of the following is most suitable for use as an altimeter?", options: ["A mercury barometer","A Fortin barometer","A mercury manometer","An aneroid barometer"], correctIndex: 3, subject: "Physics", topic: "Pressure" },
  { question: "A body weight W N rests on a smooth plane inclined at angle theta to the horizontal. What is the resolved part of the weight in Newtons along the plane?", options: ["W sin(theta)","W cos(theta)","W sec(theta)","W tan(theta)"], correctIndex: 0, subject: "Physics", topic: "Mechanics" },
  { question: "A small metal ball thrown vertically upwards from a tower with initial velocity 20m/s takes 6s to reach ground level. Determine the height of the tower. (g=10ms-2)", options: ["60m","80m","100m","120m"], correctIndex: 1, subject: "Physics", topic: "Mechanics" },
  { question: "An object moves with uniform speed round a circle. Its acceleration has _____.", options: ["Constant magnitude and constant direction","Constant magnitude and varying direction","Varying magnitude but constant direction","Varying magnitude and varying direction"], correctIndex: 1, subject: "Physics", topic: "Mechanics" },
  { question: "A body of mass 100g moving at 10.0 m/s collides with a wall and bounces back at 2m/s. Calculate the change in momentum.", options: ["0.8 Ns","1.2 Ns","12.0 Ns","80.0 Ns"], correctIndex: 1, subject: "Physics", topic: "Mechanics" },
  { question: "Find the tension T in a diagram where the system is in Equilibrium.", options: ["200/3 N","100/3 N","300/3 N","100 N"], correctIndex: 2, subject: "Physics", topic: "Mechanics" },
  { question: "A spring of force constant 1500 N/M acted upon by a constant force of 75N. Calculate the potential energy stored in the spring.", options: ["1.9 J","3.2 J","3.8 J","5.0 J"], correctIndex: 0, subject: "Physics", topic: "Energy" },
  { question: "A wheel and axle have radii 80cm and 10cm. Efficiency is 0.85 and applied force is 1200N. What load will it raise?", options: ["8.0N","6.8N","816N","9600.0N"], correctIndex: 2, subject: "Physics", topic: "Machines" },
  { question: "A body under a force with semi-circular force-displacement graph moves through 24 metres. What is the work done?", options: ["36 nJ","72 nJ","144 nJ","288 nJ"], correctIndex: 2, subject: "Physics", topic: "Energy" },
  { question: "A 20kg mass is pulled up a 30-degree slope with 75% efficiency. What force is required? (g=10ms-2)", options: ["13.3N","73.5N","133.3N","533.2N"], correctIndex: 2, subject: "Physics", topic: "Machines" },
  { question: "A spring balance is 25cm long with 5N and 30cm long with 10N. What is its length with 3N? (Hooke's Law)", options: ["15.0cm","17.0cm","20.0cm","23.0cm"], correctIndex: 3, subject: "Physics", topic: "Elasticity" },
  { question: "A stone weighs 15.0g in water and 10.0g in liquid of relative density 2.0. What is its mass in air?", options: ["5.0g","12.0g","20.0g","25.0g"], correctIndex: 3, subject: "Physics", topic: "Hydrostatics" },
  { question: "A pilot records 63cm Hg and ground observer records 75cm Hg. Calculate the height of the plane. (Relative density of Hg=13.0, density of air=0.00013)", options: ["1200m","6300m","7500cm","13800m"], correctIndex: 1, subject: "Physics", topic: "Pressure" },
  { question: "In which of the following is surface tension important?", options: ["The floating of a ship in water","The floating of a dry needle in water","The floating of a balloon in air","The diffusion of sugar solution across a membrane"], correctIndex: 1, subject: "Physics", topic: "Hydrostatics" },
  { question: "A thermometer registers -30S at ice point and 90S at steam point. What is the Celsius temperature for 60S?", options: ["25.0C","50.0C","66.7C","42C"], correctIndex: 2, subject: "Physics", topic: "Heat" },
  // ── BIOLOGY (Q56–80) ─────────────────────────────────────────────
  { question: "Growth in living things is brought about by the _____.", options: ["Deposition of new material from the surroundings","Synthesis of new material from within the body","Absorption of water and minerals","Elasticity of the cell"], correctIndex: 1, subject: "Biology", topic: "Cell Biology" },
  { question: "In unicellular organisms, the structure responsible for reproduction is the _____.", options: ["Cytoplasm","Lysosome","Mitochondrion","Nucleus"], correctIndex: 3, subject: "Biology", topic: "Cell Biology" },
  { question: "The head-foot is a structure mostly found in _____.", options: ["Mollusca","Reptile","Arthropoda","Amphibia"], correctIndex: 0, subject: "Biology", topic: "Classification of Living Things" },
  { question: "Which of the following flatworms is free-living?", options: ["Tapeworm","Planaria","Liverfluke","Ascaris"], correctIndex: 1, subject: "Biology", topic: "Classification of Living Things" },
  { question: "In which of the following is a diploblastic level of specialization found?", options: ["Phylum Platyhelminthes","Phylum Nematode","Phylum Annelida","Phylum Coelenterate"], correctIndex: 3, subject: "Biology", topic: "Classification of Living Things" },
  { question: "Seed-producing vascular plants belong to the _____.", options: ["Phylum Thallophyta","Phylum Spermatophyte","Phylum Pteridophyta","Phylum Bryophyta"], correctIndex: 1, subject: "Biology", topic: "Classification of Living Things" },
  { question: "The part of the mammalian alimentary system where protein is finally digested is _____.", options: ["Duodenum","Jejunum","Ileum","Rectum"], correctIndex: 2, subject: "Biology", topic: "Nutrition and Digestion" },
  { question: "When a cell is placed in a hypertonic solution, it will _____.", options: ["Retain its normal size","Reduce in size","Increase in size","Burst"], correctIndex: 1, subject: "Biology", topic: "Cell Biology" },
  { question: "An organism with an open transport system is _____.", options: ["Grasshopper","Earthworm","Rat","Lizard"], correctIndex: 0, subject: "Biology", topic: "Transport in Animals" },
  { question: "Gaseous exchange in tadpoles takes place in the _____.", options: ["Lungs","Gills","Mouth","Operculum"], correctIndex: 1, subject: "Biology", topic: "Gaseous Exchange" },
  { question: "In plants, the end product of breakdown of glucose in the absence of oxygen is _____.", options: ["Ethane","Lactic acid","Ethanol","Pyruvic acid"], correctIndex: 2, subject: "Biology", topic: "Respiration" },
  { question: "The red colour of petals in plants results from deposits of _____.", options: ["Resins","Tannins","Anthocyanins","Oils"], correctIndex: 2, subject: "Biology", topic: "Plant Biology" },
  { question: "Which of the following vertebrae is found in the waist of a man?", options: ["Caudal","Cervical","Sacral","Lumbar"], correctIndex: 3, subject: "Biology", topic: "Support and Movement" },
  { question: "The main feature of pentadactyl limbs is the presence of _____.", options: ["Five phalanges","Three tarsals","Four carpals","Five metacarpals"], correctIndex: 0, subject: "Biology", topic: "Support and Movement" },
  { question: "Which of the following produces secretions that help in controlling the level of calcium in the blood?", options: ["Gonad","Parathyroid","Pancreas","Pituitary gland"], correctIndex: 1, subject: "Biology", topic: "Endocrine System" },
  { question: "Edaphic ecological factors relate to _____.", options: ["Water","Soil","The topography","The atmosphere"], correctIndex: 1, subject: "Biology", topic: "Ecology" },
  { question: "The abiotic factor common to all habitats is _____.", options: ["Turbidity","Salinity","Rainfall","Humidity"], correctIndex: 3, subject: "Biology", topic: "Ecology" },
  { question: "The instrument used for measuring relative humidity is a _____.", options: ["Pooter","pH meter","Hygrometer","Hydrometer"], correctIndex: 2, subject: "Biology", topic: "Ecology" },
  { question: "Which of the following is an ectoparasite of a cow?", options: ["Housefly","Ascaris","Tick","Taenia"], correctIndex: 2, subject: "Biology", topic: "Ecology" },
  { question: "Excess carbon (IV) oxide in the atmosphere could lead to _____.", options: ["Global warming","High rainfall","Algal bloom","Condensation"], correctIndex: 0, subject: "Biology", topic: "Ecology" },
  { question: "Trees resistant to fire and drought are commonly found in the _____.", options: ["Tropical rainforest","Savanna","Desert","Montane forest"], correctIndex: 1, subject: "Biology", topic: "Ecology" },
  { question: "The function of ribosomes in cells is _____.", options: ["Protein synthesis","Starch synthesis","Transport of materials","Lipid storage"], correctIndex: 0, subject: "Biology", topic: "Cell Biology" },
  { question: "If the gall bladder of a mammal is damaged, which will be most seriously affected?", options: ["Glycolysis","Digestion of starch","Digestion of fats","Digestion of protein"], correctIndex: 2, subject: "Biology", topic: "Nutrition and Digestion" },
  { question: "In the mammalian respiratory system, exchange of gases occurs in the _____.", options: ["Lungs","Bronchi","Bronchioles","Alveoli"], correctIndex: 3, subject: "Biology", topic: "Gaseous Exchange" },
  { question: "In mammals, the placenta performs functions similar to those of _____.", options: ["Lungs, kidney, and digestive system","Lungs, heart and nervous system","Liver, intestine and reproductive system","Intestines, heart and digestive system"], correctIndex: 0, subject: "Biology", topic: "Reproduction" },
  // ── MATHEMATICS (Q81–87) ─────────────────────────────────────────
  { question: "Convert 35 to a number in base two.", options: ["1011 (base 2)","10011 (base 2)","100011 (base 2)","110010 (base 2)"], correctIndex: 1, subject: "Mathematics", topic: "Number Bases" },
  { question: "Simplify (1/4) raised to the power of negative half.", options: ["8","4","1/4","3/8"], correctIndex: 1, subject: "Mathematics", topic: "Indices" },
  { question: "A cloth measured as 6.10m but actual length is 6.35m. Find the percentage error to 2 decimal places.", options: ["3.05%","3.94%","15.00%","25.00%"], correctIndex: 1, subject: "Mathematics", topic: "Approximation and Error" },
  { question: "Simplify: (8^(2/3) x 27^(-1/3)) / 64^(1/3)", options: ["-3","1/9","1/3","27/8"], correctIndex: 2, subject: "Mathematics", topic: "Indices" },
  { question: "Solve the equation 5x² - 4x - 1 = 0", options: ["1 and 1/5","-1 and 1/5","1 and 1/5","1 and -1/5"], correctIndex: 3, subject: "Mathematics", topic: "Quadratic Equations" },
  { question: "Make S the subject of the formula V = K / sqrt(T - S)", options: ["S = (T - K²)/V²","S = (K² - T)/V²","S = (T - V²)/K²","S = T(V² - K²)/V²"], correctIndex: 0, subject: "Mathematics", topic: "Algebra" },
  { question: "For what values of X is the expression (x - 5)/(x² - 2x - 3) not defined?", options: ["3 and 1","-1 and -3","-1 and 3","3 and -2"], correctIndex: 2, subject: "Mathematics", topic: "Algebra" },
  // ── CHEMISTRY continued (Q88–100) ────────────────────────────────
  { question: "One of these professions has no need for Chemistry.", options: ["Miners","Philosophers","Engineers","Geologists"], correctIndex: 1, subject: "Chemistry", topic: "Introduction to Chemistry" },
  { question: "One of these is NOT a chemical change.", options: ["Sublimation of solids","Rusting","Slaking of quicklime","Fermentation of glucose"], correctIndex: 0, subject: "Chemistry", topic: "Physical Chemistry" },
  { question: "Which is the odd-one-out among Air, Sand, Urine, Blood?", options: ["Air","Sand","Urine","Blood"], correctIndex: 0, subject: "Chemistry", topic: "Separation Techniques" },
  { question: "Method adopted in the separation of common salt (NaCl) from water is _____.", options: ["Evaporation","Decantation","Crystallization","Sieving"], correctIndex: 2, subject: "Chemistry", topic: "Separation Techniques" },
  { question: "Fractional distillation is used to separate _____.", options: ["An insoluble substance from a soluble volatile substance","Substances which differ in their solubilities in a solvent","Gas, liquid or solid impurities from a mixture","Liquids with differing boiling points"], correctIndex: 3, subject: "Chemistry", topic: "Separation Techniques" },
  { question: "A mixture of oil and water can be easily separated by _____.", options: ["Using a separating funnel","Sublimation","Evaporation to dryness","Fractional crystallization"], correctIndex: 0, subject: "Chemistry", topic: "Separation Techniques" },
  { question: "The following are basic particles from which matter could be made EXCEPT _____.", options: ["Atom","Ion","Molecule","Salt"], correctIndex: 3, subject: "Chemistry", topic: "Atomic Structure" },
  { question: "Atom is defined as _____.", options: ["The smallest part of an element which can take part in a chemical reaction.","The smallest part of a molecule which can take part in a chemical reaction.","The smallest part of a compound which can take part in a chemical reaction.","The smallest part of a lattice which can take part in a chemical reaction."], correctIndex: 0, subject: "Chemistry", topic: "Atomic Structure" },
  { question: "Fractional crystallization is a method of separating _____.", options: ["Crude oil","Liquid-liquid mixture","Solids of different solubilities in a liquid","Coal"], correctIndex: 2, subject: "Chemistry", topic: "Separation Techniques" },
  { question: "Fractional distillation is a method of separating _____.", options: ["Crude oil","Liquid-liquid mixture","Coal","Solids of different solubilities in a liquid"], correctIndex: 0, subject: "Chemistry", topic: "Separation Techniques" },
  { question: "In paper and gas chromatography, the common feature between them is that they have _____.", options: ["Solid phase and moving phase","Stationary phase and moving phase","Long phase and stationary phase","Chromatic phase and stationary phase"], correctIndex: 1, subject: "Chemistry", topic: "Separation Techniques" },
  { question: "Which of these requires crystallization most?", options: ["Drug making","Cement making","Paint making","Perfume making"], correctIndex: 0, subject: "Chemistry", topic: "Separation Techniques" },
  { question: "From 12(6)Q and 13(6)Q, what phenomenon does Q show?", options: ["Isomerism","Isotopy","Allotropy","Spectroscopy"], correctIndex: 1, subject: "Chemistry", topic: "Atomic Structure" },
];

export default async function handler(req, res) {
  if (req.query.secret !== 'nacon2021') {
    return res.status(401).json({ error: 'Unauthorized. Add ?secret=nacon2021 to the URL.' });
  }

  // Sign in as admin
  try {
    await signInWithEmailAndPassword(auth, 'admin123@gmail.com', 'admin123@gmail.com');
  } catch (err) {
    return res.status(401).json({ error: 'Admin sign-in failed: ' + err.message });
  }

  let success = 0, failed = 0, errors = [];

  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    try {
      await addDoc(collection(db, 'questions'), {
        question:            q.question,
        options:             q.options,
        correctIndex:        q.correctIndex,
        explanation:         '',
        category:            'general_nursing',
        examType:            'daily_practice',
        year:                '2021',
        subject:             q.subject,
        topic:               q.topic || '',
        course:              '',
        difficulty:          'medium',
        source:              'NACON POST-UTME 2021 SET 47',
        tags:                [q.subject.toLowerCase(), 'entrance exam', 'nacon', '2021'],
        imageUrl:            '',
        explanationImageUrl: '',
        active:              true,
        inDailyBank:         true,
        createdAt:           serverTimestamp(),
        updatedAt:           serverTimestamp(),
      });
      success++;
    } catch (err) {
      failed++;
      errors.push(`Q${i + 1}: ${err.message}`);
    }
  }

  return res.status(200).json({
    message: `Upload complete: ${success} succeeded, ${failed} failed.`,
    success,
    failed,
    errors,
  });
}
