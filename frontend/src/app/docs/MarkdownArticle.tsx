'use client';

import { Children, isValidElement, type ReactNode, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Clipboard } from 'lucide-react';
import { usePathname } from 'next/navigation';

function slugifyHeading(value: string) {
  return value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function textFromChildren(children: ReactNode): string {
  return Children.toArray(children).map((child) => {
    if (typeof child === 'string' || typeof child === 'number') return String(child);
    if (isValidElement<{ children?: ReactNode }>(child)) return textFromChildren(child.props.children);
    return '';
  }).join('');
}

function CodeBlock({ children, english }: { children: ReactNode; english: boolean }) {
  const [copied, setCopied] = useState(false);
  const code = textFromChildren(children).replace(/\n$/, '');
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="docs-code">
      <div>
        <span>Command</span>
        <button type="button" onClick={copy}>
          {copied ? <Check /> : <Clipboard />}
          {copied ? (english ? 'Copied' : 'Đã sao chép') : (english ? 'Copy' : 'Sao chép')}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

export default function MarkdownArticle({ content }: { content: string }) {
  const pathname = usePathname();
  const english = pathname === '/docs/en' || pathname.startsWith('/docs/en/');
  return (
    <div className="docs-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children }) => <h2 id={slugifyHeading(textFromChildren(children))}>{children}</h2>,
          h3: ({ children }) => <h3 id={slugifyHeading(textFromChildren(children))}>{children}</h3>,
          pre: ({ children }) => <CodeBlock english={english}>{children}</CodeBlock>,
          blockquote: ({ children }) => {
            const value = textFromChildren(children).trim().toLocaleLowerCase('vi');
            const kind = value.startsWith('warning:') ? 'warning'
              : value.startsWith('tip:') ? 'tip'
                : value.startsWith('important:') ? 'important'
                  : 'note';
            return <blockquote className={`docs-callout ${kind}`}>{children}</blockquote>;
          },
          a: ({ href = '', children }) => {
            const external = /^https?:\/\//.test(href);
            return <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>{children}</a>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
