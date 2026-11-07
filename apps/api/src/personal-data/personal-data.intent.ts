import type { PersonalDataKind } from '@veridict/contracts';

const terms: Record<PersonalDataKind, RegExp> = {
  NIK: /\bnik\b|national\s+(?:id|identity)|nomor\s+induk\s+kependudukan/i,
  PHONE: /\b(?:nomor|no\.?)\s+(?:telepon|telpon|ponsel|hp)\b|\b(?:phone|telephone|mobile|cell(?:ular)?|contact)\s+number\b/i,
  EMAIL: /\be-?mail\b|\bsurel\b/i,
  ADDRESS: /\balamat\b(?!\s+(?:e-?mail|surel)\b)|(?<!e-mail )(?<!email )\baddress\b/i,
  DATE_OF_BIRTH: /tanggal\s+lahir|tgl\s+lahir|date\s+of\s+birth|\bdob\b/i,
  BANK_ACCOUNT: /\brekening\b|bank\s+account/i,
  NAME: /\bnama\b|\bname\b/i,
  NPWP: /\bnpwp\b|tax\s+(?:id|number)/i,
  PASSPORT_NUMBER: /\bpaspor\b|\bpassport\b/i,
  SALARY: /\bgaji\b|\bsalary\b/i,
  HEALTH_INFORMATION: /\bkesehatan\b|\bdiagnos(?:is|a)\b|\bhealth\b|\bmedical\b/i,
};

/** Conservative intent check, never an authorization or a general language classifier. */
export function explicitlyRequests(question: string, field: PersonalDataKind) {
  const text = question.normalize('NFKC').replace(/\s+/g, ' ').trim();
  // A mixed/negated request must be clarified, rather than partially unmasked.
  if (
    /\b(jangan|tanpa|tidak|tak|bukan|sembunyikan|samarkan|sensor|without|hide|mask|redact|never|not)\b|\bdo\s+not\b|\bdon['’]t\b/i.test(text)
  ) return false;
  if (/^(?:apa|what\s+(?:is|are))\s+(?:nik|npwp)\s*\??$/i.test(text))
    return false;
  // Asking about handling or defining a category does not request its actual value.
  if (
    /\b(aturan|kebijakan|definisi|pengertian|format|contoh|prosedur|panduan|penyimpanan|perlindungan|policy|policies|definition|meaning|example|procedure|guideline|storage|retention|protection|regulation|rules|explain|jelaskan|bagaimana|how|why|kenapa)\b|\bapa\s+(?:itu|saja)\b|\bwhat\s+(?:is|are)\s+(?:a|an)\b/i.test(text)
  ) return false;
  return (
    /\b(berapa|apa|tampilkan|lihat|sebutkan|minta|berikan|show|provide|display|retrieve|give|what|tell)\b/i.test(text) &&
    terms[field].test(text)
  );
}
