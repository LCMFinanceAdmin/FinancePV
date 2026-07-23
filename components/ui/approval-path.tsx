import { Check, ChevronRight, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Finance", "EXCO", "Treasurer", "Bishop & Secretary"];

export function ApprovalPath({ currentIndex = 0, className }: { currentIndex?: number; className?: string }) {
  return (
    <section className={cn("cloudlight-glass rounded-2xl px-4 py-3.5", className)} aria-label="Payment voucher approval path">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-sm font-bold text-[#23456f]">Approval path</div>
          <div className="text-xs text-[#778da9]">Every payment remains traceable from review to authorisation.</div>
        </div>
        <span className="rounded-full bg-[#e8f2ff] px-2.5 py-1 text-[11px] font-semibold text-[#2563eb]">Step {Math.min(currentIndex + 1, STEPS.length)} of {STEPS.length}</span>
      </div>
      <ol className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-0">
        {STEPS.map((step, index) => {
          const complete = index < currentIndex;
          const current = index === currentIndex;
          return (
            <li key={step} className="flex flex-1 items-center gap-2 min-w-0">
              <div className={cn(
                "grid h-8 w-8 shrink-0 place-items-center rounded-xl text-xs font-bold",
                complete && "bg-emerald-100 text-emerald-700",
                current && "bg-[#2563eb] text-white shadow-[0_6px_14px_rgba(37,99,235,.22)]",
                !complete && !current && "bg-[#eef4fc] text-[#8ba0bb]"
              )}>
                {complete ? <Check size={15} strokeWidth={3} /> : current ? <CircleDot size={15} /> : index + 1}
              </div>
              <span className={cn("truncate text-xs font-semibold", current ? "text-[#1e4f95]" : complete ? "text-emerald-700" : "text-[#778da9]")}>{step}</span>
              {index < STEPS.length - 1 && <ChevronRight size={14} className="hidden sm:block mx-2 shrink-0 text-[#a7b9d2]" />}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
