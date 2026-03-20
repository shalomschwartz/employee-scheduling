"use client";

import { useEffect } from "react";

export default function PrintTrigger() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="no-print flex justify-end gap-2 mb-4">
      <button
        onClick={() => window.print()}
        style={{
          padding: "8px 20px",
          backgroundColor: "#4f46e5",
          color: "white",
          border: "none",
          borderRadius: "8px",
          fontSize: "14px",
          fontWeight: "600",
          cursor: "pointer",
        }}
      >
        הדפס / שמור PDF
      </button>
      <button
        onClick={() => window.close()}
        style={{
          padding: "8px 16px",
          backgroundColor: "#f3f4f6",
          color: "#374151",
          border: "none",
          borderRadius: "8px",
          fontSize: "14px",
          fontWeight: "600",
          cursor: "pointer",
        }}
      >
        סגור
      </button>
    </div>
  );
}
