// The KidTasks brand mark — three overlapping rounded squares (yellow,
// coral, teal) with a checkmark on the front square. Fixed brand colors,
// intentionally not theme-adaptive (unlike the old Swords-in-an-accent-box
// placeholder it replaces) — a logo mark stays constant across color themes.
export default function AppLogo({ size = 32, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className={className}
      aria-hidden="true"
    >
      <rect x="14" y="14" width="94" height="94" rx="26" fill="#FFC94D" />
      <rect x="52" y="52" width="94" height="94" rx="26" fill="#FF6B6B" stroke="#FFFFFF" strokeWidth="9" />
      <rect x="90" y="90" width="94" height="94" rx="26" fill="#2FB3A8" stroke="#FFFFFF" strokeWidth="9" />
      <path d="M112,138 L129,155 L163,116" fill="none" stroke="#FFFFFF" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
