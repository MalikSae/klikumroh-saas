// Package card of the public site: square photo, one-line name, departure date, starting price. The whole card
// is one link to the package detail. Used on the home page (nearest packages) and the /paket catalogue, laid
// out in the two-column .pkg-tiles grid.
import React from 'react';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import type { PublicPackage } from './publicPackage';
import './PackageTile.css';

const rupiah = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const fmtShort = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

export const PackageTile: React.FC<{ pkg: PublicPackage }> = ({ pkg }) => {
  const photo = [...(pkg.photos || [])].sort((x, y) => x.sort_order - y.sort_order)[0];
  return (
    <Link href={`/paket/${pkg.id}`} className="th-pkg">
      <span className="th-pkg__media">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.file_path} alt="" className="th-pkg__img" loading="lazy" />
        ) : (
          <span className="th-pkg__noimg" aria-hidden="true">{initials(pkg.name)}</span>
        )}
      </span>
      <span className="th-pkg__body">
        <span className="th-pkg__name">{pkg.name}</span>
        {pkg.departure_date && (
          <span className="th-pkg__date">
            <CalendarDays size={12} aria-hidden="true" /> {fmtShort(pkg.departure_date)}
          </span>
        )}
        {pkg.price ? (
          <span className="th-pkg__price">
            <span>Mulai</span> <b>{rupiah(pkg.price)}</b>
          </span>
        ) : null}
      </span>
    </Link>
  );
};
