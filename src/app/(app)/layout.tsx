import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { cn } from "@/lib/utils";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const isManager = session.user.role === "MANAGER";

  return (
    <div
      id="app-shell"
      suppressHydrationWarning
      className={cn(
        "min-h-screen flex flex-col",
        isManager ? "manager-canvas dark bg-surface-low text-navy" : "bg-surface-low"
      )}
    >
      {isManager && (
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('theme')==='light'){var e=document.getElementById('app-shell');if(e)e.classList.remove('dark')}}catch(e){}`,
          }}
        />
      )}
      <AppNav session={session} dark={isManager} />
      <main className={cn("flex-1 w-full px-4 py-6", isManager ? "max-w-[1500px] mx-auto sm:px-8" : "max-w-5xl mx-auto sm:px-6")}>
        {children}
      </main>
    </div>
  );
}
