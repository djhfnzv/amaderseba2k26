export function Alert({
  kind = "error",
  children,
}: {
  kind?: "error" | "success";
  children: React.ReactNode;
}) {
  const styles =
    kind === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={`animate-fade-in rounded-lg border px-3 py-2 text-sm ${styles}`}
    >
      {children}
    </div>
  );
}
