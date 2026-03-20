import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";

export default async function SchedulePage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "MANAGER") redirect("/my-schedule");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Schedule</h1>
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-gray-400 text-sm">
            Schedule generation &amp; editing coming soon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
