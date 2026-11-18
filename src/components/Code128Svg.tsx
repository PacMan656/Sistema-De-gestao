import { encodeCode128B } from '../shared/barcode.ts';

interface Code128SvgProps {
  value: string;
  height?: number;
  label?: string;
}

export function Code128Svg({ value, height = 42, label }: Code128SvgProps) {
  const encoded = encodeCode128B(value);
  const viewWidth = encoded.totalWidth + 12;

  return (
    <div className="inline-flex flex-col items-start">
      {label && (
        <span className="text-[11px] font-medium text-slate-500 mb-1">
          {label}
        </span>
      )}
      <div className="bg-white border border-slate-200 rounded-md px-3 py-2">
        <svg
          viewBox={`0 0 ${viewWidth} ${height}`}
          className="h-10 w-auto max-w-full"
          role="img"
          aria-label={`Código de barras ${encoded.encodedText}`}
        >
          <rect x={0} y={0} width={viewWidth} height={height} fill="#FFFFFF" />
          {encoded.bars.map((bar, idx) => (
            <rect
              key={idx}
              x={bar.x + 6}
              y={2}
              width={bar.width}
              height={height - 4}
              fill="#0F172A"
            />
          ))}
        </svg>
        <p className="mt-1 text-center font-mono text-[11px] font-semibold text-slate-900 tracking-wider">
          {encoded.encodedText}
        </p>
      </div>
    </div>
  );
}
