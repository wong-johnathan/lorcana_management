// OCRPage.tsx
import { useState, useEffect } from "react";
import StartScreen from "./components/StartScreen";
import CameraView from "./components/CameraView";
import ConfirmationDialog from "./components/ConfirmationDialog";
import DuplicateDialog from "./components/DuplicateDialog";
import { useScanSession } from "./hooks/useScanSession";
import { preloadIndex } from "./services/cardIndex";

const SET_NAMES = [
  "Archazia's Island",
  "Azurite Sea",
  "Into the Inklands",
  "Rise of the Floodborn",
  "The First Chapter",
  "Ursula's Return",
  "Shimmering Skies",
  "Attack of the Vine",
];

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

  // Preload card index when page mounts
  useEffect(() => {
    preloadIndex();
  }, []);

  if (!started || !session) {
    return (
      <StartScreen
        setNames={SET_NAMES}
        onStart={(setName, lang, finish) => {
          startSession(setName, setName, lang, finish);
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
