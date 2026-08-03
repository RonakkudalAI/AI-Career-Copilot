import { redirect } from "next/navigation";

/** Resume builder was removed from the product flow. */
export default function Page() {
  redirect("/resume-analysis");
}
