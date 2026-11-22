import { Fragment, type ReactNode } from 'react';

/**
 * A small, safe Markdown renderer for CVs: headings (#, ##, ###), bullet and numbered lists,
 * rules, paragraphs, **bold**, *italic* and [links](…) (shown as their text). It builds React
 * elements, never HTML strings, so nothing in the text can inject markup.
 */
function inline(text: string, key: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return parts.filter(Boolean).map((p, i) => {
    const k = `${key}-${i}`;
    if (/^(\*\*|__).+\1$/.test(p)) return <strong key={k}>{p.slice(2, -2)}</strong>;
    if (/^(\*|_).+\1$/.test(p)) return <em key={k}>{p.slice(1, -1)}</em>;
    if (/^`.+`$/.test(p)) return <Fragment key={k}>{p.slice(1, -1)}</Fragment>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p);
    if (link) return <Fragment key={k}>{link[1]}</Fragment>;
    return <Fragment key={k}>{p}</Fragment>;
  });
}

type Block =
  | { kind: 'h1' | 'h2' | 'h3' | 'p'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'hr' };

export function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const last = blocks[blocks.length - 1];
    let m: RegExpExecArray | null;
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) blocks.push({ kind: 'hr' });
    else if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) blocks.push({ kind: m[1].length === 1 ? 'h1' : m[1].length === 2 ? 'h2' : 'h3', text: m[2].replace(/\s+#+$/, '') });
    else if ((m = /^[-*•+]\s+(.*)$/.exec(line))) {
      if (last?.kind === 'ul') last.items.push(m[1]);
      else blocks.push({ kind: 'ul', items: [m[1]] });
    } else if ((m = /^\d+[.)]\s+(.*)$/.exec(line))) {
      if (last?.kind === 'ol') last.items.push(m[1]);
      else blocks.push({ kind: 'ol', items: [m[1]] });
    } else blocks.push({ kind: 'p', text: line });
  }
  return blocks;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className}>
      {parseMarkdown(text).map((b, i) => {
        const k = String(i);
        switch (b.kind) {
          case 'h1':
            return <h1 key={k}>{inline(b.text, k)}</h1>;
          case 'h2':
            return <h2 key={k}>{inline(b.text, k)}</h2>;
          case 'h3':
            return <h3 key={k}>{inline(b.text, k)}</h3>;
          case 'ul':
            return (
              <ul key={k}>
                {b.items.map((it, j) => (
                  <li key={j}>{inline(it, `${k}-${j}`)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={k}>
                {b.items.map((it, j) => (
                  <li key={j}>{inline(it, `${k}-${j}`)}</li>
                ))}
              </ol>
            );
          case 'hr':
            return <hr key={k} />;
          default:
            return <p key={k}>{inline(b.text, k)}</p>;
        }
      })}
    </div>
  );
}
