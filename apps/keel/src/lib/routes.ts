import type { TimelineEvent } from './types';

export const ROUTES = {
  dashboard: '/',
  subscriptions: '/subscriptions',
  documents: '/documents',
  purchases: '/purchases',
  calendar: '/calendar',
  insights: '/insights',
  tasks: '/tasks',
  settings: '/settings',
} as const;

export function refPath(ref: TimelineEvent['ref']): string {
  switch (ref.kind) {
    case 'subscription':
      return `${ROUTES.subscriptions}?open=${ref.id}`;
    case 'document':
      return `${ROUTES.documents}?open=${ref.id}`;
    case 'purchase':
      return `${ROUTES.purchases}?open=${ref.id}`;
    case 'task':
      return `${ROUTES.tasks}?open=${ref.id}`;
  }
}
