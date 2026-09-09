"use client";
import { useActionState } from "react";
import { bumpHidden, plainBound, plainHidden, type ProbeState } from "./actions";

export function Form({ projectId }: { projectId: string }) {
  const [state, action] = useActionState<ProbeState, FormData>(bumpHidden, {
    n: 0,
  });
  return (
    <>
      <form action={action} id="a">
        <input type="hidden" name="projectId" value={projectId} />
        <p>n = {state.n}</p>
        <button type="submit">A: hidden + useActionState</button>
      </form>
      <form action={plainBound.bind(null, projectId, "t1")} id="b">
        <button type="submit">B: plain bound</button>
      </form>
      <form action={plainHidden} id="c">
        <input type="hidden" name="projectId" value={projectId} />
        <button type="submit">C: plain hidden</button>
      </form>
    </>
  );
}
