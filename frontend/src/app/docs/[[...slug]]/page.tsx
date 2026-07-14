import fs from 'fs';
import path from 'path';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen } from 'lucide-react';

export default async function DocsPage({ params }: { params: { slug?: string[] } }) {
  const { slug } = params;
  
  // Mặc định load file introduction.md nếu truy cập /docs
  const filePath = slug && slug.length > 0 
    ? path.join(process.cwd(), '..', 'docs', 'user-guide', `${slug.join('/')}.md`)
    : path.join(process.cwd(), '..', 'docs', 'user-guide', 'introduction.md');

  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    notFound();
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="prose prose-invert prose-blue max-w-none">
        <ReactMarkdown 
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({node, ...props}) => <h1 className="text-4xl font-extrabold text-[var(--foreground)] mb-6 flex items-center gap-3 tracking-tight border-b border-white/10 pb-6"><BookOpen className="w-10 h-10 text-blue-500" />{props.children}</h1>,
            h2: ({node, ...props}) => <h2 className="text-2xl font-bold text-[var(--foreground)] mt-10 mb-4">{props.children}</h2>,
            h3: ({node, ...props}) => <h3 className="text-xl font-semibold text-[var(--foreground)] mt-8 mb-3">{props.children}</h3>,
            p: ({node, ...props}) => <p className="text-[var(--color-muted)] leading-relaxed mb-4">{props.children}</p>,
            ul: ({node, ...props}) => <ul className="list-disc pl-6 space-y-2 text-[var(--color-muted)] mb-6">{props.children}</ul>,
            ol: ({node, ...props}) => <ol className="list-decimal pl-6 space-y-2 text-[var(--color-muted)] mb-6">{props.children}</ol>,
            li: ({node, ...props}) => <li>{props.children}</li>,
            a: ({node, ...props}) => <a className="text-blue-400 hover:text-blue-300 underline underline-offset-4" {...props}>{props.children}</a>,
            strong: ({node, ...props}) => <strong className="font-semibold text-[var(--foreground)]">{props.children}</strong>,
            code: ({node, inline, ...props}: any) => 
              inline ? 
                <code className="bg-white/10 text-pink-300 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{props.children}</code> :
                <pre className="bg-[#0B0F14] border border-white/10 rounded-xl p-4 overflow-x-auto my-6"><code className="text-sm font-mono text-gray-300" {...props}>{props.children}</code></pre>,
            blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-blue-500 bg-blue-500/5 px-4 py-3 rounded-r-lg my-6 italic text-[var(--color-muted)]">{props.children}</blockquote>
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
