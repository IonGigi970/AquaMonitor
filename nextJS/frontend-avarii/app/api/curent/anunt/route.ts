import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const PAGINA_ANUNTURI = 'https://www.reteleelectrice.ro/en/outages/planned/';
const UA_BROWSER =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

interface CacheAnunt {
  url: string;
  la: number;
}

let cacheAnunt: CacheAnunt | null = null;

function dataAziBucuresti(): string {
  const piesa = new Intl.DateTimeFormat('ro-RO', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [zi, luna, an] = piesa.split('.');
  return `${an}-${luna}-${zi}`;
}

export async function GET() {
  if (cacheAnunt && Date.now() - cacheAnunt.la < 15 * 60 * 1000) {
    return NextResponse.redirect(cacheAnunt.url, 302);
  }

  try {
    const raspuns = await fetch(PAGINA_ANUNTURI, {
      headers: { 'User-Agent': UA_BROWSER, Accept: 'text/html' },
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    if (!raspuns.ok) throw new Error(`Pagina a răspuns ${raspuns.status}`);
    const html = await raspuns.text();

    const azi = dataAziBucuresti();
    const regex =
      /href="([^"]*outageapp_pdf\/Intreruperi%20programate%20(\d{2})\.(\d{2})\.(\d{4})%20-%20(\d{2})\.(\d{2})\.(\d{4})\.pdf[^"]*)"/g;
    let urlPdf: string | null = null;
    for (const m of html.matchAll(regex)) {
      const start = `${m[4]}-${m[3]}-${m[2]}`;
      const end = `${m[7]}-${m[6]}-${m[5]}`;
      if (start <= azi && azi <= end) {
        urlPdf = m[1].replace(/&amp;/g, '&');
        break;
      }
    }

    if (!urlPdf) {
      return NextResponse.redirect(PAGINA_ANUNTURI, 302);
    }
    cacheAnunt = { url: urlPdf, la: Date.now() };
    return NextResponse.redirect(urlPdf, 302);
  } catch {
    return NextResponse.redirect(PAGINA_ANUNTURI, 302);
  }
}
