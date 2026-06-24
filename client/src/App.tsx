import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import ScanPage from "./pages/ScanPage";
import InventoryPage from "./pages/InventoryPage";
import DatabasePage from "./pages/DatabasePage";

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
      <Route element={<Layout />}>
        <Route path="/database" element={<DatabasePage />} />
        {user ? (
          <>
            <Route path="/scan" element={<ScanPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="*" element={<Navigate to="/scan" replace />} />
          </>
        ) : (
          <>
            <Route path="/login" element={<LoginPage />} />
            <Route path="*" element={<Navigate to="/database" replace />} />
          </>
        )}
      </Route>
    </Routes>
  );
}
