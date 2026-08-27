import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import InventoryPage from "./pages/InventoryPage";
import DatabasePage from "./pages/DatabasePage";
import SettingsPage from "./pages/SettingsPage";
import PublicCollectionPage from "./pages/PublicCollectionPage";
import CardDetailPage from "./pages/CardDetailPage";
import MasterSetPage from "./pages/MasterSetPage";
import ExtrasForSalePage from "./pages/ExtrasForSalePage";
import MarketplacePage from "./pages/MarketplacePage";
import MarketplaceCardPage from "./pages/MarketplaceCardPage";
import MarketplaceEnquiriesPage from "./pages/MarketplaceEnquiriesPage";
import MarketplaceEnquiryPage from "./pages/MarketplaceEnquiryPage";

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
        <Route path="/database/:cardId" element={<CardDetailPage />} />
        <Route path="/master-set" element={<MasterSetPage />} />
        <Route path="/marketplace" element={<MarketplacePage />} />
        <Route path="/marketplace/card/:cardId" element={<MarketplaceCardPage />} />
        <Route path="/collection/:userId" element={<PublicCollectionPage />} />
        {user ? (
          <>
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/extras-for-sale" element={<ExtrasForSalePage />} />
            <Route path="/marketplace/enquiries" element={<MarketplaceEnquiriesPage />} />
            <Route path="/marketplace/enquiries/:enquiryId" element={<MarketplaceEnquiryPage />} />
            <Route path="/profile" element={<SettingsPage />} />
            <Route path="/settings" element={<Navigate to="/profile" replace />} />
          </>
        ) : (
          <Route path="/login" element={<LoginPage />} />
        )}
        <Route path="*" element={<Navigate to="/database" replace />} />
      </Route>
    </Routes>
  );
}
