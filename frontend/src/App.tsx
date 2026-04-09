import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/Auth/ProtectedRoute";
import OperatorLayout from "@/components/Layout/OperatorLayout";
import CoordinatorLayout from "@/components/Layout/CoordinatorLayout";
import SuperAdminLayout from "@/components/Layout/SuperAdminLayout";
import MissionTabNav from "@/components/Layout/MissionTabNav";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/operator-center/DashboardPage";
import MissionListPage from "@/pages/operator-center/MissionListPage";
import MissionOverviewPage from "@/pages/operator-center/MissionOverviewPage";
import MissionConfigPage from "@/pages/operator-center/MissionConfigPage";
import MissionMapPage from "@/pages/operator-center/MissionMapPage";
import MissionValidationPage from "@/pages/operator-center/MissionValidationPage";
import AirportPage from "@/pages/operator-center/AirportPage";
import OperatorDronesPage from "@/pages/operator-center/OperatorDronesPage";
import OperatorDroneDetailPage from "@/pages/operator-center/OperatorDroneDetailPage";
import AirportListPage from "@/pages/coordinator-center/AirportListPage";
import AirportEditPage from "@/pages/coordinator-center/AirportEditPage";
import InspectionListPage from "@/pages/coordinator-center/InspectionListPage";
import InspectionEditPage from "@/pages/coordinator-center/InspectionEditPage";
import DroneListPage from "@/pages/coordinator-center/DroneListPage";
import DroneEditPage from "@/pages/coordinator-center/DroneEditPage";
import SuperAdminUsersPage from "@/pages/super-admin/SuperAdminUsersPage";
import SuperAdminAirportsPage from "@/pages/super-admin/SuperAdminAirportsPage";
import SuperAdminSystemPage from "@/pages/super-admin/SuperAdminSystemPage";

function CatchAllRedirect() {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return null;
  if (isAuthenticated) {
    if (user?.role === "SUPER_ADMIN") return <Navigate to="/super-admin/users" replace />;
    if (user?.role === "COORDINATOR") return <Navigate to="/coordinator-center/airports" replace />;
    return <Navigate to="/operator-center/dashboard" replace />;
  }
  return <Navigate to="/login" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* operator center */}
        <Route element={<ProtectedRoute requiredRole="OPERATOR" />}>
          <Route path="/operator-center" element={<OperatorLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="missions" element={<MissionListPage />} />
            <Route path="missions/:id" element={<MissionTabNav />}>
              <Route path="overview" element={<MissionOverviewPage />} />
              <Route
                path="configuration"
                element={<MissionConfigPage />}
              />
              <Route path="map" element={<MissionMapPage />} />
              <Route
                path="validation-export"
                element={<MissionValidationPage />}
              />
            </Route>
            <Route path="airport" element={<AirportPage />} />
            <Route path="drones" element={<OperatorDronesPage />} />
            <Route path="drones/:id" element={<OperatorDroneDetailPage />} />
          </Route>
        </Route>

        {/* coordinator center */}
        <Route element={<ProtectedRoute requiredRole="COORDINATOR" />}>
          <Route path="/coordinator-center" element={<CoordinatorLayout />}>
            <Route path="airports" element={<AirportListPage />} />
            <Route path="airports/:id" element={<AirportEditPage />} />
            <Route path="inspections" element={<InspectionListPage />} />
            <Route path="inspections/:id" element={<InspectionEditPage />} />
            <Route path="drones" element={<DroneListPage />} />
            <Route path="drones/:id" element={<DroneEditPage />} />
          </Route>
        </Route>

        {/* super admin */}
        <Route element={<ProtectedRoute requiredRole="SUPER_ADMIN" />}>
          <Route element={<SuperAdminLayout />}>
            <Route path="/super-admin/users" element={<SuperAdminUsersPage />} />
            <Route path="/super-admin/airports" element={<SuperAdminAirportsPage />} />
            <Route path="/super-admin/system" element={<SuperAdminSystemPage />} />
          </Route>
        </Route>

        {/* default redirect */}
        <Route path="*" element={<CatchAllRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
