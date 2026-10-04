import { permanentRedirect } from 'next/navigation';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function MarketingRedirect({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(key, item);
    }
  }
  const suffix = query.toString();
  permanentRedirect(suffix ? `/?${suffix}` : '/');
}
