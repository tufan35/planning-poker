"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

function newRoomId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  }
  return Math.random().toString(36).slice(2, 12);
}

export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");

  const createRoom = useCallback(() => {
    router.push(`/room/${newRoomId()}`);
  }, [router]);

  const joinRoom = useCallback(() => {
    const code = joinCode.trim();
    if (!code) return;
    router.push(`/room/${encodeURIComponent(code)}`);
  }, [joinCode, router]);

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-16">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(52, 211, 153, 0.35), transparent), radial-gradient(ellipse 60% 40% at 100% 50%, rgba(16, 185, 129, 0.12), transparent)",
        }}
      />
      <div className="relative z-10 w-full max-w-lg text-center">
        <p className="font-[family-name:var(--font-syne)] text-xs font-semibold uppercase tracking-[0.25em] text-emerald-400/90">
          Agile tahmin
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-syne)] text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Planning Poker
        </h1>
        <p className="mx-auto mt-4 max-w-md text-balance text-zinc-400">
          Parabol tarzı Fibonacci kartları, gerçek zamanlı oylar ve görev başına otomatik uzlaşı
          (en çok seçilen puan).
        </p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={createRoom}
            className="rounded-2xl bg-emerald-500 px-8 py-4 font-semibold text-emerald-950 shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-400"
          >
            Oda oluştur
          </button>
          <Link
            href="https://www.parabol.co/"
            className="rounded-2xl border border-white/15 px-8 py-4 font-medium text-zinc-300 transition hover:border-white/25 hover:bg-white/5"
            target="_blank"
            rel="noopener noreferrer"
          >
            Parabol nedir?
          </Link>
        </div>

        <div className="mx-auto mt-14 max-w-sm rounded-2xl border border-white/10 bg-black/30 p-6 text-left backdrop-blur">
          <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Oda kodu ile katıl
          </label>
          <div className="mt-2 flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="örn. a1b2c3d4e5"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-3 font-mono text-sm text-white outline-none ring-emerald-500/30 placeholder:text-zinc-600 focus:ring-2"
              onKeyDown={(e) => e.key === "Enter" && joinRoom()}
            />
            <button
              type="button"
              onClick={joinRoom}
              className="shrink-0 rounded-xl bg-white/10 px-4 py-3 text-sm font-medium text-white hover:bg-white/15"
            >
              Katıl
            </button>
          </div>
        </div>

        <p className="mt-10 text-xs text-zinc-600">
          Geliştirme: <code className="text-zinc-500">npm run dev</code> ile Next.js ve PartyKit birlikte
          çalışır.
        </p>
      </div>
    </div>
  );
}
