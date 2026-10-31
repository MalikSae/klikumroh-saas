import { notFound } from 'next/navigation';
import { ChapterView } from '../../../components/panduan/ChapterView';
import { GUIDE_HOME_SLUG, chapters, getChapter } from '../../../lib/panduan/content';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return chapters.filter((c) => c.slug !== GUIDE_HOME_SLUG).map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const c = getChapter(slug);
  if (!c || slug === GUIDE_HOME_SLUG) return { title: 'Panduan | KlikUmroh.id' };
  return {
    title: `${c.title} | Panduan KlikUmroh.id`,
    description: c.summary,
    alternates: { canonical: `https://klikumroh.id/panduan/${c.slug}` },
  };
}

export default async function PanduanChapterPage({ params }: Props) {
  const { slug } = await params;
  // The opening chapter lives at /panduan, so its own slug is not a second address for it.
  const chapter = slug === GUIDE_HOME_SLUG ? undefined : getChapter(slug);
  if (!chapter) notFound();
  return <ChapterView chapter={chapter} />;
}
