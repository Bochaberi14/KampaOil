import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RoleRoute } from './components/RoleRoute';
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
            <Route
              path="/dashboard"
              element={
                <RoleRoute permission="view:dashboard">
                  <DashboardPage />
                </RoleRoute>
              }
            />
            <Route
              path="/production"
              element={
                <RoleRoute permission="view:production">
                  <ProductionPage />
                </RoleRoute>
              }
            />
            <Route
              path="/storage"
              element={
                <RoleRoute permission="view:storage">
                  <StoragePage />
                </RoleRoute>
              }
            />
            <Route
              path="/loading-bay"
              element={
                <RoleRoute permission="view:loading-bay">
                  <LoadingBayPage />
                </RoleRoute>
              }
            />
            <Route
              path="/dispatch"
              element={
                <RoleRoute permission="view:dispatch">
                  <DispatchPage />
                </RoleRoute>
              }
            />
            <Route
              path="/hold"
              element={
                <RoleRoute permission="view:hold">
                  <HoldPage />
                </RoleRoute>
              }
            />
            <Route
              path="/recall"
              element={
                <RoleRoute permission="view:recall">
                  <RecallPage />
                </RoleRoute>
              }
            />
            <Route
              path="/audit"
              element={
                <RoleRoute permission="view:audit">
                  <AuditPage />
                </RoleRoute>
              }
            />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
