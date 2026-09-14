import type { PublicPackage } from './PublicCatalog';

export type PackageOrder = 'default' | 'departure' | 'price';

export function selectHomePackages(packages: PublicPackage[], query: string, month: string, order: PackageOrder) {
  const words = query.trim().toLocaleLowerCase('id-ID').split(/\s+/).filter(Boolean);
  const selected = packages.filter((pkg) => {
    const name = pkg.name.toLocaleLowerCase('id-ID');
    return words.every((word) => name.includes(word)) && (!month || pkg.departure_date?.slice(0, 7) === month);
  });
  const validPrice = (pkg: PublicPackage) => pkg.price && pkg.price > 0 ? pkg.price : Infinity;
  const departure = (pkg: PublicPackage) => {
    const value = pkg.departure_date ? Date.parse(pkg.departure_date) : NaN;
    return Number.isFinite(value) ? value : Infinity;
  };
  if (order === 'price') selected.sort((a, b) => validPrice(a) - validPrice(b));
  if (order === 'departure') selected.sort((a, b) => departure(a) - departure(b));
  return selected;
}
