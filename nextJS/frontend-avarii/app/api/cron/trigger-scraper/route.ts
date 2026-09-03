import { NextResponse } from "next/server";

// Endpoint apelat de un serviciu extern de cron (ex: cron-job.org) la interval fix.
// Nu ruleaza el insusi scraper-ul, ci porneste workflow-ul GitHub Actions
// prin API-ul GitHub (workflow_dispatch), care ruleaza cu prioritate normala,
// spre deosebire de trigger-ul "schedule" (cron intern GitHub), care poate
// intarzia mult sau poate fi sarit in perioadele aglomerate.

const GITHUB_OWNER = "IonGigi970";
const GITHUB_REPO = "AquaMonitor";
const GITHUB_WORKFLOW_FILE = "scraper.yml";

function cleanEnv(value?: string): string {
  if (!value) return "";
  return value.replace(/^\uFEFF/, "").trim();
}

async function handleTrigger(request: Request) {
  const cronSecret = cleanEnv(process.env.CRON_SECRET);
  const githubToken = cleanEnv(process.env.GH_TOKEN);

  if (!cronSecret || !githubToken) {
    return NextResponse.json(
      { error: "CRON_SECRET sau GH_TOKEN nu sunt configurate in Vercel" },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const secretDinQuery = url.searchParams.get("secret") || "";
  const secretDinHeader = request.headers.get("x-cron-secret") || "";
  const secretPrimit = secretDinHeader || secretDinQuery;

  if (secretPrimit !== cronSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  const githubResponse = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main" }),
    }
  );

  if (!githubResponse.ok) {
    const textEroare = await githubResponse.text();
    return NextResponse.json(
      { error: "GitHub a refuzat declansarea workflow-ului", status: githubResponse.status, detaliu: textEroare },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, declansat_la: new Date().toISOString() });
}

export async function GET(request: Request) {
  return handleTrigger(request);
}

export async function POST(request: Request) {
  return handleTrigger(request);
}
