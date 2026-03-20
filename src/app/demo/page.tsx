"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Credential {
  name?: string;
  email: string;
  password: string;
}

interface SeedResult {
  message: string;
  credentials: {
    manager: Credential;
    employees: Credential[];
  };
}

export default function DemoPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setupDemo() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/seed", { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setResult(data);
    } else {
      setError(data.message ?? "שגיאה בהגדרת הדמו");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">הגדרת דמו</h1>
          <p className="text-sm text-gray-500 mt-1">
            יצירת חברה לדוגמה עם עובדים ואילוצים מוגדרים מראש
          </p>
        </div>

        {!result ? (
          <Card>
            <CardContent className="py-8 text-center space-y-4">
              <p className="text-sm text-gray-600">
                לחץ על הכפתור ליצירת:
              </p>
              <ul className="text-sm text-gray-500 space-y-1 text-right">
                <li>• מנהל: manager@demo.com</li>
                <li>• אליס כהן (ראש משמרת): alice@demo.com</li>
                <li>• בוב לוי: bob@demo.com</li>
                <li>• קרול מזרחי: carol@demo.com</li>
              </ul>
              <p className="text-xs text-gray-400">סיסמה לכולם: demo1234</p>
              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}
              <Button onClick={setupDemo} loading={loading} size="md" className="w-full">
                הגדר דמו
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <p className="font-semibold text-green-700 text-sm">{result.message}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">מנהל</p>
                <CredRow label="אימייל" value={result.credentials.manager.email} />
                <CredRow label="סיסמה" value={result.credentials.manager.password} />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">עובדים</p>
                {result.credentials.employees.map((emp, i) => (
                  <div key={i} className="mb-3">
                    <p className="text-xs text-gray-700 font-medium mb-1">{emp.name}</p>
                    <CredRow label="אימייל" value={emp.email} />
                    <CredRow label="סיסמה" value={emp.password} />
                  </div>
                ))}
              </div>
              <a
                href="/login"
                className="block w-full text-center text-sm font-medium bg-brand-600 hover:bg-brand-700 text-white py-2 rounded-lg transition-colors"
              >
                כניסה למערכת
              </a>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function CredRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-mono text-gray-800">{value}</span>
    </div>
  );
}
