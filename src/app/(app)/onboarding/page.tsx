"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";

export default function OnboardingPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgName.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgName: orgName.trim() }),
      });
      if (!res.ok) throw new Error("Failed");
      router.push("/dashboard");
    } catch {
      setError("Failed to create organization. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-12">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Welcome to ShiftSync</h1>
        <p className="text-sm text-gray-500 mt-1">Set up your organization to get started.</p>
      </div>
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-900">Create your organization</h2>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
                {error}
              </div>
            )}
            <Input
              id="orgName"
              label="Organization name"
              placeholder="Acme Coffee Co."
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
              autoFocus
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" size="lg" loading={loading}>
              Create organization
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
