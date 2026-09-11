import { Check, ChevronRight, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Finance", "EXCO", "Treasurer", "Bishop & Secretary"];

export function ApprovalPath({ currentIndex = 0, className }: { currentIndex?: number; className?: string }) {
  const stepNo = Math.min(currentIndex + 1, STEPS.length);
  const currentLabel = STEPS[Math.min(currentIndex, STEPS.length - 1)];
  return (
    <section className={cn("cloudlight-glass rounded-2xl", className)} aria-label="Payment voucher approval path">
      {/* Mobile: a single compact line so it doesn't crowd the queue. */}
      <div className="flex sm:hidden items-center gap-2 px-3.5 py-2.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-[#2563eb] text-white">
          <CircleDot size={13} />
        </span>
        <span className="text-xs font-semibold text-[#23456f] shrink-0">Approval path</span>
        <span className="text-xs text-[#778da9] truncate min-w-0">· {currentLabel}</span>
        <span className="ml-auto shrink-0 rounded-full bg-[#e8f2ff] px-2 py-0.5 text-[10px] font-semibold text-[#2563eb]">Step {stepNo}/{STEPS.length}</span>
      </div>

      {/* Desktop / tablet: the full traceable path. */}
      <div className="hidden sm:block px-3.5 py-3">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div>
            <div className="text-[13px] font-bold text-[#23456f]">Approval path</div>
            <div className="text-[11px] leading-tight text-[#778da9]">Every payment remains traceable from review to authorisation.</div>
          </div>
          <span className="shrink-0 rounded-full bg-[#e8f2ff] px-2 py-0.5 text-[10px] font-semibold text-[#2563eb]">Step {stepNo} of {STEPS.length}</span>
        </div>
        <ol className="flex items-center gap-0">
          {STEPS.map((step, index) => {
            const complete = index < currentIndex;
            const current = index === currentIndex;
            return (
              <li key={step} className="flex flex-1 items-center gap-2 min-w-0">
                <div className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold",
                  complete && "bg-emerald-100 text-emerald-700",
                  current && "bg-[#2563eb] text-white shadow-[0_6px_14px_rgba(37,99,235,.22)]",
                  !complete && !current && "bg-[#eef4fc] text-[#8ba0bb]"
                )}>
                  {complete ? <Check size={13} strokeWidth={3} /> : current ? <CircleDot size={13} /> : index + 1}
                </div>
                <span className={cn("truncate text-[11px] font-semibold", current ? "text-[#1e4f95]" : complete ? "text-emerald-700" : "text-[#778da9]")}>{step}</span>
                {index < STEPS.length - 1 && <ChevronRight size={12} className="mx-1 shrink-0 text-[#a7b9d2]" />}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
