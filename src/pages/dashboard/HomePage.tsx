import { TasksPage } from '@/pages/dashboard/TasksPage';
import { OffersPage } from '@/pages/dashboard/OffersPage';

export function HomePage() {
  return (
    <div className="space-y-10 animate-fade-in">
      <section>
        <TasksPage />
      </section>
      <div className="h-px bg-ink-200/50" />
      <section>
        <OffersPage />
      </section>
    </div>
  );
}
