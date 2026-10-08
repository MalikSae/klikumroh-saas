import { notFound } from 'next/navigation';
import { LegalDocumentView } from '../../components/marketing/LegalDocumentView';
import { fetchLegalDocument } from '../../lib/legalDocuments';

// The published text from the internal dashboard (Dokumen Legal), refreshed every minute.
export const revalidate = 60;

export async function generateMetadata() {
  const doc = await fetchLegalDocument('syarat-ketentuan');
  return {
    title: `${doc?.title ?? 'Syarat & Ketentuan'} | KlikUmroh.id`,
    alternates: { canonical: 'https://klikumroh.id/syarat-ketentuan' },
  };
}

export default async function SyaratKetentuanPage() {
  const doc = await fetchLegalDocument('syarat-ketentuan');
  if (!doc) notFound();
  return <LegalDocumentView doc={doc} />;
}
