import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "MANAGER") redirect("/my-schedule");

  return (
    <div className="space-y-4 max-w-lg">
      <h1 className="text-xl font-bold text-gray-900">Settings</h1>
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-gray-400 text-sm">
            Organization settings (roles, shift times, min staffing) coming soon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
