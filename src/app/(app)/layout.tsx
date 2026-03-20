import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppNav session={session} />
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}
