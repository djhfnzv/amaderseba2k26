"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";

/**
 * Landing page <-> log in / sign up transitions (browser View Transitions).
 *
 * The button you click on the landing page is given the view-transition name
 * "auth-card", the same name the form card has, so the browser morphs the
 * button into the card. `data-vt` on <html> picks the matching page-level
 * animation in globals.css ("to-auth" / "from-auth").
 */

let clearTimer: ReturnType<typeof setTimeout> | undefined;

export function markViewTransition(kind: "to-auth" | "from-auth") {
  document.documentElement.dataset.vt = kind;
  clearTimeout(clearTimer);
  clearTimer = setTimeout(() => delete document.documentElement.dataset.vt, 1200);
}

function isPlainClick(e: MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

/** A landing-page link to /login or /signup that grows into the form card. */
export function AuthLink({ onClick, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      transitionTypes={["to-auth"]}
      data-auth-link=""
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || !isPlainClick(e)) return;
        // Names must be unique on the page: only the clicked button gets it.
        document.querySelectorAll<HTMLElement>("[data-auth-link]").forEach((el) => (el.style.viewTransitionName = ""));
        e.currentTarget.style.viewTransitionName = "auth-card";
        markViewTransition("to-auth");
      }}
    />
  );
}

/** Wraps links on the auth pages that lead back to the landing page. */
export function BackToLanding({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="contents"
      onClickCapture={(e) => {
        if (isPlainClick(e)) markViewTransition("from-auth");
      }}
    >
      {children}
    </span>
  );
}
