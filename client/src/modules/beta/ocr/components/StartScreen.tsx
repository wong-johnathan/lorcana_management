// components/StartScreen.tsx
import { useState } from "react";

interface Props {
  setNames: string[];
  onStart: (setCode: string, language: string, defaultFinish: string) => void;
}

const FINISHES = ["Normal", "Cold Foil", "Enchanted"];
const LANGUAGES = ["English"];

export default function StartScreen({ setNames, onStart }: Props) {
  const [selectedSet, setSelectedSet] = useState(setNames[0] || "");
  const [language, setLanguage] = useState("English");
  const [defaultFinish, setDefaultFinish] = useState("Normal");

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-center">Batch Scan</h1>
        <p className="text-gray-400 text-sm text-center mt-1">Beta — local OCR scanner</p>
      </div>

      <div className="w-full max-w-sm space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Select Set</label>
          <select
            value={selectedSet}
            onChange={(e) => setSelectedSet(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2.5 text-gray-100 focus:outline-none focus:border-amber-500"
          >
            {setNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Language</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2.5 text-gray-100 focus:outline-none focus:border-amber-500"
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Finish (Default)</label>
          <div className="flex gap-2">
            {FINISHES.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setDefaultFinish(f)}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                  defaultFinish === f
                    ? "bg-amber-500 text-black"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={() => onStart(selectedSet, language, defaultFinish)}
        className="w-full max-w-sm bg-amber-500 hover:bg-amber-600 disabled:bg-gray-700 disabled:text-gray-500 text-black font-semibold py-3 rounded-lg transition-colors"
        disabled={!selectedSet}
      >
        Start Scanning
      </button>
    </div>
  );
}
