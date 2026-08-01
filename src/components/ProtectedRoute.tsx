import { Navigate, Outlet } from 'react-router-dom';
import { useWarehouseStore } from '../store/useWarehouseStore';

export function ProtectedRoute() {
  const user = useWarehouseStore((s) => s.currentUser);
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
