import Image from "next/image";

function initials(name: string): string {
  return name
    .replace(/^dr\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function DoctorAvatar({
  name,
  photoUrl,
  size = 96,
  priority = false,
}: {
  name: string;
  photoUrl: string | null;
  size?: number;
  priority?: boolean;
}) {
  if (photoUrl) {
    return (
      <Image
        src={photoUrl}
        alt={`Photo of ${name}`}
        width={size}
        height={size}
        priority={priority}
        className="shrink-0 rounded-full bg-slate-100 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-teal-600 to-cyan-600 font-bold text-white"
      style={{ width: size, height: size, fontSize: size / 3 }}
    >
      {initials(name) || "Dr"}
    </span>
  );
}
