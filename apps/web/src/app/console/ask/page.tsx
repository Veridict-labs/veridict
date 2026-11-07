'use client';

import { AskBox } from '@/components/AskBox';
import { Icon } from '@/components/Icon';

const TIPS = [
  {
    icon: 'scale' as const,
    text: 'AI mode checks which rule applies. AI off returns source excerpts for you to compare.',
  },
  {
    icon: 'lock' as const,
    text: 'Restricted topics get the same reply as topics that don’t exist.',
  },
  {
    icon: 'alert' as const,
    text: 'When evidence is missing, Veridict says so. Try more specific keywords in AI-off mode.',
  },
];

export default function AskPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">Ask Veridict</h1>
      <p className="mt-2 text-ink-2">
        Write naturally, in Bahasa Indonesia, English or a mix of both.
      </p>
      <div className="mt-6">
        <AskBox autoFocus />
      </div>
      <ul className="mt-10 grid gap-3 sm:grid-cols-3">
        {TIPS.map((t) => (
          <li
            key={t.text}
            className="rounded-2xl border border-line bg-surface p-4 text-sm leading-relaxed text-ink-2"
          >
            <Icon name={t.icon} size={18} className="mb-2 text-brand" />
            {t.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
