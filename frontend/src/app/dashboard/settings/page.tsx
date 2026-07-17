import { Settings2 } from 'lucide-react';
import FeaturePreview from '@/components/FeaturePreview';

export default function SettingsPage() {
  return <FeaturePreview icon={Settings2} eyebrow="Workspace settings" title="Your control plane, your rules." description="Workspace preferences, retention policies and organization defaults are being consolidated here." />;
}
