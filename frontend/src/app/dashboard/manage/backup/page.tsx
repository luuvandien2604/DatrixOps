import { DatabaseBackup } from 'lucide-react';
import FeaturePreview from '@/components/FeaturePreview';

export default function ManageBackupPage() {
  return <FeaturePreview icon={DatabaseBackup} eyebrow="Recovery control" title="Ready before recovery is needed." description="Backup policies, restore points and recovery checks will be managed from this resilient workspace." />;
}
