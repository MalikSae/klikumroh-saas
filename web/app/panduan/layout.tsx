import { PanduanShell, type NavGroup } from '../../components/panduan/PanduanShell';
import { guideHref, labelText, searchEntries, stageGroups } from '../../lib/panduan/content';

// The guide for travel admins, on klikumroh.id only (proxy.ts keeps it off travel hosts). The text is
// baked into the build from panduan/*.md; see scripts/build-panduan.js.
export default function PanduanLayout({ children }: { children: React.ReactNode }) {
  const groups: NavGroup[] = stageGroups().map((g) => ({
    key: g.key,
    title: g.title,
    items: g.chapters.map((c) => ({ slug: c.slug, title: c.title, href: guideHref(c.slug), kind: c.label, text: labelText(c) })),
  }));
  return (
    <PanduanShell groups={groups} entries={searchEntries()}>
      {children}
    </PanduanShell>
  );
}
