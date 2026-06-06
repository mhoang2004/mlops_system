import { CheckSquare } from 'lucide-react';
import { PlaceholderPage } from '../../components/PlaceholderPage';

export function TasksPage() {
  return (
    <PlaceholderPage
      icon={CheckSquare}
      accent="amber"
      title="Tasks"
      hint="Queue and monitor training tasks, exports, and data processing jobs."
    />
  );
}
