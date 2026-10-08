import { notFound } from 'next/navigation';
import { LegalDocumentView } from '../../components/marketing/LegalDocumentView';
import { fetchLegalDocument } from '../../lib/legalDocuments';

// The published text from the internal dashboard (Dokumen Legal), refreshed every minute.
export const revalidate = 60;

export async function generateMetadata() {
  const doc = await fetchLegalDocument('kebijakan-privasi');
  return {
    title: `${doc?.title ?? 'Kebijakan Privasi'} | KlikUmroh.id`,
    alternates: { canonical: 'https://klikumroh.id/kebijakan-privasi' },
  };
}

export default async function KebijakanPrivasiPage() {
  const doc = await fetchLegalDocument('kebijakan-privasi');
  if (!doc) notFound();
  return <LegalDocumentView doc={doc} />;
}
