import { Button } from '@/components/ui';
import { useActions } from '@/store/store';

export function Welcome() {
  const actions = useActions();
  return (
    <div style={{ padding: 48 }}>
      <Button variant="primary" onClick={() => actions.loadSample()}>
        Load sample data
      </Button>
    </div>
  );
}
