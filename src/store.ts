import { useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../amplify/data/resource';
import type { Budget, Expense, Goal, Income, Profile, Subscription, Wish } from './lib';

// Module scope — un solo cliente para toda la app.
export const client = generateClient<Schema>();

type Sub = { unsubscribe(): void };

function useObserve<T>(start: (set: (items: T[]) => void) => Sub): [T[], boolean] {
  const [items, setItems] = useState<T[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sub = start((xs) => {
      setItems(xs);
      setReady(true);
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [items, ready];
}

/** Datos del usuario autenticado, sincronizados en tiempo real. */
export function useUserData() {
  const [expenses, e1] = useObserve<Expense>((set) =>
    client.models.Expense.observeQuery().subscribe({ next: ({ items }) => set([...items] as Expense[]) }),
  );
  const [incomes] = useObserve<Income>((set) =>
    client.models.Income.observeQuery().subscribe({ next: ({ items }) => set([...items] as Income[]) }),
  );
  const [budgets] = useObserve<Budget>((set) =>
    client.models.Budget.observeQuery().subscribe({ next: ({ items }) => set([...items] as Budget[]) }),
  );
  const [goals] = useObserve<Goal>((set) =>
    client.models.Goal.observeQuery().subscribe({ next: ({ items }) => set([...items] as Goal[]) }),
  );
  const [subs] = useObserve<Subscription>((set) =>
    client.models.Recurring.observeQuery().subscribe({ next: ({ items }) => set([...items] as Subscription[]) }),
  );
  const [wishes] = useObserve<Wish>((set) =>
    client.models.Wish.observeQuery().subscribe({ next: ({ items }) => set([...items] as Wish[]) }),
  );
  const [profiles, p1] = useObserve<Profile>((set) =>
    client.models.Profile.observeQuery().subscribe({ next: ({ items }) => set([...items] as Profile[]) }),
  );

  return {
    expenses,
    incomes,
    budgets,
    goals,
    subs,
    wishes,
    profile: profiles[0] as Profile | undefined,
    ready: e1 && p1,
  };
}

export type UserData = ReturnType<typeof useUserData>;
