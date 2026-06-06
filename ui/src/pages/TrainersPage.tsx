import { Brain } from 'lucide-react';
import { PlaceholderPage } from '../components/PlaceholderPage';

export function TrainersPage() {
  return (
    <PlaceholderPage
      icon={Brain}
      accent="violet"
      title="Trainers"
      hint="Configure and run distributed training jobs across your fleet."
    />
  );
}
