"use server";
export type ProbeState = { n: number };

// Pattern A: id arrives in the form body, action is unbound.
export async function bumpHidden(
  prev: ProbeState,
  formData: FormData,
): Promise<ProbeState> {
  return { n: prev.n + Number(formData.get("projectId") ? 1 : 0) };
}

// Pattern B: plain form action (no useActionState) with bound args.
export async function plainBound(projectId: string, taskId: string) {
  void projectId;
  void taskId;
}

// Pattern C: plain form action, unbound, ids from the body.
export async function plainHidden(formData: FormData) {
  void formData.get("projectId");
}
