import { RequireProject } from "../components/RequireProject";

export default function PipelinesLayout({ children }: { children: React.ReactNode }) {
  return <RequireProject>{children}</RequireProject>;
}
