import { PageTransition } from "@/components/motion/page-transition";

/** Re-mounts on navigation so page content can animate in. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
