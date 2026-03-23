"use client";

import { useEffect, useState } from "react";

export function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;
    if (standalone) {
      setIsInstalled(true);
      return;
    }

    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent));

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (isInstalled || (!deferredPrompt && !isIOS)) return null;

  async function handleClick() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    } else {
      setShowModal(true);
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 px-2 py-1 rounded hover:bg-brand-50 transition-colors font-medium"
        title="הוסף למסך הבית"
      >
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span>הוסף למסך</span>
      </button>

      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-sm"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-gray-900 text-base mb-4">הוסף למסך הבית</h3>
            <ol className="space-y-4 text-sm text-gray-700">
              <li className="flex items-start gap-3">
                <span className="font-bold text-brand-600 shrink-0 w-5">1.</span>
                <span>
                  לחץ על כפתור השיתוף{" "}
                  <span className="inline-flex items-center justify-center w-6 h-6 bg-gray-100 rounded text-gray-700 text-sm font-bold">
                    ↑
                  </span>{" "}
                  בתחתית הדפדפן
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-bold text-brand-600 shrink-0 w-5">2.</span>
                <span>גלול למטה ולחץ על <strong>"הוסף למסך הבית"</strong></span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-bold text-brand-600 shrink-0 w-5">3.</span>
                <span>לחץ <strong>"הוסף"</strong> בחלון שייפתח</span>
              </li>
            </ol>
            <button
              onClick={() => setShowModal(false)}
              className="mt-6 w-full py-2.5 bg-brand-600 text-white rounded-xl font-medium text-sm"
            >
              הבנתי
            </button>
          </div>
        </div>
      )}
    </>
  );
}
