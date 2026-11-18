export function OpticalSetupDiagram({
  cameraDistanceCm = 25,
  diffuserDistanceCm = 18,
}: {
  cameraDistanceCm?: number;
  diffuserDistanceCm?: number;
}) {
  return (
    <div className="w-full rounded-lg border border-sky-200 bg-sky-50/60 p-4">
      <svg
        viewBox="0 0 760 240"
        className="w-full h-auto"
        role="img"
        aria-label="Controlled diffuse backlighting optical inspection setup diagram"
      >
        {/* Bench baseline */}
        <line x1="36" y1="192" x2="724" y2="192" stroke="#94A3B8" strokeWidth="2" />

        {/* Diffuse LED Light Box */}
        <rect x="64" y="42" width="38" height="150" rx="4" fill="#1E3A5F" />
        <rect x="102" y="48" width="16" height="138" rx="2" fill="#FEF9C3" stroke="#0284C7" strokeWidth="1.5" />
        <text x="88" y="212" textAnchor="middle" fill="#0F294A" fontSize="11" fontWeight="600">
          LED Backlight
        </text>
        <text x="88" y="226" textAnchor="middle" fill="#475569" fontSize="10">
          &amp; Diffuser Sheet
        </text>

        {/* Diffuse light rays */}
        <line x1="122" y1="74" x2="318" y2="86" stroke="#38BDF8" strokeWidth="1.5" strokeDasharray="5 4" />
        <line x1="122" y1="118" x2="318" y2="118" stroke="#38BDF8" strokeWidth="1.5" strokeDasharray="5 4" />
        <line x1="122" y1="162" x2="318" y2="150" stroke="#38BDF8" strokeWidth="1.5" strokeDasharray="5 4" />

        {/* Distance arrow: Bottle to Diffuser (18 cm) */}
        <line x1="122" y1="28" x2="318" y2="28" stroke="#0284C7" strokeWidth="1.5" />
        <polygon points="122,28 130,24 130,32" fill="#0284C7" />
        <polygon points="318,28 310,24 310,32" fill="#0284C7" />
        <text x="220" y="20" textAnchor="middle" fill="#0F294A" fontSize="11" fontWeight="600">
          Bottle-to-Diffuser: ~{diffuserDistanceCm} cm
        </text>

        {/* Glass Bottle / Jar */}
        <rect x="334" y="64" width="28" height="16" rx="2" fill="#E0F2FE" stroke="#0369A1" strokeWidth="2" />
        <path
          d="M334 80 L322 98 L322 188 Q322 192 326 192 L370 192 Q374 192 374 188 L374 98 L362 80 Z"
          fill="#F0F9FF"
          stroke="#0369A1"
          strokeWidth="2"
        />
        {/* Crack highlight example */}
        <path d="M336 122 L352 146 L345 156" fill="none" stroke="#DC2626" strokeWidth="2" />
        <text x="348" y="212" textAnchor="middle" fill="#0F294A" fontSize="11" fontWeight="600">
          Glass Bottle / Jar
        </text>
        <text x="348" y="226" textAnchor="middle" fill="#475569" fontSize="10">
          Target Inspection Zone
        </text>

        {/* Distance arrow: Camera to Bottle (25 cm - 40 cm) */}
        <line x1="378" y1="28" x2="626" y2="28" stroke="#0284C7" strokeWidth="1.5" />
        <polygon points="378,28 386,24 386,32" fill="#0284C7" />
        <polygon points="626,28 618,24 618,32" fill="#0284C7" />
        <text x="502" y="20" textAnchor="middle" fill="#0F294A" fontSize="11" fontWeight="600">
          Camera Distance: ~{cameraDistanceCm} cm (25–40 cm)
        </text>

        {/* Optical axis */}
        <line x1="378" y1="118" x2="616" y2="118" stroke="#64748B" strokeWidth="1.2" strokeDasharray="4 3" />

        {/* Fixed Camera & Mount */}
        <rect x="616" y="96" width="16" height="44" rx="2" fill="#334155" />
        <rect x="632" y="88" width="52" height="60" rx="6" fill="#0F294A" />
        <circle cx="658" cy="118" r="12" fill="#38BDF8" opacity="0.25" stroke="#38BDF8" strokeWidth="1.5" />
        {/* Tripod legs */}
        <line x1="658" y1="148" x2="636" y2="192" stroke="#334155" strokeWidth="3" />
        <line x1="658" y1="148" x2="680" y2="192" stroke="#334155" strokeWidth="3" />
        <text x="658" y="212" textAnchor="middle" fill="#0F294A" fontSize="11" fontWeight="600">
          Fixed Camera
        </text>
        <text x="658" y="226" textAnchor="middle" fill="#475569" fontSize="10">
          USB Webcam / Phone
        </text>
      </svg>
    </div>
  );
}
