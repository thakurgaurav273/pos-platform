import { OperatorShell } from "@/components/Operator/OperatorShell";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <OperatorShell>{children}</OperatorShell>;
}
