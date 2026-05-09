import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { AuthGate } from "@/components/AuthGate";
import { MobileNav } from "@/components/MobileNav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="min-h-screen flex bg-jm-bg">
        <Sidebar />
        <div className="flex-1">
          <Topbar />
          <MobileNav />
          <div className="p-6">{children}</div>
        </div>
      </div>
    </AuthGate>
  );
}
