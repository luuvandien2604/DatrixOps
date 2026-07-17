import { ShieldCheck } from 'lucide-react';
import FeaturePreview from '@/components/FeaturePreview';

export default function SecurityPage() {
  return <FeaturePreview icon={ShieldCheck} eyebrow="Security posture" title="Every server. One security pulse." description="Agent integrity, access events and exposure signals are being organized into a clear security posture view." />;
}
