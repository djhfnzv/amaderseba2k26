import { REVIEW_TAGS } from "@/types/database";

// Client-safe review rules (the database enforces the same ones).

export { REVIEW_TAGS };

export const RATING_LABEL: Record<number, string> = {
  1: "Poor",
  2: "Fair",
  3: "Good",
  4: "Very good",
  5: "Excellent",
};

/** Reviews can be written up to this long after the visit. */
export const REVIEW_WINDOW_DAYS = 30;
/** …and edited for this long after posting. */
export const REVIEW_EDIT_DAYS = 7;
/** The average is shown once a doctor has this many reviews. */
export const MIN_REVIEWS_FOR_AVERAGE = 3;
export const REVIEW_MAX_LENGTH = 1000;
export const PUBLIC_REVIEWS_PAGE = 5;

export const REVIEW_SORTS = [
  { value: "newest", label: "Newest" },
  { value: "highest", label: "Highest rated" },
  { value: "lowest", label: "Lowest rated" },
] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number]["value"];

export function authorName(author: string | null) {
  return author ?? "Anonymous patient";
}

/** Average to show, or null while there are too few reviews. */
export function shownAverage(stats: { review_count: number; rating_avg: number | string | null } | null): number | null {
  if (!stats || stats.review_count < MIN_REVIEWS_FOR_AVERAGE || stats.rating_avg == null) return null;
  return Number(stats.rating_avg);
}

/** Whether the patient can still write / edit a review of this visit. */
export function reviewWindows(slotEnd: string, review: { created_at: string; status: string } | null) {
  const now = Date.now();
  return {
    canWrite: Date.parse(slotEnd) > now - REVIEW_WINDOW_DAYS * 86_400_000,
    canEdit: !!review && review.status === "published" && Date.parse(review.created_at) > now - REVIEW_EDIT_DAYS * 86_400_000,
  };
}
