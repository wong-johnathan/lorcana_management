import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import ScanPage from "./pages/ScanPage";
import InventoryPage from "./pages/InventoryPage";
import DatabasePage from "./pages/DatabasePage";
import SettingsPage from "./pages/SettingsPage";
import PublicCollectionPage from "./pages/PublicCollectionPage";
import CardDetailPage from "./pages/CardDetailPage";

const OCRPage = lazy(() => import("./modules/beta/ocr/OCRPage"));

export default function App() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400 text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/beta/ocr"
        element={
          <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-gray-950 text-gray-400">Loading OCR Scanner...</div>}>
            <OCRPage />
          </Suspense>
        }
      />
      <Route element={<Layout />}>
        <Route path="/database" element={<DatabasePage />} />
        <Route path="/database/:cardId" element={<CardDetailPage />} />
        <Route path="/collection/:userId" element={<PublicCollectionPage />} />
        {user ? (
          <>
            <Route path="/scan" element={<ScanPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </>
        ) : (
          <Route path="/login" element={<LoginPage />} />
        )}
        <Route path="*" element={<Navigate to="/database" replace />} />
      </Route>
    </Routes>
  );
}
