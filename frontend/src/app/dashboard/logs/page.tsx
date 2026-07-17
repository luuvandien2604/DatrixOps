import { FileText } from 'lucide-react';
import FeaturePreview from '@/components/FeaturePreview';

export default function LogsPage() {
  return <FeaturePreview icon={FileText} eyebrow="Unified logs" title="Search less. Understand faster." description="Infrastructure logs and incident context will converge here in one timeline built for rapid investigation." />;
}
