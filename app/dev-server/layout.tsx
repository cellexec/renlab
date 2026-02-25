import { RequireProject } from "../components/RequireProject";

export default function DevServerLayout({ children }: { children: React.ReactNode }) {
  return <RequireProject>{children}</RequireProject>;
}
