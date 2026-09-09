import { Form } from "./Form";
import { requireUser } from "@/lib/session";
export const dynamic = "force-dynamic";
export default async function ProbePage() {
  const user = await requireUser();
  return (
    <div>
      <p>user = {user.email}</p>
      <Form projectId="abc123" />
    </div>
  );
}
