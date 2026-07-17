import { SlidersHorizontal } from 'lucide-react';
import FeaturePreview from '@/components/FeaturePreview';

export default function ManageConfigPage() {
  return <FeaturePreview icon={SlidersHorizontal} eyebrow="System configuration" title="Tune once. Apply everywhere." description="Agent intervals, retention and fleet-wide defaults are being brought into a single configuration surface." />;
}
