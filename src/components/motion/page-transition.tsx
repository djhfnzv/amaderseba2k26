"use client";

import { ViewTransition } from "react";

/**
 * Fades page content in on navigation (browser View Transitions via React).
 * Used from route templates, which re-mount on each navigation. Browsers
 * without View Transitions simply show the new page instantly.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
