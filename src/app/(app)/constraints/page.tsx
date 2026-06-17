import { redirect } from "next/navigation";

// Superseded by the dashboard's inline availability overview (זמינות עובדים panel).
export default function ConstraintsPage() {
  redirect("/dashboard");
}
