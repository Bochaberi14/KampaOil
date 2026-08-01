import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProductionPage } from './pages/ProductionPage';
import { StoragePage } from './pages/StoragePage';
import { LoadingBayPage } from './pages/LoadingBayPage';
import { DispatchPage } from './pages/DispatchPage';
import { HoldPage } from './pages/HoldPage';
import { RecallPage } from './pages/RecallPage';
import { AuditPage } from './pages/AuditPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/production" element={<ProductionPage />} />
            <Route path="/storage" element={<StoragePage />} />
            <Route path="/loading-bay" element={<LoadingBayPage />} />
            <Route path="/dispatch" element={<DispatchPage />} />
            <Route path="/hold" element={<HoldPage />} />
            <Route path="/recall" element={<RecallPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
