import { ViewTransition } from "react";

/** Re-mounts on navigation so page content can animate in. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition
      enter={{ "to-auth": "auth-in", default: "page-enter" }}
      exit={{ "from-auth": "auth-out", default: "page-exit" }}
      default="none"
    >
      <div>{children}</div>
    </ViewTransition>
  );
}
