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

function PostLoginDestination() {
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (loading || !isAuthenticated) return;
    try {
      const destination = sessionStorage.getItem(POST_LOGIN_PATH_KEY);
      if (!destination) return;
      sessionStorage.removeItem(POST_LOGIN_PATH_KEY);
      if (destination !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        window.location.replace(destination);
      }
    } catch {
      // Session storage may be unavailable; the user remains on the safe home route.
    }
  }, [isAuthenticated, loading]);

  return null;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light" switchable><TooltipProvider><PostLoginDestination /><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
