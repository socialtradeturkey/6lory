import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Admin from "./pages/Admin";
import Leaderboard from "./pages/Leaderboard";
import Notifications from "./pages/Notifications";
import NotFound from "./pages/NotFound";
import Profile from "./pages/Profile";
import Rewards from "./pages/Rewards";
import Tasks from "./pages/Tasks";
import TaskDetail from "./pages/TaskDetail";
import { Route, Switch } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { POST_LOGIN_PATH_KEY } from "./lib/loginBridge";
import { useEffect } from "react";

function Router() {
  return <Switch><Route path="/" component={Home} /><Route path="/tasks" component={Tasks} /><Route path="/tasks/:id" component={TaskDetail} /><Route path="/rewards" component={Rewards} /><Route path="/leaderboard" component={Leaderboard} /><Route path="/profile" component={Profile} /><Route path="/notifications" component={Notifications} /><Route path="/admin" component={Admin} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>;
}

const MANAGEMENT_ROLES = new Set([
  "admin",
  "moderator",
  "verification_reviewer",
  "reward_manager",
]);

function PostLoginDestination() {
  const { isAuthenticated, loading, user } = useAuth();

  useEffect(() => {
    if (loading || !isAuthenticated) return;
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    try {
      const destination = sessionStorage.getItem(POST_LOGIN_PATH_KEY);
      if (destination) {
        sessionStorage.removeItem(POST_LOGIN_PATH_KEY);
        if (destination !== currentPath) window.location.replace(destination);
        return;
      }
    } catch {
      // Session storage may be unavailable; continue with the role-based fallback.
    }

    // A management user who just completed login is otherwise left at the
    // regular user dashboard when the provider returns to "/". Keep the
    // explicit ?view=user escape hatch so admins can still use the consumer UI.
    if (
      MANAGEMENT_ROLES.has(user?.role ?? "") &&
      window.location.pathname === "/" &&
      !window.location.search
    ) {
      window.location.replace("/admin");
    }
  }, [isAuthenticated, loading, user?.role]);

  return null;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light" switchable><TooltipProvider><PostLoginDestination /><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
