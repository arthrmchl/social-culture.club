"use client";

import { useState, useTransition } from "react";
import { setStatus } from "@/actions/status";
import { allowedStates, stateLabel } from "@/lib/status";
import { Select } from "./ui/Field";
import type { WorkType, WorkStatusState } from "@/generated/prisma/enums";

/** Sélecteur de statut (S8), états filtrés par média (T2, L1). */
export function StatusSelect({
  workId,
  type,
  state,
}: {
  workId: string;
  type: WorkType;
  state: WorkStatusState | null;
}) {
  const [value, setValue] = useState<string>(state ?? "");
  const [pending, start] = useTransition();

  // Reflète un statut recalculé côté serveur (ex. passage auto « à jour »).
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    setValue(state ?? "");
  }

  return (
    <Select
      value={value}
      disabled={pending}
      aria-label="Statut"
      onChange={(e) => {
        const next = e.target.value;
        const prev = value;
        setValue(next);
        start(async () => {
          const res = await setStatus(
            workId,
            next ? (next as WorkStatusState) : null,
          );
          if ("error" in res) setValue(prev);
        });
      }}
    >
      <option value="">— Aucun statut —</option>
      {allowedStates(type).map((s) => (
        <option key={s} value={s}>
          {stateLabel(type, s)}
        </option>
      ))}
    </Select>
  );
}
