import type { ReactNode } from 'react';
import type { CorrectionMark } from '@/lib/models';

export function CorrectionPreview({
  content,
  corrections,
}: {
  content: string;
  corrections: CorrectionMark[];
}) {
  const marks = [...corrections]
    .filter((mark) => mark.start >= 0
      && mark.end > mark.start
      && mark.end <= content.length
      && content.slice(mark.start, mark.end) === mark.wrongText)
    .sort((a, b) => a.start - b.start);

  const parts: ReactNode[] = [];
  let cursor = 0;
  marks.forEach((mark, index) => {
    if (mark.start < cursor) return;
    if (mark.start > cursor) parts.push(content.slice(cursor, mark.start));
    parts.push(
      <mark className="review-wrong-mark" key={`mark-${index}`}>
        {content.slice(mark.start, mark.end)}
      </mark>,
    );
    cursor = mark.end;
  });
  if (cursor < content.length) parts.push(content.slice(cursor));

  return <pre className="correction-preview">{parts}</pre>;
}
