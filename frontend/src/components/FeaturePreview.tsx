import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type FeaturePreviewProps = {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
};

export default function FeaturePreview({ icon: Icon, eyebrow, title, description }: FeaturePreviewProps) {
  return (
    <div className="feature-preview">
      <div className="feature-preview-orb" aria-hidden="true" />
      <section className="glass-card">
        <div className="feature-preview-icon"><Icon className="h-6 w-6" /></div>
        <span className="feature-preview-label"><Sparkles className="h-3.5 w-3.5" />{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="feature-preview-progress"><i /></div>
        <div className="feature-preview-meta"><span>Design system ready</span><strong>In development</strong></div>
        <Link href="/dashboard" className="liquid-button secondary mt-7"><ArrowLeft className="h-4 w-4" />Back to overview</Link>
      </section>
    </div>
  );
}
