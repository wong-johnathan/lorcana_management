// hooks/useScanSession.ts
import { useState, useCallback } from "react";
import type { ScanEntry, ScanSession, ScanStatus } from "../services/types";

export function useScanSession() {
  const [session, setSession] = useState<ScanSession | null>(null);
  const [status, setStatus] = useState<ScanStatus>({ phase: "waiting" });
  const [pendingEntry, setPendingEntry] = useState<ScanEntry | null>(null);
  const [duplicateEntry, setDuplicateEntry] = useState<ScanEntry | null>(null);

  const startSession = useCallback(
    (setCode: string, setName: string, language: string, defaultFinish: string) => {
      setSession({
        setCode,
        setName,
        language,
        defaultFinish: defaultFinish as "Normal" | "Cold Foil" | "Enchanted",
        entries: [],
      });
      setStatus({ phase: "waiting" });
      setPendingEntry(null);
      setDuplicateEntry(null);
    },
    []
  );

  const handleResult = useCallback(
    (entry: ScanEntry) => {
      if (!session) return;

      const existing = session.entries.find((e) => e.cardId === entry.cardId);
      if (existing) {
        setDuplicateEntry(existing);
        setStatus({ phase: "duplicate", existing, newFinish: entry.finish });
        return;
      }

      const fullEntry: ScanEntry = {
        ...entry,
        finish: session.defaultFinish,
        quantity: 1,
      };
      setPendingEntry(fullEntry);
      setStatus({ phase: "result", entry: fullEntry });
    },
    [session]
  );

  const saveAndNext = useCallback((entry: ScanEntry) => {
    setSession((prev) => {
      if (!prev) return prev;
      return { ...prev, entries: [...prev.entries, entry] };
    });
    setPendingEntry(null);
    setStatus({ phase: "waiting" });
  }, []);

  const rescan = useCallback(() => {
    setPendingEntry(null);
    setDuplicateEntry(null);
    setStatus({ phase: "waiting" });
  }, []);

  const handleDuplicateIncrease = useCallback(
    (newQuantity: number) => {
      if (!duplicateEntry) return;
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          entries: prev.entries.map((e) =>
            e.cardId === duplicateEntry.cardId ? { ...e, quantity: newQuantity } : e
          ),
        };
      });
      setDuplicateEntry(null);
      setStatus({ phase: "waiting" });
    },
    [duplicateEntry]
  );

  const handleDuplicateReplace = useCallback(
    (newQuantity: number) => {
      if (!duplicateEntry) return;
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          entries: prev.entries.map((e) =>
            e.cardId === duplicateEntry.cardId ? { ...e, quantity: newQuantity } : e
          ),
        };
      });
      setDuplicateEntry(null);
      setStatus({ phase: "waiting" });
    },
    [duplicateEntry]
  );

  const skipDuplicate = useCallback(() => {
    setDuplicateEntry(null);
    setStatus({ phase: "waiting" });
  }, []);

  return {
    session,
    status,
    setStatus,
    pendingEntry,
    duplicateEntry,
    startSession,
    handleResult,
    saveAndNext,
    rescan,
    handleDuplicateIncrease,
    handleDuplicateReplace,
    skipDuplicate,
  };
}
