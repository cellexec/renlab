import { RequireProject } from "../components/RequireProject";

export default function DatabaseLayout({ children }: { children: React.ReactNode }) {
  return <RequireProject>{children}</RequireProject>;
}
