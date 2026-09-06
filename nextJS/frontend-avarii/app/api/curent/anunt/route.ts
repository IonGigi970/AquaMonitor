import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Această rută NU mai redirecționează către URL-ul semnat al PDF-ului, ci descarcă
// PDF-ul pe server și îl livrează direct browserului. URL-urile semnate S3 de pe
// pagina Rețele Electrice expiră după ~1 oră, iar pagina lor poate rămâne cache-uită
// mai mult timp — de aceea un simplu redirect lăsa utilizatorul cu erori
// „Request has expired". Cu livrare directă, linkul /api/curent/anunt funcționează
// mereu: fiecare acces obține un URL semnat proaspăt.

const PAGINA_ANUNTURI = 'https://www.reteleelectrice.ro/en/outages/planned/';
const UA_BROWSER =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const TTL_PAGINA_MS = 5 * 60 * 1000;

interface CandidatPdf {
  url: string;
  numeFisier: string;
  la: number;
}

let cachePagina: CandidatPdf | null = null;

// Alege de pe pagina oficială PDF-ul cu cea mai mare dată de sfârșit
// (cel mai recent publicat — dacă a apărut deja săptămâna viitoare, îl luăm pe acela).
async function descoperaPdf(): Promise<Omit<CandidatPdf, 'la'> | null> {
  const raspuns = await fetch(PAGINA_ANUNTURI, {
    headers: { 'User-Agent': UA_BROWSER, Accept: 'text/html' },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!raspuns.ok) return null;
  const html = await raspuns.text();

  const regex =
    /href="([^"]*outageapp_pdf\/Intreruperi%20programate%20(\d{2})\.(\d{2})\.(\d{4})%20-%20(\d{2})\.(\d{2})\.(\d{4})\.pdf[^"]*)"/g;
  let urlPdf: string | null = null;
  let numeFisier = 'Intreruperi programate.pdf';
  let endMax = '';
  for (const m of html.matchAll(regex)) {
    const end = `${m[7]}-${m[6]}-${m[5]}`;
    if (end > endMax) {
      endMax = end;
      urlPdf = m[1].replace(/&amp;/g, '&');
      numeFisier = `Intreruperi programate ${m[2]}.${m[3]}.${m[4]} - ${m[5]}.${m[6]}.${m[7]}.pdf`;
    }
  }
  return urlPdf ? { url: urlPdf, numeFisier } : null;
}

// Descarcă PDF-ul. Verificăm și primele 4 octeți (%PDF) ca să nu livrăm vreo
// pagină de eroare HTML întoarsă cu status 200.
async function descarcaPdf(url: string): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const raspuns = await fetch(url, {
      headers: { 'User-Agent': UA_BROWSER },
      cache: 'no-store',
      signal: AbortSignal.timeout(25000),
    });
    if (!raspuns.ok) return null;
    const octeti = new Uint8Array(await raspuns.arrayBuffer());
    const magie = String.fromCharCode(octeti[0] ?? 0, octeti[1] ?? 0, octeti[2] ?? 0, octeti[3] ?? 0);
    return magie === '%PDF' ? octeti : null;
  } catch {
    return null;
  }
}

export async function GET() {
  // 1. Folosim pagina din cache dacă e recentă; altfel o redescoperim.
  let candidat =
    cachePagina && Date.now() - cachePagina.la < TTL_PAGINA_MS
      ? cachePagina
      : await descoperaPdf();
  if (candidat) cachePagina = { ...candidat, la: Date.now() };

  // 2. Descărcăm PDF-ul. Dacă URL-ul semnat a expirat între timp, redescoperim
  //    pagina o singură dată (URL proaspăt) și încercăm din nou.
  let pdf = candidat ? await descarcaPdf(candidat.url) : null;
  if (!pdf && candidat) {
    const proaspat = await descoperaPdf();
    if (proaspat) {
      cachePagina = { ...proaspat, la: Date.now() };
      pdf = await descarcaPdf(proaspat.url);
      candidat = proaspat;
    }
  }

  if (!pdf || !candidat) {
    return NextResponse.redirect(PAGINA_ANUNTURI, 302);
  }

  return new NextResponse(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${candidat.numeFisier}"`,
      'Cache-Control': 'public, max-age=300',
      'Content-Length': String(pdf.length),
    },
  });
}
