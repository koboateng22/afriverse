import { groupOf, OWNERSHIP_LABEL, type University } from './types';
import './OwnershipBadge.css';

/**
 * Public / Private / Being verified. `long` spells it out for the university page.
 * The verification source shows on hover for verified ones.
 */
export function OwnershipBadge({ u, long }: { u: Pick<University, 'ownership' | 'ownership_source'>; long?: boolean }) {
  const group = groupOf(u);
  const label = !long ? OWNERSHIP_LABEL[group] : group === 'unverified' ? 'Public or private: being verified' : `${OWNERSHIP_LABEL[group]} university`;
  return (
    <span className="uni-own" data-ownership={group} title={group !== 'unverified' ? u.ownership_source ?? undefined : undefined}>
      {label}
    </span>
  );
}
