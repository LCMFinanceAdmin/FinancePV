import { cn } from "@/lib/utils";

// ref is an ordinary prop under React 19 — no forwardRef needed. It is here so
// a caller can scroll one card into view, which is what the leave approval
// links rely on.
export function Card({ children, className, ref }: {
  children: React.ReactNode;
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div ref={ref} className={cn("cloudlight-card rounded-2xl", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("px-5 py-4 border-b border-[#dce9fb]", className)}>{children}</div>;
}

export function CardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}
