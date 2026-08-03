export type QuranSearchWord = {
  position: number;
  arabic: string;
  transliteration: string;
  gloss: string;
  meaning: string;
  root: string;
  rootMatched: boolean;
  matched: boolean;
};

export type QuranSearchSurah = {
  number: number;
  name: string;
  arabicName: string;
  transliteration: string;
  englishLabel: string;
  ayahCount: number;
};

export type QuranSearchAyah = {
  id: string;
  surah: number;
  surahName: string;
  surahTransliteration: string;
  ayah: number;
  arabic: string;
  translation: string;
  naturalMeaning: string;
  words: QuranSearchWord[];
};

export type QuranSearchPayload = {
  query: string;
  terms: string[];
  approximateCount: number;
  matchingWordCount: number;
  matchingAyahCount: number;
  surahMatches: QuranSearchSurah[];
  ayahMatches: QuranSearchAyah[];
};
