import { AlertTriangle, CheckCircle2, Clock, ShieldAlert } from 'lucide-react';
import { ClassificationLabel, ReviewStatus } from '../types/inspection';

export function ClassificationBadge({
  classification,
}: {
  classification: ClassificationLabel;
}) {
  if (classification === 'NORMAL') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        NORMAL
      </span>
    );
  }
  if (classification === 'SUSPECTED CRACK') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 whitespace-nowrap">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        SUSPECTED CRACK
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      MANUAL INSPECTION REQUIRED
    </span>
  );
}

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  if (status === 'CONFIRMED DEFECT') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 whitespace-nowrap">
        Confirmed Defect
      </span>
    );
  }
  if (status === 'MARKED NORMAL') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 whitespace-nowrap">
        Marked Normal
      </span>
    );
  }
  if (status === 'REINSPECTION REQUESTED') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 whitespace-nowrap">
        Reinspection Requested
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 whitespace-nowrap">
      <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" aria-hidden="true" />
      Pending Review
    </span>
  );
}
