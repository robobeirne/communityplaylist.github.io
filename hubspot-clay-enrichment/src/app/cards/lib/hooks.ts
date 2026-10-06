import { useEffect, useState } from 'react';

export type CrmActions = {
  fetchCrmObjectProperties: (properties: string[] | '*') => Promise<Record<string, string>>;
  onCrmPropertiesUpdate: (
    properties: string[] | '*',
    callback: (properties: Record<string, string>, error?: { message: string }) => void
  ) => void;
};

/**
 * Loads properties from the current record and keeps them in sync, so the card
 * updates as soon as anyone (or anything) changes them.
 */
export function useRecordProperties(actions: CrmActions, names: string[]) {
  const [props, setProps] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    actions
      .fetchCrmObjectProperties(names)
      .then((p) => active && setProps(p))
      .catch((e: unknown) => active && setError(e instanceof Error ? e.message : String(e)));
    actions.onCrmPropertiesUpdate(names, (p, err) => {
      if (!active) return;
      if (err) setError(err.message);
      else setProps((prev) => ({ ...(prev ?? {}), ...p }));
    });
    return () => {
      active = false;
    };
  }, []);

  return { props, error, loading: !props && !error };
}
