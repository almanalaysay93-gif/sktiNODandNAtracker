import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Redirect, Switch } from "wouter";
import DashboardLayout from "./components/DashboardLayout";
import { DashboardLayoutSkeleton } from "./components/DashboardLayoutSkeleton";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import AreaDetail from "./pages/AreaDetail";
import Areas from "./pages/Areas";
import CalendarPage from "./pages/Calendar";
import Dashboard from "./pages/Dashboard";
import Licenses from "./pages/Licenses";
import NurseProfile from "./pages/NurseProfile";
import { NurseEditPage } from "./pages/NurseEditPage";
import Nurses from "./pages/Nurses";
import MyProfilePage from "./pages/MyProfilePage";
import Reports from "./pages/Reports";
import SettingsPage from "./pages/Settings";
import Trainings from "./pages/Trainings";
import Seminars from "./pages/Seminars";
import SeminarDetail from "./pages/SeminarDetail";
import SmartImportPage from "./pages/SmartImport";

// Admin/supervisor routes. Signed-in non-admin (staff) accounts are bounced
// to /me — they only ever get their own profile, never the full dashboard.
function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (!loading && user && user.role !== "admin") {
    return <Redirect to="/me" />;
  }
  return <DashboardLayout>{children}</DashboardLayout>;
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) return <Redirect to="/dashboard" />;
  return <Redirect to={user.role === "admin" ? "/dashboard" : "/me"} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        <RootRedirect />
      </Route>
      <Route path="/me">
        <MyProfilePage />
      </Route>
      <Route path="/dashboard">
        <Protected>
          <Dashboard />
        </Protected>
      </Route>
      <Route path="/areas">
        <Protected>
          <Areas />
        </Protected>
      </Route>
      <Route path="/areas/:id">
        <Protected>
          <AreaDetail />
        </Protected>
      </Route>
      <Route path="/nurses">
        <Protected>
          <Nurses />
        </Protected>
      </Route>
      <Route path="/nurses/:id">
        <Protected>
          <NurseProfile />
        </Protected>
      </Route>
      <Route path="/nurses/:id/edit">
        <Protected>
          <NurseEditPage />
        </Protected>
      </Route>
      <Route path="/trainings">
        <Protected>
          <Trainings />
        </Protected>
      </Route>
      <Route path="/seminars/:id">
        <Protected>
          <SeminarDetail />
        </Protected>
      </Route>
      <Route path="/seminars">
        <Protected>
          <Seminars />
        </Protected>
      </Route>
      <Route path="/licenses">
        <Protected>
          <Licenses />
        </Protected>
      </Route>
      <Route path="/calendar">
        <Protected>
          <CalendarPage />
        </Protected>
      </Route>
      <Route path="/reports">
        <Protected>
          <Reports />
        </Protected>
      </Route>
      <Route path="/smart-import">
        <Protected>
          <SmartImportPage />
        </Protected>
      </Route>
      <Route path="/settings">
        <Protected>
          <SettingsPage />
        </Protected>
      </Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <div aria-hidden className="glass-bg" />
        <div className="relative z-[1] min-h-screen">
          <TooltipProvider>
            <Toaster position="top-right" richColors />
            <Router />
          </TooltipProvider>
        </div>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
