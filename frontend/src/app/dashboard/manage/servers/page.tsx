import { ServerCog } from 'lucide-react';
import FeaturePreview from '@/components/FeaturePreview';

export default function ManageServersPage() {
  return <FeaturePreview icon={ServerCog} eyebrow="Fleet administration" title="Operate the fleet as one." description="Bulk agent actions, grouping and lifecycle controls are being designed for infrastructure at scale." />;
}
