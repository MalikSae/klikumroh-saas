import { notFound } from 'next/navigation';
import { ChapterView } from '../../components/panduan/ChapterView';
import { GUIDE_HOME_SLUG, getChapter } from '../../lib/panduan/content';

export function generateMetadata() {
  const c = getChapter(GUIDE_HOME_SLUG);
  return {
    title: 'Panduan Admin Travel | KlikUmroh.id',
    description: c?.summary,
    alternates: { canonical: 'https://klikumroh.id/panduan' },
  };
}

export default function PanduanHomePage() {
  const chapter = getChapter(GUIDE_HOME_SLUG);
  if (!chapter) notFound();
  return <ChapterView chapter={chapter} />;
}
