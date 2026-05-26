"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BudgetPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/control-center");
  }, [router]);
  return (
    <div className="p-8 text-center text-stone-400 text-sm">Redirecting to Control Center…</div>
  );
}
