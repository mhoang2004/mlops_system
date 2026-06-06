import { LineChart } from 'lucide-react';
import { PlaceholderPage } from '../../components/PlaceholderPage';

export function EvaluationPage() {
  return (
    <PlaceholderPage
      icon={LineChart}
      accent="emerald"
      title="Evaluation"
      hint="Run evaluations, compute metrics, and visualize model performance."
    />
  );
}
