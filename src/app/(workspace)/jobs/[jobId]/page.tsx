import { JobDetail } from "@/features/jobs/jobs"; export default async function Page({ params }: { params: Promise<{ jobId: string }> }) { return <JobDetail jobId={(await params).jobId} />; }
