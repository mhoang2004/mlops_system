import { BarChart2 } from 'lucide-react';
import { PlaceholderPage } from '../components/PlaceholderPage';

export function VisualizePage() {
  return (
    <PlaceholderPage
      icon={BarChart2}
      accent="emerald"
      title="Visualize"
      hint="Explore metrics, loss curves, and model performance across runs."
    />
  );
}
