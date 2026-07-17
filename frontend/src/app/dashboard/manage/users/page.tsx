import { Users } from 'lucide-react';
import FeaturePreview from '@/components/FeaturePreview';

export default function ManageUsersPage() {
  return <FeaturePreview icon={Users} eyebrow="Team access" title="The right access for every operator." description="Invite teammates and define precise roles across servers, alerts and administrative actions." />;
}
