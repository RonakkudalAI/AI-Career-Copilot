import { Suspense } from "react";
import { AnalysisHistory } from "@/features/resume/resume-flow";

export default function Page() {
  return (
    <Suspense fallback={<p>Loading resume analysis…</p>}>
      <AnalysisHistory />
    </Suspense>
  );
}
