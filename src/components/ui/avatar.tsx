// 24 visually distinct base colors — covers most orgs without repeating
const EMP_PALETTE_HEX = [
  "#273c75","#6c5ce7","#e84393","#0984e3",
  "#e17055","#00cec9","#a29bfe","#2d3436",
  "#00b894","#d63031","#fdcb6e","#6d4c41",
  "#0097a7","#ad1457","#558b2f","#4527a0",
  "#f4511e","#039be5","#43a047","#8e24aa",
  "#fb8c00","#00838f","#c62828","#37474f",
];

/** Unique hex color per employee index, generating extras via HSL if the palette runs out.
 *  Both the dashboard and settings list employees sorted by name, so index colors match. */
export function empHex(index: number): string {
  if (index < EMP_PALETTE_HEX.length) return EMP_PALETTE_HEX[index];
  const hue = Math.round((index - EMP_PALETTE_HEX.length) * (360 / 12)) % 360;
  return `hsl(${hue},65%,38%)`;
}

/** Colored initial circle for an employee. */
export function Avatar({ name, color, size = 18 }: { name: string | null; color: string; size?: number }) {
  const ini = (name?.trim()?.charAt(0)) || "?";
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-bold text-white flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: color, fontSize: Math.round(size * 0.5) }}
    >
      {ini}
    </span>
  );
}
