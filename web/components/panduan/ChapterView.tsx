import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { GUIDE_STAGE_TITLES, chapterBlocks, guideHref, labelText, neighbours, type GuideChapter } from '../../lib/panduan/content';
import { LabelBadge } from './LabelBadge';
import { PanduanContent } from './PanduanContent';
import styles from './Panduan.module.css';

/** One chapter: stage and label, title, where it lives in the dashboard, the text, then previous/next. */
export function ChapterView({ chapter }: { chapter: GuideChapter }) {
  const blocks = chapterBlocks(chapter);
  const toc = blocks.flatMap((b) => (b.type === 'heading' && b.level === 2 ? [{ id: b.id, text: b.text }] : []));
  const { prev, next } = neighbours(chapter.slug);

  return (
    <div className={styles.main}>
      <article className={styles.article}>
        <p className={styles.crumbs}>
          <span>{GUIDE_STAGE_TITLES[chapter.stage]}</span>
          <LabelBadge kind={chapter.label} text={labelText(chapter)} />
        </p>
        <h1 className={styles.title}>{chapter.title}</h1>
        <div className={styles.lead}>
          <p className={styles.summary}>{chapter.summary}</p>
          {chapter.menu ? (
            <p className={styles.menuPath}>
              Di dashboard: <code>{chapter.menu}</code>
            </p>
          ) : null}
        </div>
        <PanduanContent blocks={blocks} images={chapter.images} />
        <nav className={styles.pager} aria-label="Bab sebelumnya dan berikutnya">
          {prev ? (
            <Link href={guideHref(prev.slug)} className={styles.pagerLink}>
              <span className={styles.pagerHint}>
                <ArrowLeft aria-hidden="true" width={14} height={14} /> Sebelumnya
              </span>
              <span className={styles.pagerTitle}>{prev.title}</span>
            </Link>
          ) : null}
          {next ? (
            <Link href={guideHref(next.slug)} className={`${styles.pagerLink} ${styles.pagerLinkNext}`}>
              <span className={styles.pagerHint}>
                Berikutnya <ArrowRight aria-hidden="true" width={14} height={14} />
              </span>
              <span className={styles.pagerTitle}>{next.title}</span>
            </Link>
          ) : null}
        </nav>
      </article>
      {toc.length > 1 ? (
        <aside className={styles.toc} aria-label="Di halaman ini">
          <p className={styles.tocTitle}>Di halaman ini</p>
          <ul>
            {toc.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`}>{t.text}</a>
              </li>
            ))}
          </ul>
        </aside>
      ) : (
        <div />
      )}
    </div>
  );
}
