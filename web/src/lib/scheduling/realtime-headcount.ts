export type HeadcountSessionLike = {
  id: string;
  headcount: number | null;
};

export function applyHeadcountUpdate<T extends HeadcountSessionLike>(
  sessions: T[],
  update: { id: string; headcount: number | null },
): T[] {
  const idx = sessions.findIndex((s) => s.id === update.id);
  if (idx === -1) return sessions;

  const current = sessions[idx];
  if (current.headcount === update.headcount) return sessions;

  const next = sessions.slice();
  next[idx] = { ...current, headcount: update.headcount };
  return next;
}

