export type LessonForm = {
  form: string;
  meaning: string;
  difference: string;
};

export type WordLesson = {
  id: string;
  meaning: string;
  type: string;
  root: string;
  rootPicture: string;
  construction: string;
  components: { text: string; label: string; meaning: string }[];
  grammar: string;
  sentenceRole: string;
  recognitionClue: string;
  forms: LessonForm[];
  takeaway: string;
};

export type WordOccurrence = {
  id: string;
  position: number;
  arabic: string;
  transliteration: string;
  gloss: string;
  sharedLessonId?: string;
  lesson?: WordLesson;
  occurrenceRole?: string;
  sourceRoot?: string;
};

export type Ayah = {
  id: string;
  number: number;
  arabic: string;
  translation: string;
  naturalMeaning: string;
  words: WordOccurrence[];
  assembly: string[];
  sentenceMap: string[];
  drills: string[];
};

export type Surah = {
  number: number;
  name: string;
  arabicName: string;
  transliteration: string;
  englishLabel: string;
  ayahCount: number;
  status: "complete" | "source-only";
  description: string;
  ayahs: Ayah[];
};

const forms = (...items: LessonForm[]) => items;

const lesson = (
  id: string,
  meaning: string,
  type: string,
  root: string,
  rootPicture: string,
  construction: string,
  grammar: string,
  sentenceRole: string,
  recognitionClue: string,
  takeaway: string,
  items: LessonForm[],
  components: { text: string; label: string; meaning: string }[] = [],
): WordLesson => ({
  id,
  meaning,
  type,
  root,
  rootPicture,
  construction,
  components,
  grammar,
  sentenceRole,
  recognitionClue,
  forms: items,
  takeaway,
});

const normalizeArabicForm = (value: string) =>
  value.normalize("NFC").replace(/[\u0640\s]/g, "");

const normalizeArabicBase = (value: string) =>
  normalizeArabicForm(value).replace(/[\u064B-\u065F\u0670]/g, "");

const normalizeFormMeaning = (value: string) =>
  value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ");

export function orderLessonForms(lesson: WordLesson, word: WordOccurrence) {
  const target = normalizeArabicForm(word.arabic);
  const baseTarget = normalizeArabicBase(word.arabic);
  const gloss = normalizeFormMeaning(word.gloss);

  return lesson.forms
    .map((form, index) => {
      const candidate = normalizeArabicForm(form.form);
      const baseCandidate = normalizeArabicBase(form.form);
      const meaning = normalizeFormMeaning(form.meaning);
      const exactMatch = candidate === target;
      const boundaryMatch =
        candidate.startsWith(target) || target.startsWith(candidate);
      const baseExactMatch = baseCandidate === baseTarget;
      const baseBoundaryMatch =
        baseCandidate.startsWith(baseTarget) ||
        baseTarget.startsWith(baseCandidate);
      const basePartialMatch =
        baseCandidate.includes(baseTarget) ||
        baseTarget.includes(baseCandidate);
      const glossMatch = gloss
        .split(" ")
        .filter((term) => term.length > 2)
        .filter((term) => meaning.includes(term)).length;

      return {
        form,
        index,
        score:
          (exactMatch
            ? 12000
            : boundaryMatch
              ? 10000
              : baseExactMatch
                ? 9000
                : baseBoundaryMatch
                  ? 8000
                  : basePartialMatch
                    ? 7000
                    : 0) +
          Math.min(candidate.length, target.length) +
          glossMatch * 100,
      };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((item) => item.form);
}

const sharedLessons: Record<string, WordLesson> = {
  qul: lesson(
    "lesson:qul",
    "Say",
    "Command verb",
    "ق و ل",
    "say · speak · tell · state",
    "قُلْ",
    "A command addressed to one male; Arabic understands the ‘you’ from the verb form.",
    "Introduces what the Prophet ﷺ is commanded to declare.",
    "A command can contain its subject without a separate word for ‘you.’",
    "The root stays connected to speaking while the form tells us who speaks and whether it is a statement or command.",
    forms(
      { form: "قَالَ", meaning: "He said", difference: "past tense" },
      { form: "يَقُولُ", meaning: "He says", difference: "present tense" },
      { form: "نَقُولُ", meaning: "We say", difference: "نَ points to we" },
      { form: "قُلْ", meaning: "Say!", difference: "command to one male" },
    ),
  ),
  huwa: lesson(
    "lesson:huwa",
    "He",
    "Independent pronoun",
    "",
    "pointing to a male third person",
    "هُوَ",
    "This pronoun identifies the one being described before the sentence continues.",
    "Points to Allah before the descriptions that follow.",
    "هُوَ means ‘he’; هِيَ means ‘she.’",
    "Pronoun forms change according to who is being spoken about.",
    forms(
      { form: "أَنَا", meaning: "I", difference: "first-person singular" },
      { form: "أَنْتَ", meaning: "You", difference: "second-person masculine" },
      { form: "هُوَ", meaning: "He", difference: "third-person masculine" },
      { form: "هُمْ", meaning: "They", difference: "third-person plural" },
    ),
  ),
  allah: lesson(
    "lesson:allah",
    "Allah",
    "Proper name",
    "أ ل ه",
    "deity · worship · the One worshipped",
    "ٱللَّهُ",
    "This is Allah’s unique proper name. The ending here fits its position in the sentence.",
    "Names the One being described as uniquely One.",
    "The written proper name ٱللَّه is recognised as one complete name.",
    "Allah is the unique proper name; related words discuss deity or divinity but are not interchangeable with it.",
    forms(
      { form: "إِلَٰه", meaning: "a deity or god", difference: "common noun" },
      {
        form: "ٱلْإِلَٰه",
        meaning: "the deity",
        difference: "definite expression",
      },
      { form: "ٱللَّه", meaning: "Allah", difference: "unique proper name" },
      { form: "إِلَٰهِيّ", meaning: "divine", difference: "related adjective" },
    ),
  ),
  ahad: lesson(
    "lesson:ahad",
    "One · uniquely One",
    "Noun / adjective",
    "أ ح د",
    "one · single · unique · undivided",
    "أَحَدٌ",
    "Here the word describes Allah’s complete and unmatched oneness; in another context the same form can mean anyone.",
    "Gives the central description of the āyah.",
    "Context matters: أَحَد can mean ‘one,’ ‘anyone’ or ‘no one.’",
    "The root carries oneness while the sentence determines the exact nuance.",
    forms(
      {
        form: "أَحَد",
        meaning: "one / anyone",
        difference: "context determines sense",
      },
      { form: "وَاحِد", meaning: "one", difference: "ordinary counting" },
      {
        form: "وَحْدَهُ",
        meaning: "alone / by Himself",
        difference: "attached expression",
      },
    ),
  ),
  alSamed: lesson(
    "lesson:al-samad",
    "The One upon whom all depend",
    "Definite noun / title",
    "ص م د",
    "turn toward · depend upon · ultimate aim · firmness",
    "ٱلـ + صَّمَدُ",
    "The definite article makes the title specific. The root carries the picture of turning deliberately toward a goal or one depended upon.",
    "Describes Allah as the One all creation needs while He needs none.",
    "The opening ٱلـ gives the sense of ‘the.’",
    "The root picture centres on deliberate turning and dependence; the title identifies the ultimate One depended upon.",
    forms(
      {
        form: "صَمَدَ إِلَيْهِ",
        meaning: "He turned toward him",
        difference: "verbal expression",
      },
      {
        form: "صَمْد",
        meaning: "aim or direction",
        difference: "related noun",
      },
      {
        form: "ٱلصَّمَد",
        meaning: "the One all turn to",
        difference: "Qur’anic title",
      },
    ),
    [
      { text: "ٱلـ", label: "the", meaning: "makes the title definite" },
      {
        text: "صَّمَدُ",
        label: "the depended-upon One",
        meaning: "ultimate aim and support",
      },
    ],
  ),
  lam: lesson(
    "lesson:lam",
    "Did not / does not",
    "Negative grammar word",
    "",
    "completed negative action",
    "لَمْ",
    "It negates a following present-form verb and changes the ending of that verb.",
    "Negates the action that follows.",
    "A verb after لَمْ often ends with a still sound or another jussive change.",
    "Arabic uses different negative words depending on time and sentence structure.",
    forms(
      {
        form: "لَا",
        meaning: "not / does not",
        difference: "general or present negation",
      },
      { form: "لَنْ", meaning: "will not", difference: "future negation" },
      { form: "لَمْ", meaning: "did not", difference: "completed negative" },
      { form: "لَمَّا", meaning: "not yet", difference: "up to now" },
    ),
  ),
  yalid: lesson(
    "lesson:yalid",
    "He begets",
    "Present-form verb made jussive",
    "و ل د",
    "birth · child · parenthood · bring forth",
    "يَ + لِدْ",
    "The normal present form is يَلِدُ. After لَمْ, the ending becomes still: يَلِدْ.",
    "Names the first denied action.",
    "The root و ل د appears in words connected to birth, children and parents.",
    "The root stays connected to birth while the form shows the doer, time and sentence condition.",
    forms(
      { form: "وَلَدَ", meaning: "He begot", difference: "past active" },
      { form: "يَلِدُ", meaning: "He begets", difference: "present active" },
      {
        form: "يَلِدْ",
        meaning: "He beget after لَمْ",
        difference: "jussive ending",
      },
      {
        form: "مَوْلُود",
        meaning: "one born",
        difference: "passive-related noun",
      },
    ),
    [
      { text: "يَ", label: "he", meaning: "third-person masculine marker" },
      { text: "لِدْ", label: "beget", meaning: "birth-related action" },
    ],
  ),
  walam: lesson(
    "lesson:walam",
    "And did not",
    "Connector plus negative word",
    "",
    "joining a second negative clause",
    "وَ + لَمْ",
    "Arabic writes the connector directly onto the negative word.",
    "Connects the second denied action to the first.",
    "وَ attached to a word usually contributes ‘and.’",
    "A short attached connector changes how the negative statement joins what came before.",
    forms(
      { form: "لَمْ", meaning: "did not", difference: "without connector" },
      { form: "وَلَمْ", meaning: "and did not", difference: "وَ added" },
      { form: "فَلَمْ", meaning: "so did not", difference: "فَ added" },
    ),
    [
      { text: "وَ", label: "and", meaning: "joins the clause" },
      { text: "لَمْ", label: "did not", meaning: "negates the action" },
    ],
  ),
  yulad: lesson(
    "lesson:yulad",
    "He is born",
    "Passive present-form verb made jussive",
    "و ل د",
    "birth · child · parenthood · bring forth",
    "يُ + ولَدْ",
    "This is passive: the subject receives the action. After لَمْ, the ending becomes still.",
    "Names the second denied action.",
    "A vowel change inside a verb may switch it from active to passive.",
    "The active form describes producing offspring; the passive form describes being born.",
    forms(
      { form: "وَلَدَ", meaning: "He begot", difference: "past active" },
      { form: "وُلِدَ", meaning: "He was born", difference: "past passive" },
      { form: "يُولَدُ", meaning: "He is born", difference: "present passive" },
      {
        form: "يُولَدْ",
        meaning: "He be born after لَمْ",
        difference: "passive jussive",
      },
    ),
    [
      { text: "يُ", label: "passive he", meaning: "passive present opening" },
      { text: "ولَدْ", label: "born", meaning: "birth action received" },
    ],
  ),
  yakun: lesson(
    "lesson:yakun",
    "He / it was or existed",
    "Jussive present-form verb",
    "ك و ن",
    "be · exist · become · occur",
    "يَكُونُ → يَكُنْ",
    "The ordinary present form is يَكُونُ. After لَمْ, the long weak letter drops and the word becomes يَكُنْ.",
    "Forms the existence statement being denied.",
    "Weak-letter verbs may change internally after words such as لَمْ.",
    "The root carries being and existence while grammar can shorten the visible form.",
    forms(
      { form: "كَانَ", meaning: "He / it was", difference: "past" },
      { form: "يَكُونُ", meaning: "He / it is", difference: "present" },
      {
        form: "يَكُنْ",
        meaning: "He / it be after a jussive",
        difference: "weak letter removed",
      },
      { form: "كُنْ", meaning: "Be!", difference: "command" },
    ),
  ),
  lahu: lesson(
    "lesson:lahu",
    "For Him / belonging to Him",
    "Preposition with attached pronoun",
    "",
    "direction or belonging to a person",
    "لِ + هُ",
    "The preposition and pronoun join into one word. Together they mean ‘for Him’ or ‘belonging to Him.’",
    "Identifies Allah as the One to whom no equal can be assigned.",
    "Attached هُ often means ‘him’ or ‘his.’",
    "The preposition remains while the attached pronoun changes the person.",
    forms(
      { form: "لِي", meaning: "for me", difference: "ي = me" },
      { form: "لَنَا", meaning: "for us", difference: "نَا = us" },
      { form: "لَهُ", meaning: "for him", difference: "هُ = him" },
      { form: "لَهُمْ", meaning: "for them", difference: "هُمْ = them" },
    ),
    [
      { text: "لِ", label: "for / to", meaning: "preposition" },
      { text: "هُ", label: "Him", meaning: "attached pronoun" },
    ],
  ),
  kufuwan: lesson(
    "lesson:kufuwan",
    "Equal · comparable · equivalent",
    "Noun / adjective",
    "ك ف أ",
    "equal · match · counterpart",
    "كُفُوًا",
    "The word describes someone or something that could match or equal another. Its ending fits its role in this sentence.",
    "Names the type of equal that is completely denied.",
    "The root family concerns equivalence or suitability.",
    "The forms remain connected to matching and equivalence.",
    forms(
      {
        form: "كُفْء",
        meaning: "equal / match",
        difference: "common base form",
      },
      {
        form: "كُفُوًا",
        meaning: "an equal",
        difference: "sentence ending here",
      },
      { form: "أَكْفَاء", meaning: "equals / peers", difference: "plural" },
    ),
  ),
  audhu: lesson(
    "lesson:audhu",
    "I seek refuge",
    "First-person present verb",
    "ع و ذ",
    "seek shelter · hold fast · take refuge",
    "أَعُوذُ",
    "The opening أَ marks the first-person speaker. The verb expresses actively seeking protection.",
    "Begins the learner’s spoken request for refuge.",
    "أَ at the beginning of a present verb can point to ‘I.’",
    "The root gives the movement toward protection while the prefix identifies the speaker.",
    forms(
      { form: "عَاذَ", meaning: "He sought refuge", difference: "past" },
      { form: "أَعُوذُ", meaning: "I seek refuge", difference: "أَ = I" },
      { form: "نَعُوذُ", meaning: "We seek refuge", difference: "نَ = we" },
      {
        form: "مَعَاذ",
        meaning: "place of refuge",
        difference: "derived noun",
      },
    ),
    [{ text: "أَ", label: "I", meaning: "first-person marker" }],
  ),
  birabbi: lesson(
    "lesson:birabbi",
    "With / by my Lord",
    "Attached preposition and possessive noun",
    "ر ب ب",
    "raise · nurture · sustain · govern",
    "بِ + رَبِّ + ي",
    "The preposition بِ joins to ربّ, while the possessive ending is understood in the attached form used here.",
    "Names the source of protection being sought.",
    "A short attached preposition can change the relationship of the noun to the verb.",
    "The root picture of nurturing and sustaining makes رَبّ a rich word for Lord and caretaker.",
    forms(
      { form: "رَبّ", meaning: "Lord / nurturer", difference: "base noun" },
      { form: "بِرَبِّ", meaning: "by a Lord", difference: "بِ attached" },
      { form: "رَبِّي", meaning: "my Lord", difference: "ي = my" },
    ),
    [
      { text: "بِ", label: "with / by", meaning: "attached preposition" },
      { text: "رَبِّ", label: "Lord", meaning: "one who sustains" },
    ],
  ),
  malik: lesson(
    "lesson:malik",
    "King / Sovereign",
    "Noun in an iḍāfah phrase",
    "م ل ك",
    "rule · own · possess · have authority",
    "مَلِكِ + ٱلنَّاسِ",
    "مَلِكِ is the first noun in an iḍāfah phrase. Its kasrah links it to ٱلنَّاسِ, so the phrase means ‘King of humankind.’",
    "Names Allah as the Sovereign over humankind.",
    "The kasrah ending on مَلِكِ signals the first part of an ‘of’ relationship.",
    "The root carries authority and ownership; the ending shows how the noun connects to what follows.",
    forms(
      { form: "مَلِك", meaning: "king", difference: "base noun" },
      { form: "مَلِكِ", meaning: "King of…", difference: "iḍāfah ending" },
      { form: "مُلُوك", meaning: "kings", difference: "broken plural" },
    ),
    [
      {
        text: "مَلِك",
        label: "King",
        meaning: "the noun naming the sovereign",
      },
      {
        text: "ـِ",
        label: "of",
        meaning: "kasrah marks the first noun in the phrase",
      },
    ],
  ),
  ilah: lesson(
    "lesson:ilah",
    "God / deity",
    "Noun in an iḍāfah phrase",
    "أ ل ه",
    "worship · deity · turn toward the One worshipped",
    "إِلَٰهِ + ٱلنَّاسِ",
    "إِلَٰهِ is the first noun in an iḍāfah phrase. The kasrah is its genitive ending, while ٱلنَّاسِ is the possessor: ‘the God of humankind.’",
    "Names Allah as the true God belonging to no other object of worship.",
    "The kasrah on إِلَٰهِ helps show that the next noun supplies the ‘of humankind’ relationship.",
    "The root connects the word to worship and deity; the phrase makes the relationship clear.",
    forms(
      { form: "إِلَٰه", meaning: "a god / deity", difference: "base noun" },
      {
        form: "إِلَٰهِ ٱلنَّاس",
        meaning: "God of humankind",
        difference: "iḍāfah phrase",
      },
      {
        form: "آلِهَة",
        meaning: "gods / deities",
        difference: "broken plural",
      },
    ),
    [
      {
        text: "إِلَٰه",
        label: "God",
        meaning: "the head noun naming the deity",
      },
      { text: "ـِ", label: "of", meaning: "kasrah marks the genitive link" },
    ],
  ),
  nas: lesson(
    "lesson:nas",
    "Humankind / people",
    "Definite noun",
    "ن و س",
    "humanity · people · movement among people",
    "ٱلـ + نَّاس",
    "ٱلـ makes the word definite: ‘the people’ or ‘humankind.’ After مَلِكِ or إِلَٰهِ, its kasrah marks it as the second noun in an iḍāfah phrase: ‘of humankind.’",
    "Identifies the people protected, the people described by the titles, and the people whose chests are affected.",
    "The same word repeats across the sūrah; repetition is a recognition aid.",
    "The visible word stays stable while its sentence role shifts with each āyah.",
    forms(
      { form: "نَاس", meaning: "people", difference: "indefinite group" },
      { form: "ٱلنَّاس", meaning: "humankind", difference: "definite article" },
      {
        form: "وَٱلنَّاس",
        meaning: "and humankind",
        difference: "وَ attached",
      },
    ),
    [{ text: "ٱلـ", label: "the", meaning: "definite article" }],
  ),
  daybreak: lesson(
    "lesson:daybreak",
    "The daybreak",
    "Definite noun",
    "ف ل ق",
    "split · break open · emerge",
    "ٱلـ + فَلَق",
    "The definite noun names the dawn as the thing that breaks through darkness.",
    "Names the Lord of the emerging daybreak.",
    "The root image makes the word easier to remember: light splitting the dark.",
    "A root picture can be a memory hook without replacing the exact contextual meaning.",
    forms(
      { form: "فَلَق", meaning: "to split / break", difference: "verb family" },
      { form: "فَلَق", meaning: "daybreak", difference: "noun" },
      {
        form: "ٱلْفَلَق",
        meaning: "the daybreak",
        difference: "definite noun",
      },
    ),
  ),
  sharri: lesson(
    "lesson:sharri",
    "The evil / harm",
    "Definite noun with attached preposition",
    "ش ر ر",
    "badness · harm · evil",
    "مِنْ + شَرِّ",
    "مِنْ introduces the source or separation, and the noun is definite in meaning through the construction.",
    "Names the harm from which refuge is sought.",
    "مِنْ often carries ‘from’ and can be attached in pronunciation to what follows.",
    "The phrase is learned as a unit while the word remains available for comparison elsewhere.",
    forms(
      { form: "شَرّ", meaning: "evil / harm", difference: "base noun" },
      {
        form: "مِنْ شَرّ",
        meaning: "from the harm",
        difference: "preposition added",
      },
      {
        form: "شِرَار",
        meaning: "worst / evil ones",
        difference: "related plural",
      },
    ),
    [{ text: "مِنْ", label: "from", meaning: "source or separation" }],
  ),
  khalaqa: lesson(
    "lesson:khalaqa",
    "He created",
    "Past-tense verb",
    "خ ل ق",
    "create · shape · measure",
    "خَلَقَ",
    "The past form presents the creating as a completed action.",
    "Identifies the created things mentioned after the opening request.",
    "The final ـََ pattern is a familiar past-tense shape for a third-person masculine verb.",
    "A concrete action and a root picture work together: creating is bringing something into measured form.",
    forms(
      { form: "خَلَقَ", meaning: "He created", difference: "past" },
      { form: "يَخْلُقُ", meaning: "He creates", difference: "present" },
      { form: "خَلْق", meaning: "creation", difference: "verbal noun" },
    ),
  ),
  waswas: lesson(
    "lesson:waswas",
    "The whisperer / persistent whispering",
    "Definite intensive descriptive noun",
    "و س و س",
    "whisper · repeat secretly · hidden suggestion",
    "ٱلـ + وَسْوَاس",
    "The repeated root letters fit the repeated nature of whispering; the definite article identifies the particular whisperer.",
    "Identifies the source of the evil.",
    "Repeated root letters may appear in words connected to repeated action.",
    "The repeated root remains connected to whispering while the pattern gives the persistent sense.",
    forms(
      { form: "وَسْوَسَ", meaning: "He whispered", difference: "past verb" },
      {
        form: "يُوَسْوِسُ",
        meaning: "He whispers",
        difference: "present verb",
      },
      { form: "وَسْوَاسَة", meaning: "whispering", difference: "action noun" },
      {
        form: "ٱلْوَسْوَاس",
        meaning: "the whisperer",
        difference: "definite form",
      },
    ),
  ),
  khannas: lesson(
    "lesson:khannas",
    "The one who repeatedly retreats",
    "Definite intensive descriptive noun",
    "خ ن س",
    "withdraw · retreat · hide back",
    "ٱلـ + خَنَّاس",
    "The strengthened middle letter carries an intensive or repeated sense.",
    "Describes the whisperer as repeatedly retreating or hiding back.",
    "A strengthened middle letter can occur in intensive patterns.",
    "The root carries withdrawal while the pattern gives repeated or strong withdrawal.",
    forms(
      { form: "خَنَسَ", meaning: "He withdrew", difference: "past" },
      { form: "يَخْنِسُ", meaning: "He withdraws", difference: "present" },
      {
        form: "خَنَّاس",
        meaning: "one who repeatedly withdraws",
        difference: "intensive noun",
      },
    ),
  ),
  alladhi: lesson(
    "lesson:alladhi",
    "The one who / which",
    "Relative pronoun",
    "",
    "linking a noun to its description",
    "ٱلَّذِي",
    "This pronoun connects a person or thing to the description that follows.",
    "Introduces what the whisperer does.",
    "ٱلَّذِي frequently means ‘the one who’ or ‘which.’",
    "The meaning remains ‘the one who,’ while gender and number change the form.",
    forms(
      {
        form: "ٱلَّذِي",
        meaning: "the one who",
        difference: "masculine singular",
      },
      {
        form: "ٱلَّتِي",
        meaning: "the one who",
        difference: "feminine singular",
      },
      {
        form: "ٱلَّذِينَ",
        meaning: "those who",
        difference: "masculine or mixed plural",
      },
    ),
  ),
  yuwaswis: lesson(
    "lesson:yuwaswis",
    "He whispers",
    "Present-tense verb",
    "و س و س",
    "whisper · repeat secretly · hidden suggestion",
    "يُ + وَسْوِس",
    "The opening يُ identifies a third-person masculine present verb.",
    "Gives the action performed by the whisperer.",
    "The opening يُ often points to ‘he’ in a present verb.",
    "The repeating root remains while the opening changes who performs the present action.",
    forms(
      { form: "وَسْوَسَ", meaning: "He whispered", difference: "past" },
      {
        form: "يُوَسْوِسُ",
        meaning: "He whispers",
        difference: "present he form",
      },
      {
        form: "تُوَسْوِسُ",
        meaning: "You / she whispers",
        difference: "تَ prefix",
      },
      { form: "أُوَسْوِسُ", meaning: "I whisper", difference: "أَ prefix" },
    ),
    [{ text: "يُ", label: "he", meaning: "third-person marker" }],
  ),
  fi: lesson(
    "lesson:fi",
    "In",
    "Preposition",
    "",
    "location within something",
    "فِي",
    "The preposition locates the following noun as the place where something occurs.",
    "Identifies where the whispering takes place.",
    "فِي is a compact high-frequency word worth recognising on sight.",
    "Short grammar words become anchors for understanding longer Qur’anic phrases.",
    forms(
      { form: "فِي", meaning: "in", difference: "preposition" },
      { form: "فِيهِ", meaning: "in it", difference: "attached pronoun" },
      {
        form: "فِيهَا",
        meaning: "in her / it",
        difference: "feminine pronoun",
      },
    ),
  ),
  min: lesson(
    "lesson:min",
    "From / among",
    "Preposition",
    "",
    "No lexical root — a preposition marking source, separation or origin.",
    "مِنْ → مِنَ",
    "مِنْ introduces the source or group something comes from. The final vowel in مِنَ is a pronunciation adjustment before the next word.",
    "Introduces the harm or the group from which something comes.",
    "Recognise مِنْ / مِنَ as the compact word for ‘from’; its ending can change for easy pronunciation.",
    "Short grammar words do important structural work even though they do not carry a lexical root.",
    forms(
      { form: "مِنْ", meaning: "from", difference: "base preposition" },
      {
        form: "مِنَ",
        meaning: "from among",
        difference: "vowel before the next word",
      },
      {
        form: "مِنْهُ",
        meaning: "from him / it",
        difference: "attached pronoun",
      },
    ),
    [
      { text: "مِنْ", label: "from", meaning: "source or separation" },
      {
        text: "ـَ",
        label: "linking vowel",
        meaning: "helps pronunciation before the next word",
      },
    ],
  ),
  ma: lesson(
    "lesson:ma",
    "What / whatever",
    "Relative pronoun",
    "",
    "No lexical root — a pronoun referring to a thing or action without naming it.",
    "مَا",
    "مَا points to an unspecified thing or action. Here it means ‘what He created,’ linking the description to خَلَقَ.",
    "Introduces the created things without repeating a noun.",
    "مَا often means ‘what’ or ‘whatever’; the following clause explains what it refers to.",
    "Rootless grammar words are recognised by the job they do in the sentence.",
    forms(
      {
        form: "مَا",
        meaning: "what / whatever",
        difference: "relative pronoun",
      },
      {
        form: "مَنْ",
        meaning: "who / whoever",
        difference: "usually for people",
      },
      { form: "مَاذَا", meaning: "what?", difference: "question form" },
    ),
  ),
  ghasiq: lesson(
    "lesson:ghasiq",
    "Darkness / night",
    "Noun / active participle",
    "غ س ق",
    "grow dark · become deep night · enter darkness",
    "غَسَقَ → غَاسِقٍ",
    "غَاسِقٍ describes the dark or the thing becoming dark. Its tanwīn and kasrah fit its position after شَرِّ.",
    "Names the darkness whose harm is being described.",
    "The غَاسِق pattern points to something characterised by the action of becoming dark.",
    "The root picture makes the night’s descent vivid while the pattern turns the action into a describing noun.",
    forms(
      { form: "غَسَقَ", meaning: "it became dark", difference: "past verb" },
      {
        form: "غَاسِق",
        meaning: "dark / darkening",
        difference: "active participle",
      },
      {
        form: "غَاسِقٍ",
        meaning: "of darkness",
        difference: "case ending here",
      },
    ),
  ),
  idha: lesson(
    "lesson:idha",
    "When",
    "Time adverb / conditional connector",
    "",
    "No lexical root — a grammar word that introduces the time of an event.",
    "إِذَا + clause",
    "إِذَا opens a time clause: ‘when it settles’ or ‘when he envies.’ The following verb supplies the event.",
    "Introduces the time or condition in which the next action happens.",
    "When you see إِذَا, look to the following clause for the event being timed.",
    "The word has no lexical root to memorise; its sentence position is the clue.",
    forms(
      {
        form: "إِذَا",
        meaning: "when / whenever",
        difference: "time or condition",
      },
      { form: "إِذْ", meaning: "when", difference: "past-time connector" },
      { form: "مَتَى", meaning: "when?", difference: "question word" },
    ),
  ),
  waqaba: lesson(
    "lesson:waqaba",
    "It settles / enters",
    "Past-tense verb",
    "و ق ب",
    "enter · settle · fall into darkness",
    "وَقَبَ",
    "وَقَبَ is a completed action: the darkness settles or enters. إِذَا places that action inside a time clause.",
    "Completes the time clause introduced by إِذَا.",
    "The final ـَ pattern is a common past-tense shape for a third-person masculine verb.",
    "The root picture turns the image of night settling into a memorable verb.",
    forms(
      { form: "وَقَبَ", meaning: "it settled / entered", difference: "past" },
      { form: "يَقِبُ", meaning: "it settles / enters", difference: "present" },
      {
        form: "وَقْب",
        meaning: "entering / deepening",
        difference: "related noun",
      },
    ),
  ),
  naffathat: lesson(
    "lesson:naffathat",
    "Those who blow",
    "Intensive feminine plural active participle",
    "ن ف ث",
    "blow lightly · breathe onto · release breath",
    "ٱلـ + نَفَّاثَات",
    "The definite article marks the group as known, while the intensive pattern and feminine plural ending describe those who repeatedly blow.",
    "Names the group whose harm is being sought for protection from.",
    "Look for the repeated middle consonant and the ـَات ending of a feminine sound plural.",
    "The pattern keeps the action of blowing visible while the plural ending identifies a group.",
    forms(
      { form: "نَفَثَ", meaning: "he blew lightly", difference: "past verb" },
      {
        form: "نَفَّاث",
        meaning: "one who blows repeatedly",
        difference: "intensive singular",
      },
      {
        form: "ٱلنَّفَّاثَات",
        meaning: "those who blow",
        difference: "definite feminine plural",
      },
    ),
  ),
  uqad: lesson(
    "lesson:uqad",
    "The knots",
    "Definite broken plural noun",
    "ع ق د",
    "tie · bind · fasten · make a knot",
    "ٱلـ + عُقَد",
    "The definite article makes the knots specific. فِي places the knots as the location of the action.",
    "Names the objects on which the blowing is performed.",
    "عُقَد is the broken plural of عُقْدَة; the plural changes the internal vowels rather than adding a regular ending.",
    "The root picture of tying gives a concrete memory hook for the broken plural.",
    forms(
      { form: "عَقَدَ", meaning: "he tied", difference: "past verb" },
      { form: "عُقْدَة", meaning: "a knot", difference: "singular noun" },
      {
        form: "ٱلْعُقَد",
        meaning: "the knots",
        difference: "definite broken plural",
      },
    ),
  ),
  hasid: lesson(
    "lesson:hasid",
    "An envier",
    "Active participle",
    "ح س د",
    "envy · wish another’s blessing away",
    "حَسَدَ → حَاسِدٍ",
    "حَاسِدٍ names a person characterised by envy. Its tanwīn and kasrah fit its position after شَرِّ.",
    "Names the person whose envy is the source of harm.",
    "The ا after the first consonant is a familiar active-participle shape: one who performs the action.",
    "The root and participle pattern make the person and the action easy to connect.",
    forms(
      { form: "حَسَدَ", meaning: "he envied", difference: "past verb" },
      { form: "حَاسِد", meaning: "envier", difference: "active participle" },
      {
        form: "حَاسِدٍ",
        meaning: "of an envier",
        difference: "case ending here",
      },
    ),
  ),
  hasada: lesson(
    "lesson:hasada",
    "He envies",
    "Past-tense verb",
    "ح س د",
    "envy · wish another’s blessing away",
    "حَسَدَ",
    "حَسَدَ is the completed action inside the clause introduced by إِذَا: ‘when he envies.’",
    "Completes the time clause describing the envier’s action.",
    "The final ـَ pattern marks a completed third-person masculine action.",
    "The same root appears in حَاسِدٍ, connecting the person to the action.",
    forms(
      { form: "حَسَدَ", meaning: "he envied", difference: "past" },
      { form: "يَحْسُدُ", meaning: "he envies", difference: "present" },
      { form: "حَاسِد", meaning: "envier", difference: "active participle" },
    ),
  ),
  sudur: lesson(
    "lesson:sudur",
    "Chests · breasts",
    "Broken plural noun",
    "ص د ر",
    "chest · front · come forth · emerge",
    "صُدُور",
    "This is the broken plural of صَدْر. It follows فِي, so its ending reflects the preposition.",
    "Identifies where the whispering enters or occurs.",
    "صُدُور is a broken plural of صَدْر.",
    "The root family connects the chest or front with coming forth and origin, while patterns create different words.",
    forms(
      { form: "صَدْر", meaning: "chest", difference: "singular" },
      { form: "صُدُور", meaning: "chests", difference: "broken plural" },
      { form: "صَدَرَ", meaning: "he came forth", difference: "verb" },
      {
        form: "مَصْدَر",
        meaning: "source / origin",
        difference: "derived noun",
      },
    ),
  ),
  jinnah: lesson(
    "lesson:jinnah",
    "The jinn",
    "Definite collective noun",
    "ج ن ن",
    "hidden · covered · concealed · unseen",
    "ٱلـ + جِنَّة",
    "The root family carries hiddenness or covering. Here the word refers to jinn, normally hidden from human sight.",
    "Names the first group from which whisperers may come.",
    "The root ج ن ن often appears in words connected to hiding or covering.",
    "The shared root concerns hiddenness, but vowel patterns produce different related words.",
    forms(
      { form: "جِنّ", meaning: "jinn", difference: "common collective" },
      {
        form: "جِنَّة",
        meaning: "jinn in this form",
        difference: "related collective noun",
      },
      {
        form: "جَنَّة",
        meaning: "garden / Paradise",
        difference: "different vowels",
      },
      {
        form: "مَجْنُون",
        meaning: "one whose reason is covered",
        difference: "derived form",
      },
    ),
  ),
  conjunction: lesson(
    "lesson:wa",
    "And",
    "Attached connector",
    "",
    "joining two elements",
    "وَ + word",
    "The connector is written directly onto the following word.",
    "Adds the second group or clause.",
    "وَ attached to a word commonly contributes ‘and.’",
    "A small attached word can change the relationship between two otherwise familiar words.",
    forms(
      { form: "وَٱلنَّاس", meaning: "and humankind", difference: "وَ added" },
      { form: "فَٱلنَّاس", meaning: "so the people", difference: "فَ added" },
      { form: "بِٱلنَّاس", meaning: "with the people", difference: "بِ added" },
    ),
    [{ text: "وَ", label: "and", meaning: "connector" }],
  ),
};

const occurrence = (
  id: string,
  position: number,
  arabic: string,
  transliteration: string,
  gloss: string,
  sharedLessonId: string,
  occurrenceRole?: string,
): WordOccurrence => ({
  id,
  position,
  arabic,
  transliteration,
  gloss,
  sharedLessonId,
  occurrenceRole,
});

const ayah = (
  surah: number,
  number: number,
  arabic: string,
  translation: string,
  naturalMeaning: string,
  words: WordOccurrence[],
  assembly: string[],
  sentenceMap: string[],
  drills: string[],
): Ayah => ({
  id: `ayah:${surah}:${number}`,
  number,
  arabic,
  translation,
  naturalMeaning,
  words,
  assembly,
  sentenceMap,
  drills,
});

const sourceWords = (surah: number, ayahNumber: number, tokens: string[]) =>
  tokens.map((token, index) => ({
    id: `word:${surah}:${ayahNumber}:${index + 1}`,
    position: index + 1,
    arabic: token,
    transliteration: "source token",
    gloss: "Source text imported; custom teaching pending",
    sourceRoot: "Imported when available",
  }));

export const surahs: Surah[] = [
  {
    number: 109,
    name: "الكافرون",
    arabicName: "الكافرون",
    transliteration: "Al-Kāfirūn",
    englishLabel: "The Disbelievers",
    ayahCount: 6,
    status: "source-only",
    description:
      "Source text and word order are ready; the custom Word Tree is next to be authored.",
    ayahs: [
      ayah(
        109,
        1,
        "قُلْ يَا أَيُّهَا الْكَافِرُونَ",
        "Say, O disbelievers.",
        "Say: O you who reject faith.",
        sourceWords(109, 1, ["قُلْ", "يَا", "أَيُّهَا", "الْكَافِرُونَ"]),
        ["Say", "O", "you", "who reject"],
        ["Command", "Address", "Audience"],
        ["Which word is the command?", "Where does the address begin?"],
      ),
      ayah(
        109,
        2,
        "لَا أَعْبُدُ مَا تَعْبُدُونَ",
        "I do not worship what you worship.",
        "I do not worship what you worship.",
        sourceWords(109, 2, ["لَا", "أَعْبُدُ", "مَا", "تَعْبُدُونَ"]),
        ["I do not worship", "what", "you worship"],
        ["Negation", "Action", "Object"],
        ["Which word carries negation?"],
      ),
      ayah(
        109,
        3,
        "وَلَا أَنْتُمْ عَابِدُونَ مَا أَعْبُدُ",
        "Nor are you worshippers of what I worship.",
        "Nor are you worshipping what I worship.",
        sourceWords(109, 3, [
          "وَلَا",
          "أَنْتُمْ",
          "عَابِدُونَ",
          "مَا",
          "أَعْبُدُ",
        ]),
        ["And not", "you", "worshippers", "what", "I worship"],
        ["Connector", "Subject", "Description"],
        ["Spot the repeated worship root."],
      ),
      ayah(
        109,
        4,
        "وَلَا أَنَا عَابِدٌ مَا عَبَدْتُّمْ",
        "Nor will I worship what you have worshipped.",
        "Nor will I worship what you worshipped.",
        sourceWords(109, 4, [
          "وَلَا",
          "أَنَا",
          "عَابِدٌ",
          "مَا",
          "عَبَدْتُّمْ",
        ]),
        ["And not", "I", "a worshipper", "what", "you worshipped"],
        ["Negation", "Subject", "Past action"],
        ["Which pronoun marks I?"],
      ),
      ayah(
        109,
        5,
        "وَلَا أَنْتُمْ عَابِدُونَ مَا أَعْبُدُ",
        "Nor are you worshippers of what I worship.",
        "Nor are you worshipping what I worship.",
        sourceWords(109, 5, [
          "وَلَا",
          "أَنْتُمْ",
          "عَابِدُونَ",
          "مَا",
          "أَعْبُدُ",
        ]),
        ["And not", "you", "worshippers", "what", "I worship"],
        ["Repeated negation", "Subject", "Action"],
        ["What repeated pattern can you recognise?"],
      ),
      ayah(
        109,
        6,
        "لَكُمْ دِينُكُمْ وَلِيَ دِينِ",
        "For you is your religion, and for me is my religion.",
        "You have your way, and I have mine.",
        sourceWords(109, 6, ["لَكُمْ", "دِينُكُمْ", "وَلِيَ", "دِينِ"]),
        ["For you", "your religion", "and for me", "my religion"],
        ["For you", "possessive", "For me", "possessive"],
        ["Find the two attached pronouns."],
      ),
    ],
  },
  {
    number: 110,
    name: "النصر",
    arabicName: "النصر",
    transliteration: "Al-Naṣr",
    englishLabel: "The Divine Help",
    ayahCount: 3,
    status: "source-only",
    description:
      "Source text and word order are ready; the custom Word Tree is next to be authored.",
    ayahs: [
      ayah(
        110,
        1,
        "إِذَا جَاءَ نَصْرُ اللَّهِ وَالْفَتْحُ",
        "When the help of Allah and the victory come.",
        "When Allah’s help and the victory arrive.",
        sourceWords(110, 1, [
          "إِذَا",
          "جَاءَ",
          "نَصْرُ",
          "اللَّهِ",
          "وَالْفَتْحُ",
        ]),
        ["When", "came", "help", "of Allah", "and the victory"],
        ["Time", "Action", "Possession", "Addition"],
        ["Which word introduces time?"],
      ),
      ayah(
        110,
        2,
        "وَرَأَيْتَ النَّاسَ يَدْخُلُونَ فِي دِينِ اللَّهِ أَفْوَاجًا",
        "And you see the people entering the religion of Allah in crowds.",
        "You see people entering Allah’s way in groups.",
        sourceWords(110, 2, [
          "وَرَأَيْتَ",
          "النَّاسَ",
          "يَدْخُلُونَ",
          "فِي",
          "دِينِ",
          "اللَّهِ",
          "أَفْوَاجًا",
        ]),
        [
          "And you see",
          "the people",
          "entering",
          "in",
          "religion",
          "of Allah",
          "groups",
        ],
        ["Seeing", "People", "Entering", "Location", "Possession", "Manner"],
        ["Which word means in?"],
      ),
      ayah(
        110,
        3,
        "فَسَبِّحْ بِحَمْدِ رَبِّكَ وَاسْتَغْفِرْهُ إِنَّهُ كَانَ تَوَّابًا",
        "So glorify your Lord with praise and seek His forgiveness.",
        "Glorify your Lord, praise Him and ask His forgiveness.",
        sourceWords(110, 3, [
          "فَسَبِّحْ",
          "بِحَمْدِ",
          "رَبِّكَ",
          "وَاسْتَغْفِرْهُ",
          "إِنَّهُ",
          "كَانَ",
          "تَوَّابًا",
        ]),
        [
          "So glorify",
          "with praise",
          "your Lord",
          "and seek forgiveness",
          "indeed He",
          "was",
          "ever-returning",
        ],
        [
          "Instruction",
          "Means",
          "Possession",
          "Second instruction",
          "Emphasis",
          "Description",
        ],
        ["Find the two commands."],
      ),
    ],
  },
  {
    number: 111,
    name: "المسد",
    arabicName: "المسد",
    transliteration: "Al-Masad",
    englishLabel: "The Palm Fibre",
    ayahCount: 5,
    status: "source-only",
    description:
      "Source text and word order are ready; the custom Word Tree is next to be authored.",
    ayahs: [
      ayah(
        111,
        1,
        "تَبَّتْ يَدَا أَبِي لَهَبٍ وَتَبَّ",
        "May the hands of Abū Lahab perish, and perish he.",
        "Perished are the hands of Abū Lahab, and he perished.",
        sourceWords(111, 1, ["تَبَّتْ", "يَدَا", "أَبِي", "لَهَبٍ", "وَتَبَّ"]),
        ["Perished", "the hands", "of Abū", "Lahab", "and he perished"],
        ["Outcome", "Subject", "Possession", "Name", "Repetition"],
        ["What repeats in the āyah?"],
      ),
      ayah(
        111,
        2,
        "مَا أَغْنَىٰ عَنْهُ مَالُهُ وَمَا كَسَبَ",
        "His wealth and what he earned will not avail him.",
        "His wealth and earnings cannot help him.",
        sourceWords(111, 2, [
          "مَا",
          "أَغْنَىٰ",
          "عَنْهُ",
          "مَالُهُ",
          "وَمَا",
          "كَسَبَ",
        ]),
        ["Not", "availed", "him", "his wealth", "and what", "he earned"],
        ["Negation", "Action", "Object", "Possession", "Addition", "Action"],
        ["Find the two possessive endings."],
      ),
      ayah(
        111,
        3,
        "سَيَصْلَىٰ نَارًا ذَاتَ لَهَبٍ",
        "He will burn in a flaming fire.",
        "He will enter a fire of flame.",
        sourceWords(111, 3, ["سَيَصْلَىٰ", "نَارًا", "ذَاتَ", "لَهَبٍ"]),
        ["He will burn", "a fire", "possessing", "flame"],
        ["Future", "Object", "Description", "Image"],
        ["Which prefix points to future?"],
      ),
      ayah(
        111,
        4,
        "وَامْرَأَتُهُ حَمَّالَةَ الْحَطَبِ",
        "And his wife, the carrier of firewood.",
        "And his wife carries the firewood.",
        sourceWords(111, 4, ["وَامْرَأَتُهُ", "حَمَّالَةَ", "الْحَطَبِ"]),
        ["And his wife", "carrier", "the firewood"],
        ["Connector", "Intensive noun", "Object"],
        ["What does the attached هُ show?"],
      ),
      ayah(
        111,
        5,
        "فِي جِيدِهَا حَبْلٌ مِّن مَّسَدٍ",
        "Around her neck is a rope of palm fibre.",
        "On her neck is a rope of twisted fibre.",
        sourceWords(111, 5, ["فِي", "جِيدِهَا", "حَبْلٌ", "مِّن", "مَّسَدٍ"]),
        ["On", "her neck", "a rope", "of", "palm fibre"],
        ["Location", "Possession", "Subject", "Material", "Description"],
        ["Which words are prepositions?"],
      ),
    ],
  },
  {
    number: 112,
    name: "الإخلاص",
    arabicName: "الإخلاص",
    transliteration: "Al-Ikhlāṣ",
    englishLabel: "Sincerity / Purity of Faith",
    ayahCount: 4,
    status: "complete",
    description:
      "A complete starter Word Tree: whole word first, components second, pattern last.",
    ayahs: [
      ayah(
        112,
        1,
        "قُلْ هُوَ ٱللَّهُ أَحَدٌ",
        "Say: He is Allah, uniquely One.",
        "Say: He is Allah, uniquely One.",
        [
          occurrence("word:112:1:1", 1, "قُلْ", "Qul", "Say", "qul"),
          occurrence("word:112:1:2", 2, "هُوَ", "Huwa", "He", "huwa"),
          occurrence("word:112:1:3", 3, "ٱللَّهُ", "Allāhu", "Allah", "allah"),
          occurrence(
            "word:112:1:4",
            4,
            "أَحَدٌ",
            "Aḥad",
            "uniquely One",
            "ahad",
          ),
        ],
        ["Say", "He", "Allah", "uniquely One"],
        ["Command", "Pronoun", "The One named", "His description"],
        [
          "Which word is the command?",
          "Which root carries the idea of oneness?",
          "Put the four words in Qur’anic order.",
        ],
      ),
      ayah(
        112,
        2,
        "ٱللَّهُ ٱلصَّمَدُ",
        "Allah, the One upon whom all depend.",
        "Allah, the One upon whom all depend.",
        [
          occurrence(
            "word:112:2:1",
            1,
            "ٱللَّهُ",
            "Allāhu",
            "Allah",
            "allah",
            "Begins the second declaration.",
          ),
          occurrence(
            "word:112:2:2",
            2,
            "ٱلصَّمَدُ",
            "Al-Ṣamad",
            "the One all depend upon",
            "alSamed",
          ),
        ],
        ["Allah", "the One all depend upon"],
        ["Name", "Definite title"],
        ["What does ٱلـ contribute?", "What broad picture does ص م د carry?"],
      ),
      ayah(
        112,
        3,
        "لَمْ يَلِدْ وَلَمْ يُولَدْ",
        "He neither begets nor is born.",
        "He neither begets nor is born.",
        [
          occurrence("word:112:3:1", 1, "لَمْ", "Lam", "did not", "lam"),
          occurrence(
            "word:112:3:2",
            2,
            "يَلِدْ",
            "Yalid",
            "He begets",
            "yalid",
          ),
          occurrence(
            "word:112:3:3",
            3,
            "وَلَمْ",
            "Wa-lam",
            "and did not",
            "walam",
          ),
          occurrence(
            "word:112:3:4",
            4,
            "يُولَدْ",
            "Yūlad",
            "He is born",
            "yulad",
          ),
        ],
        ["Did not", "He beget", "and did not", "He be born"],
        ["Negation", "Active action", "Connected negation", "Passive action"],
        [
          "Which word is active?",
          "Which word is passive?",
          "What does وَ add to لَمْ?",
        ],
      ),
      ayah(
        112,
        4,
        "وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌ",
        "And there has never been anyone comparable to Him.",
        "There has never been anyone comparable to Him.",
        [
          occurrence(
            "word:112:4:1",
            1,
            "وَلَمْ",
            "Wa-lam",
            "and did not",
            "walam",
          ),
          occurrence("word:112:4:2", 2, "يَكُن", "Yakun", "there be", "yakun"),
          occurrence("word:112:4:3", 3, "لَّهُۥ", "Lahu", "for Him", "lahu"),
          occurrence(
            "word:112:4:4",
            4,
            "كُفُوًا",
            "Kufuwan",
            "an equal",
            "kufuwan",
          ),
          occurrence(
            "word:112:4:5",
            5,
            "أَحَدٌ",
            "Aḥad",
            "anyone",
            "ahad",
            "Same visible word as 112:1; context changes the natural meaning.",
          ),
        ],
        ["And did not", "there be", "for Him", "any equal", "anyone"],
        [
          "Continued negation",
          "Existence denied",
          "For Him",
          "Comparable equal",
          "Anyone at all",
        ],
        [
          "What is the underlying form of يَكُن?",
          "Which part of لَهُ means Him?",
          "Why does أَحَد have a different meaning here?",
        ],
      ),
    ],
  },
  {
    number: 113,
    name: "الفلق",
    arabicName: "الفلق",
    transliteration: "Al-Falaq",
    englishLabel: "The Daybreak",
    ayahCount: 5,
    status: "complete",
    description:
      "A complete starter Word Tree built around refuge, roots, attached words and repeated patterns.",
    ayahs: [
      ayah(
        113,
        1,
        "قُلْ أَعُوذُ بِرَبِّ ٱلْفَلَقِ",
        "Say: I seek refuge in the Lord of daybreak.",
        "Say: I seek refuge in the Lord of the daybreak.",
        [
          occurrence("word:113:1:1", 1, "قُلْ", "Qul", "Say", "qul"),
          occurrence(
            "word:113:1:2",
            2,
            "أَعُوذُ",
            "Aʿūdhu",
            "I seek refuge",
            "audhu",
          ),
          occurrence(
            "word:113:1:3",
            3,
            "بِرَبِّ",
            "Bi-rabbi",
            "with my Lord",
            "birabbi",
          ),
          occurrence(
            "word:113:1:4",
            4,
            "ٱلْفَلَقِ",
            "Al-falaq",
            "the daybreak",
            "daybreak",
          ),
        ],
        ["Say", "I seek refuge", "with my Lord", "the daybreak"],
        ["Command", "Speaker", "Source of protection", "Daybreak image"],
        [
          "Which prefix points to I?",
          "What does بِ contribute?",
          "What picture does ف ل ق carry?",
        ],
      ),
      ayah(
        113,
        2,
        "مِن شَرِّ مَا خَلَقَ",
        "From the evil of what He created.",
        "From the harm in what He created.",
        [
          occurrence("word:113:2:1", 1, "مِن", "Min", "from", "min"),
          occurrence(
            "word:113:2:2",
            2,
            "شَرِّ",
            "Sharr",
            "harm / evil",
            "sharri",
          ),
          occurrence("word:113:2:3", 3, "مَا", "Mā", "what", "ma"),
          occurrence(
            "word:113:2:4",
            4,
            "خَلَقَ",
            "Khalaqa",
            "He created",
            "khalaqa",
          ),
        ],
        ["From", "the harm", "of what", "He created"],
        ["Source", "Harm", "Object", "Completed action"],
        ["Which word means from?", "Which word names the created things?"],
      ),
      ayah(
        113,
        3,
        "وَمِن شَرِّ غَاسِقٍ إِذَا وَقَبَ",
        "And from the evil of darkness when it settles.",
        "From the harm of the night as it descends.",
        [
          occurrence(
            "word:113:3:1",
            1,
            "وَمِن",
            "Wa-min",
            "and from",
            "conjunction",
          ),
          occurrence(
            "word:113:3:2",
            2,
            "شَرِّ",
            "Sharr",
            "harm / evil",
            "sharri",
          ),
          occurrence(
            "word:113:3:3",
            3,
            "غَاسِقٍ",
            "Ghāsiq",
            "darkness",
            "ghasiq",
          ),
          occurrence("word:113:3:4", 4, "إِذَا", "Idhā", "when", "idha"),
          occurrence(
            "word:113:3:5",
            5,
            "وَقَبَ",
            "Waqaba",
            "it settles",
            "waqaba",
          ),
        ],
        ["And from", "the harm", "of darkness", "when", "it settles"],
        ["Connector", "Source", "Night", "Time", "Action"],
        ["Which word repeats from 113:2?", "Which word introduces time?"],
      ),
      ayah(
        113,
        4,
        "وَمِن شَرِّ ٱلنَّفَّاثَاتِ فِي ٱلْعُقَدِ",
        "And from the evil of those who blow on knots.",
        "From the harm of those who blow on knots.",
        [
          occurrence(
            "word:113:4:1",
            1,
            "وَمِن",
            "Wa-min",
            "and from",
            "conjunction",
          ),
          occurrence(
            "word:113:4:2",
            2,
            "شَرِّ",
            "Sharr",
            "harm / evil",
            "sharri",
          ),
          occurrence(
            "word:113:4:3",
            3,
            "ٱلنَّفَّاثَاتِ",
            "Al-naffāthāt",
            "those who blow",
            "naffathat",
          ),
          occurrence("word:113:4:4", 4, "فِي", "Fī", "in", "fi"),
          occurrence(
            "word:113:4:5",
            5,
            "ٱلْعُقَدِ",
            "Al-ʿuqad",
            "the knots",
            "uqad",
          ),
        ],
        ["And from", "the harm", "those who blow", "in", "the knots"],
        ["Connector", "Source", "Intensive action", "Location", "Object"],
        ["Which word means in?", "What does the repeated pattern suggest?"],
      ),
      ayah(
        113,
        5,
        "وَمِن شَرِّ حَاسِدٍ إِذَا حَسَدَ",
        "And from the evil of an envier when he envies.",
        "From the harm of the envier when envy acts.",
        [
          occurrence(
            "word:113:5:1",
            1,
            "وَمِن",
            "Wa-min",
            "and from",
            "conjunction",
          ),
          occurrence(
            "word:113:5:2",
            2,
            "شَرِّ",
            "Sharr",
            "harm / evil",
            "sharri",
          ),
          occurrence(
            "word:113:5:3",
            3,
            "حَاسِدٍ",
            "Ḥāsid",
            "an envier",
            "hasid",
          ),
          occurrence("word:113:5:4", 4, "إِذَا", "Idhā", "when", "idha"),
          occurrence(
            "word:113:5:5",
            5,
            "حَسَدَ",
            "Ḥasada",
            "he envies",
            "hasada",
          ),
        ],
        ["And from", "the harm", "of an envier", "when", "he envies"],
        ["Connector", "Source", "Person", "Time", "Action"],
        ["Which words share the حسد root?", "What does إِذَا introduce?"],
      ),
    ],
  },
  {
    number: 114,
    name: "الناس",
    arabicName: "الناس",
    transliteration: "Al-Nās",
    englishLabel: "Humankind",
    ayahCount: 6,
    status: "complete",
    description:
      "A complete starter Word Tree with repeated words, sentence roles and a final recognition recap.",
    ayahs: [
      ayah(
        114,
        1,
        "قُلْ أَعُوذُ بِرَبِّ ٱلنَّاسِ",
        "Say: I seek refuge in the Lord of humankind.",
        "Say: I seek refuge in the Lord of humankind.",
        [
          occurrence("word:114:1:1", 1, "قُلْ", "Qul", "Say", "qul"),
          occurrence(
            "word:114:1:2",
            2,
            "أَعُوذُ",
            "Aʿūdhu",
            "I seek refuge",
            "audhu",
          ),
          occurrence(
            "word:114:1:3",
            3,
            "بِرَبِّ",
            "Bi-rabbi",
            "with my Lord",
            "birabbi",
          ),
          occurrence(
            "word:114:1:4",
            4,
            "ٱلنَّاسِ",
            "Al-nās",
            "humankind",
            "nas",
          ),
        ],
        ["Say", "I seek refuge", "with my Lord", "humankind"],
        ["Command", "Speaker", "Source", "People protected"],
        ["Which word repeats in 114:2 and 114:3?", "What does بِ contribute?"],
      ),
      ayah(
        114,
        2,
        "مَلِكِ ٱلنَّاسِ",
        "The King of humankind.",
        "The King of humankind.",
        [
          occurrence("word:114:2:1", 1, "مَلِكِ", "Malik", "King", "malik"),
          occurrence(
            "word:114:2:2",
            2,
            "ٱلنَّاسِ",
            "Al-nās",
            "humankind",
            "nas",
            "Seen in 114:1.",
          ),
        ],
        ["King", "of humankind"],
        ["Title", "Possessive relationship"],
        ["Find the repeated word."],
      ),
      ayah(
        114,
        3,
        "إِلَٰهِ ٱلنَّاسِ",
        "The God of humankind.",
        "The God of humankind.",
        [
          occurrence("word:114:3:1", 1, "إِلَٰهِ", "Ilāh", "God", "ilah"),
          occurrence(
            "word:114:3:2",
            2,
            "ٱلنَّاسِ",
            "Al-nās",
            "humankind",
            "nas",
            "Seen in 114:1 and 114:2.",
          ),
        ],
        ["God", "of humankind"],
        ["Name", "Possessive relationship"],
        [
          "Which three descriptions appear in 114:1–3?",
          "What remains recognisable in ٱلنَّاسِ?",
        ],
      ),
      ayah(
        114,
        4,
        "مِن شَرِّ ٱلْوَسْوَاسِ ٱلْخَنَّاسِ",
        "From the evil of the retreating whisperer.",
        "From the evil of the whisperer who repeatedly retreats.",
        [
          occurrence("word:114:4:1", 1, "مِن", "Min", "from", "min"),
          occurrence(
            "word:114:4:2",
            2,
            "شَرِّ",
            "Sharr",
            "harm / evil",
            "sharri",
          ),
          occurrence(
            "word:114:4:3",
            3,
            "ٱلْوَسْوَاسِ",
            "Al-waswās",
            "the whisperer",
            "waswas",
          ),
          occurrence(
            "word:114:4:4",
            4,
            "ٱلْخَنَّاسِ",
            "Al-khannās",
            "the retreating one",
            "khannas",
          ),
        ],
        ["From", "the harm", "the whisperer", "the retreating one"],
        ["Source", "Harm", "Whisperer", "Description"],
        [
          "Which root repeats its letters?",
          "Which word describes retreat?",
          "What does ٱلـ add?",
        ],
      ),
      ayah(
        114,
        5,
        "ٱلَّذِي يُوَسْوِسُ فِي صُدُورِ ٱلنَّاسِ",
        "The one who whispers in the chests of humankind.",
        "The one who whispers in the chests of humankind.",
        [
          occurrence(
            "word:114:5:1",
            1,
            "ٱلَّذِي",
            "Al-ladhī",
            "the one who",
            "alladhi",
          ),
          occurrence(
            "word:114:5:2",
            2,
            "يُوَسْوِسُ",
            "Yuwaswis",
            "he whispers",
            "yuwaswis",
          ),
          occurrence("word:114:5:3", 3, "فِي", "Fī", "in", "fi"),
          occurrence("word:114:5:4", 4, "صُدُورِ", "Ṣudūr", "chests", "sudur"),
          occurrence(
            "word:114:5:5",
            5,
            "ٱلنَّاسِ",
            "Al-nās",
            "humankind",
            "nas",
            "Seen in 114:1, 114:2 and 114:3.",
          ),
        ],
        ["The one who", "he whispers", "in", "chests", "humankind"],
        ["Relative pronoun", "Action", "Location", "Place", "People affected"],
        [
          "Which word means the one who?",
          "Which prefix points to he?",
          "What is the singular of صُدُور؟",
        ],
      ),
      ayah(
        114,
        6,
        "مِنَ ٱلْجِنَّةِ وَٱلنَّاسِ",
        "From among jinn and humankind.",
        "From among the jinn and humankind.",
        [
          occurrence("word:114:6:1", 1, "مِنَ", "Mina", "from among", "min"),
          occurrence(
            "word:114:6:2",
            2,
            "ٱلْجِنَّةِ",
            "Al-jinnah",
            "the jinn",
            "jinnah",
          ),
          occurrence(
            "word:114:6:3",
            3,
            "وَٱلنَّاسِ",
            "Wa-al-nās",
            "and humankind",
            "conjunction",
          ),
        ],
        ["From among", "the jinn", "and humankind"],
        ["Source", "Hidden group", "Added group"],
        [
          "Why does مِنَ have a final vowel here?",
          "Which root carries hiddenness?",
          "What does وَ add?",
        ],
      ),
    ],
  },
];

export function getSurah(number: number) {
  return (
    surahs.find((item) => item.number === number) ?? surahs[surahs.length - 1]
  );
}

export function getAyah(surahNumber: number, ayahNumber: number) {
  return (
    getSurah(surahNumber).ayahs.find((item) => item.number === ayahNumber) ??
    getSurah(surahNumber).ayahs[0]
  );
}

export function getWordLesson(word: WordOccurrence): WordLesson | undefined {
  return (
    word.lesson ??
    (word.sharedLessonId ? sharedLessons[word.sharedLessonId] : undefined)
  );
}

export function getProgressKey(surahNumber: number, ayahNumber: number) {
  return `qawt:progress:${surahNumber}:${ayahNumber}`;
}
