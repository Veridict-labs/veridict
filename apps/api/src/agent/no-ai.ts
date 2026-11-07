import { answerInput, type Evidence } from '@veridict/contracts';

// Extract search terms, never infer intent, policy scope, or business context.
const stopWords = new Set(
  'a an the is are was were do does can could would should i me my we our you your what which how much many please tell about for of to in on and or with this that apa apakah berapa bagaimana siapa kapan dimana di mana saya aku kami kita kamu anda yang dan atau untuk dari ke dengan ini itu bisa boleh tolong tentang saja'.split(
    ' ',
  ),
);

export function noAiQuery(question: string): string | null {
  const words =
    question
      .normalize('NFKC')
      .toLowerCase()
      .match(/[\p{L}\p{N}_]+/gu) ?? [];
  const terms = [
    ...new Set(words.filter((word) => word.length > 1 && !stopWords.has(word))),
  ];
  // Quoted terms prevent user text from introducing websearch operators.
  return terms.length
    ? terms
        .slice(0, 24)
        .map((word) => `"${word.slice(0, 60)}"`)
        .join(' OR ')
    : null;
}

/** Present masked source text verbatim; search matches are not policy decisions. */
export function noAiAnswer(question: string, results: Evidence[]) {
  results = results.slice(0, 5);
  const indonesian =
    /\b(apa|apakah|berapa|bagaimana|siapa|kapan|saya|aku|bisa|boleh|tolong|tunjangan|bensin|cuti)\b/i.test(
      question,
    );
  const citations = results.map(({ source_id, chunk_id }) => ({
    source_id,
    chunk_id,
  }));
  return answerInput.parse({
    status: results.length ? 'ANSWERED' : 'INSUFFICIENT_EVIDENCE',
    answer: results.length
      ? [
          indonesian
            ? 'Tanpa AI — berikut kutipan sumber yang cocok dengan kata kunci pertanyaan Anda. Kutipan ini belum menentukan aturan mana yang berlaku untuk Anda.'
            : 'AI off — these source excerpts match your question’s keywords. They do not determine which rule applies to you.',
          ...results.map(
            (item, index) =>
              `[${index + 1}] ${item.title.slice(0, 200)} (${item.source_state})\n“${item.excerpt.slice(0, 2200)}${item.excerpt.length > 2200 ? '…' : ''}”`,
          ),
        ].join('\n\n')
      : indonesian
        ? 'Tidak ditemukan sumber yang dapat Anda akses untuk kata kunci ini. Coba kata kunci yang lebih spesifik atau gunakan mode AI.'
        : 'No accessible sources matched these keywords. Try more specific keywords or use AI mode.',
    citations,
    limitations: [
      indonesian
        ? 'Mode tanpa AI hanya mencari kata kunci dan menampilkan kutipan. Tidak memahami sinonim, memeriksa aturan yang berlaku, menyelesaikan konflik, atau menyimpulkan jawaban.'
        : 'AI off uses keyword search and source excerpts only. It does not interpret synonyms, check applicable policies, resolve conflicts, or infer an answer.',
    ],
    decision_trail: results.length
      ? [
          {
            label: indonesian
              ? 'Mencari kata kunci pada sumber yang diizinkan dan menampilkan kutipan tanpa panggilan AI.'
              : 'Searched authorized sources by keyword and returned excerpts without AI calls.',
            evidence: citations,
          },
        ]
      : [],
  });
}
