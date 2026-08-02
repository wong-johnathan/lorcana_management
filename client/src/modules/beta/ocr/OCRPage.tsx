// OCRPage.tsx
import { useState, useEffect } from "react";
import StartScreen from "./components/StartScreen";
import CameraView from "./components/CameraView";
import ConfirmationDialog from "./components/ConfirmationDialog";
import DuplicateDialog from "./components/DuplicateDialog";
import { useScanSession } from "./hooks/useScanSession";
import { preloadIndex, getAvailableSets } from "./services/cardIndex";

export default function OCRPage() {
  const {
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
  } = useScanSession();

  const [started, setStarted] = useState(false);
  const [availableSets, setAvailableSets] = useState<{ code: string; name: string }[]>([]);

  // Preload card index and extract available sets
  useEffect(() => {
    preloadIndex();
    getAvailableSets().then(setAvailableSets).catch(console.error);
  }, []);

  if (!started || !session) {
    return (
      <StartScreen
        sets={availableSets}
        onStart={(setCode, setName, lang, finish) => {
          startSession(setCode, setName, lang, finish);
          setStarted(true);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <button
          type="button"
          onClick={() => setStarted(false)}
          className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          ← Change Set
        </button>
        <span className="text-sm text-gray-300 font-medium">{session.setName}</span>
        <span className="text-sm text-gray-500">{session.entries.length} scanned</span>
      </div>

      {/* Camera */}
      <div className="flex-1 flex items-center justify-center p-2">
        <div className="w-full max-w-lg">
          <CameraView
            setCode={session.setCode}
            onResult={handleResult}
            onNoMatch={() => {}}
            onError={() => {}}
            status={status}
            onStatusChange={setStatus}
            paused={status.phase === "result" || status.phase === "duplicate" || status.phase === "recognizing"}
          />
        </div>
      </div>

      {/* Session footer */}
      {session.entries.length > 0 && (
        <div className="px-4 py-2 bg-gray-900 border-t border-gray-800 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">
              {session.entries.length} cards ·{" "}
              {session.entries.reduce((sum, e) => sum + e.quantity, 0)} total
            </span>
            <button
              type="button"
              onClick={() => {
                console.log("Session:", session.entries);
              }}
              className="text-sm bg-amber-500 hover:bg-amber-600 text-black font-medium px-4 py-1.5 rounded-md transition-colors"
            >
              Finish Session
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {pendingEntry && (
        <ConfirmationDialog entry={pendingEntry} onSaveNext={saveAndNext} onRescan={rescan} />
      )}
      {duplicateEntry && (
        <DuplicateDialog
          existing={duplicateEntry}
          onIncrease={handleDuplicateIncrease}
          onReplace={handleDuplicateReplace}
          onSkip={skipDuplicate}
        />
      )}
    </div>
  );
}
