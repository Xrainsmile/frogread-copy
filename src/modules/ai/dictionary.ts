// English dictionary lookup (used by the hover dictionary feature).
// Uses the free dictionaryapi.dev endpoint.

export interface DictionaryResult {
  phonetic?: string;
  definition: string;
}

export async function lookupWord(word: string): Promise<DictionaryResult> {
  const resp = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
  if (!resp.ok) {
    throw new Error('未找到该单词的释义');
  }
  const data = await resp.json();
  const entry = Array.isArray(data) ? data[0] : data;
  const phonetic = entry.phonetic || entry.phonetics?.find((p: { text?: string }) => p.text)?.text;
  const senses: string[] = [];
  for (const meaning of entry.meanings || []) {
    const pos = meaning.partOfSpeech;
    for (const def of meaning.definitions || []) {
      senses.push(`(${pos}) ${def.definition}`);
      if (senses.length >= 5) break;
    }
    if (senses.length >= 5) break;
  }
  return {
    phonetic,
    definition: senses.join('\n') || '未找到释义',
  };
}
