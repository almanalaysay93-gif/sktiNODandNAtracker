import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { startLogin } from "@/const";
import {
  Bell,
  CalendarDays,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LogOut,
  MapPin,
  PanelLeft,
  FileBarChart,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./ui/command";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { ScrollArea } from "./ui/scroll-area";

export const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: MapPin, label: "Areas of Assignment", path: "/areas" },
  { icon: Users, label: "Nurses", path: "/nurses" },
  { icon: ClipboardList, label: "Trainings", path: "/trainings" },
  { icon: CreditCard, label: "Licenses", path: "/licenses" },
  { icon: CalendarDays, label: "Calendar", path: "/calendar" },
  { icon: FileBarChart, label: "Reports", path: "/reports" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 250;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <HeartbeatIcon />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-center">SKTI NurseTrack</h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Sign in as the supervisor to manage nurse training, licensing, and area assignments.
            </p>
          </div>
          <Button
            onClick={() => startLogin()}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent>
    </SidebarProvider>
  );
}

function HeartbeatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-9 w-9 text-primary" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({ children, setSidebarWidth }: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = NAV_ITEMS.find((item) => item.path === location);
  const isMobile = useIsMobile();
  const [searchOpen, setSearchOpen] = useState(false);
  const { data: nurseSearchResults } = trpc.nurses.search.useQuery(
    { query: "" },
    { enabled: false },
  );

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-primary" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                    </svg>
                  </div>
                  <span className="font-semibold tracking-tight truncate">NurseTrack</span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {NAV_ITEMS.map((item) => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={cn("h-10 transition-all font-normal", isActive && "bg-primary/10 text-primary hover:bg-primary/10")}
                    >
                      <item.icon className={cn("h-4 w-4", isActive ? "text-primary" : "")} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">{user?.name || "-"}</p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">{user?.email || "-"}</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setLocation("/settings")} className="cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={cn("absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors", isCollapsed && "hidden")}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        <div className="flex border-b h-16 items-center justify-between bg-background/95 px-2 md:px-4 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
          <div className="flex items-center gap-2 min-w-0">
            <SidebarTrigger className="h-9 w-9 rounded-lg bg-background shrink-0" />
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="tracking-tight text-foreground text-sm md:text-base truncate">
                {activeMenuItem?.label ?? "SKTI NurseTrack"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-lg hidden sm:flex"
              onClick={() => setSearchOpen(true)}
              aria-label="Search nurses"
            >
              <Search className="h-4 w-4" />
            </Button>
            <NotificationsBell />
          </div>
        </div>
        {isMobile && <MobileBottomNav />}
        <main className="flex-1 p-3 md:p-5 pb-20 md:pb-5">{children}</main>
      </SidebarInset>

      <NurseSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}

function NotificationsBell() {
  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery();
  const [open, setOpen] = useState(false);
  const { data: notifications, refetch } = trpc.notifications.list.useQuery();
  const markAllRead = trpc.notifications.markAllRead.useMutation();

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="rounded-lg relative"
        onClick={() => setOpen(true)}
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {(unreadCount ?? 0) > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Notifications</SheetTitle>
          </SheetHeader>
          <div className="flex justify-end px-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await markAllRead.mutateAsync(undefined as never);
                refetch();
              }}
            >
              Mark all read
            </Button>
          </div>
          <ScrollArea className="h-[calc(100vh-8rem)] px-4">
            {notifications?.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">No notifications yet.</p>
            )}
            <div className="space-y-2">
              {notifications?.map((n) => (
                <NotificationRow key={n.id} notification={n} onRead={() => refetch()} />
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}

function NotificationRow({
  notification,
  onRead,
}: {
  notification: {
    id: number;
    type: string;
    severity: string;
    title: string;
    message: string | null;
    nurseId: number | null;
    relatedEntityType: string | null;
    relatedEntityId: number | null;
    readAt: Date | null;
    createdAt: Date;
  };
  onRead: () => void;
}) {
  const [, setLocation] = useLocation();
  const markRead = trpc.notifications.markRead.useMutation();

  const severityColor =
    notification.severity === "urgent_or_expired"
      ? "border-l-destructive"
      : notification.severity === "upcoming_renewal"
        ? "border-l-orange-500"
        : notification.severity === "attention"
          ? "border-l-yellow-500"
          : "border-l-blue-500";

  const handleOpen = () => {
    if (!notification.readAt) markRead.mutate({ id: notification.id });
    setTimeout(onRead, 200);
    if (notification.nurseId) setLocation(`/nurses/${notification.nurseId}`);
    else if (notification.relatedEntityType === "customEvent" && notification.relatedEntityId) setLocation(`/calendar`);
    onRead();
  };

  return (
    <button
      onClick={handleOpen}
      className={cn(
        "w-full text-left border-l-4 rounded-md p-3 transition-colors hover:bg-accent",
        severityColor,
        !notification.readAt && "bg-accent/40",
      )}
    >
      <p className="text-sm font-medium leading-snug">{notification.title}</p>
      {notification.message && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{notification.message}</p>}
      <p className="text-[11px] text-muted-foreground mt-1.5">
        {new Date(notification.createdAt).toLocaleString()}
      </p>
    </button>
  );
}

function NurseSearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [query, setQuery] = useState("");
  const { data: results } = trpc.nurses.search.useQuery({ query: query.trim() }, { enabled: open && query.trim().length > 0 });
  const [, setLocation] = useLocation();

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search nurses by name or employee ID..." value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>{query.trim() ? "No nurses found." : "Type to search nurses."}</CommandEmpty>
        <CommandGroup heading="Nurses">
          {results?.map((n) => (
            <CommandItem
              key={n.id}
              onSelect={() => {
                onOpenChange(false);
                setLocation(`/nurses/${n.id}`);
              }}
            >
              <Users className="h-4 w-4 mr-2 text-muted-foreground" />
              <span>{n.firstName} {n.lastName}</span>
              <span className="text-xs text-muted-foreground ml-2">{n.employeeId}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

function MobileBottomNav() {
  const [location, setLocation] = useLocation();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:backdrop-blur md:hidden">
      <div className="grid grid-cols-6 items-center h-16">
        {NAV_ITEMS.slice(0, 5).map((item) => {
          const active = location === item.path;
          return (
            <button
              key={item.path}
              onClick={() => setLocation(item.path)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 h-full transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] leading-none truncate max-w-full px-1">{item.label.split(" ")[0]}</span>
            </button>
          );
        })}
        <MoreMenu />
      </div>
    </nav>
  );
}

function MoreMenu() {
  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "flex flex-col items-center justify-center gap-1 h-full transition-colors",
          NAV_ITEMS.slice(5).some((i) => i.path === location) ? "text-primary" : "text-muted-foreground",
        )}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
        <span className="text-[10px] leading-none">More</span>
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[60vh] rounded-t-2xl">
          <div className="grid grid-cols-4 gap-4 pt-4">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.path}
                onClick={() => {
                  setOpen(false);
                  setLocation(item.path);
                }}
                className={cn(
                  "flex flex-col items-center gap-2 py-3 rounded-lg transition-colors",
                  location === item.path ? "bg-primary/10 text-primary" : "hover:bg-accent",
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-xs text-center leading-tight">{item.label}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
