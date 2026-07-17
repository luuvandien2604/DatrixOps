import { Gauge } from 'lucide-react';
import FeaturePreview from '@/components/FeaturePreview';

export default function PerformancePage() {
  return <FeaturePreview icon={Gauge} eyebrow="Performance analytics" title="Find the signal behind the slowdown." description="Capacity trends, saturation points and workload correlations will live together in this performance workspace." />;
}
