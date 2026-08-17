import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Redirect, Switch } from "wouter";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import AreaDetail from "./pages/AreaDetail";
import Areas from "./pages/Areas";
import CalendarPage from "./pages/Calendar";
import Dashboard from "./pages/Dashboard";
import Licenses from "./pages/Licenses";
import NurseProfile from "./pages/NurseProfile";
import Nurses from "./pages/Nurses";
import Reports from "./pages/Reports";
import SettingsPage from "./pages/Settings";
import Trainings from "./pages/Trainings";

function Protected({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/dashboard" />
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
      <Route path="/trainings">
        <Protected>
          <Trainings />
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
        <TooltipProvider>
          <Toaster position="top-right" richColors />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
