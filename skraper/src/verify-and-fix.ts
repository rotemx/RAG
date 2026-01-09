import { chromium, Page } from 'playwright';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

const BASE_URL = 'https://main.knesset.gov.il';
const DOWNLOADS_DIR = path.join(__dirname, '..', 'downloads');
const PDF_DELAY_MS = 1000;
const PAGE_DELAY_MS = 2000;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'scraper',
  password: 'scraper123',
  database: 'knesset_laws',
});

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadPdf(pdfUrl: string, lawItemId: string): Promise<string | null> {
  try {
    const fixedUrl = pdfUrl.replace(/\\/g, '/');
    const response = await axios.get(fixedUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/pdf,*/*',
        'Referer': BASE_URL,
      },
    });

    if (!fs.existsSync(DOWNLOADS_DIR)) {
      fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
    }

    const filename = `law_${lawItemId}.pdf`;
    const filepath = path.join(DOWNLOADS_DIR, filename);
    fs.writeFileSync(filepath, response.data);
    return filepath;
  } catch (error) {
    return null;
  }
}

async function findPdfOnLawPage(page: Page, lawPageUrl: string): Promise<string | null> {
  try {
    const fullUrl = lawPageUrl.startsWith('http') ? lawPageUrl : `${BASE_URL}${lawPageUrl}`;
    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);

    // Look for PDF links on the page - only from Knesset file server with law-related paths
    const pdfUrl = await page.evaluate(() => {
      const allLinks = Array.from(document.querySelectorAll('a'));

      // Priority 1: Look for official law publication PDFs (ספר החוקים / רשומות)
      for (const link of allLinks) {
        const href = link.getAttribute('href') || '';
        const text = link.textContent || '';

        // Must be from fs.knesset.gov.il and contain law-related path
        if (href.includes('fs.knesset.gov.il') && href.toLowerCase().includes('.pdf')) {
          // Check for law publication patterns: _lsr_ (law sefer reshumot), _ls1_, _ls2_, /law/
          if (href.includes('_lsr_') || href.includes('/law/')) {
            return href;
          }
        }
      }

      // Priority 2: Any PDF from fs.knesset.gov.il with law-related text
      for (const link of allLinks) {
        const href = link.getAttribute('href') || '';
        const text = link.textContent || '';

        if (href.includes('fs.knesset.gov.il') && href.toLowerCase().includes('.pdf')) {
          // Look for law-related text in the link
          if (text.includes('חוק') || text.includes('פרסום') || text.includes('רשומות') ||
              href.includes('_ls1_') || href.includes('_ls2_')) {
            return href;
          }
        }
      }

      // Priority 3: Any PDF from fs.knesset.gov.il (but not footer/irrelevant links)
      for (const link of allLinks) {
        const href = link.getAttribute('href') || '';

        if (href.includes('fs.knesset.gov.il') && href.toLowerCase().includes('.pdf')) {
          // Exclude known non-law PDFs
          if (!href.includes('defibrillator') && !href.includes('building')) {
            return href;
          }
        }
      }

      return null;
    });

    return pdfUrl;
  } catch (error) {
    return null;
  }
}

async function verifyAndFixMissingPdfs(): Promise<void> {
  console.log('Starting verification and fix process...');

  // Get laws without PDFs
  const result = await pool.query(`
    SELECT law_item_id, law_name, law_page_url, pdf_url
    FROM laws
    WHERE pdf_path IS NULL
    ORDER BY publication_date DESC NULLS LAST
  `);

  console.log(`Found ${result.rows.length} laws without downloaded PDFs`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    locale: 'he-IL',
    viewport: { width: 1920, height: 1080 },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();

  let found = 0;
  let downloaded = 0;
  let notFound = 0;

  for (let i = 0; i < result.rows.length; i++) {
    const law = result.rows[i];
    const progress = `[${i + 1}/${result.rows.length}]`;

    // First, check if we already have a PDF URL but just didn't download
    if (law.pdf_url) {
      console.log(`${progress} ${law.law_item_id}: Has URL, downloading...`);
      const pdfPath = await downloadPdf(law.pdf_url, law.law_item_id);
      if (pdfPath) {
        await pool.query(
          'UPDATE laws SET pdf_path = $1 WHERE law_item_id = $2',
          [pdfPath, law.law_item_id]
        );
        downloaded++;
        console.log(`  Downloaded: ${pdfPath}`);
      }
      await sleep(PDF_DELAY_MS);
      continue;
    }

    // No URL - check the law page for PDF link
    console.log(`${progress} ${law.law_item_id}: Checking law page for PDF...`);
    const pdfUrl = await findPdfOnLawPage(page, law.law_page_url);

    if (pdfUrl) {
      found++;
      console.log(`  Found PDF URL: ${pdfUrl}`);

      // Update the database with the found URL
      const fullPdfUrl = pdfUrl.startsWith('http') ? pdfUrl : `${BASE_URL}${pdfUrl}`;
      await pool.query(
        'UPDATE laws SET pdf_url = $1 WHERE law_item_id = $2',
        [fullPdfUrl, law.law_item_id]
      );

      // Download the PDF
      const pdfPath = await downloadPdf(fullPdfUrl, law.law_item_id);
      if (pdfPath) {
        await pool.query(
          'UPDATE laws SET pdf_path = $1 WHERE law_item_id = $2',
          [pdfPath, law.law_item_id]
        );
        downloaded++;
        console.log(`  Downloaded: ${pdfPath}`);
      }
    } else {
      notFound++;
      if (i < 100 || i % 100 === 0) {
        console.log(`  No PDF found for: ${law.law_name.substring(0, 50)}...`);
      }
    }

    await sleep(PAGE_DELAY_MS);

    // Progress report every 100 laws
    if ((i + 1) % 100 === 0) {
      console.log(`\n--- Progress: ${i + 1}/${result.rows.length} ---`);
      console.log(`Found new PDFs: ${found}, Downloaded: ${downloaded}, Not found: ${notFound}\n`);
    }
  }

  await browser.close();
  await pool.end();

  console.log('\n=== VERIFICATION COMPLETE ===');
  console.log(`Total checked: ${result.rows.length}`);
  console.log(`New PDFs found: ${found}`);
  console.log(`PDFs downloaded: ${downloaded}`);
  console.log(`Still missing: ${notFound}`);
}

// Also add a function to re-scrape and compare
async function rescrapeAndCompare(): Promise<void> {
  console.log('Re-scraping site to find any missing laws...');

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    locale: 'he-IL',
    viewport: { width: 1920, height: 1080 },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();

  const LAWS_URL = `${BASE_URL}/Activity/Legislation/Laws/Pages/LawReshumot.aspx`;
  let totalOnSite = 0;
  let newLaws = 0;
  let updatedPdfs = 0;

  for (let pageNum = 1; pageNum <= 290; pageNum++) {
    try {
      const url = `${LAWS_URL}?t=lawreshumot&st=lawreshumotlaws&pn=${pageNum}&sb=PublicationDate&so=D`;
      console.log(`Checking page ${pageNum}...`);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('a[href*="LawBill.aspx"]', { timeout: 30000 }).catch(() => null);
      await sleep(1000);

      const laws = await page.evaluate(() => {
        const results: Array<{ lawItemId: string; pdfUrl: string | null }> = [];
        const rows = document.querySelectorAll('tr');
        rows.forEach(row => {
          const lawLink = row.querySelector('a[href*="LawBill.aspx"]');
          const pdfLink = row.querySelector('a[href*=".pdf"]');
          if (lawLink) {
            const href = lawLink.getAttribute('href') || '';
            const match = href.match(/lawitemid=(\d+)/i);
            if (match) {
              results.push({
                lawItemId: match[1],
                pdfUrl: pdfLink?.getAttribute('href') || null,
              });
            }
          }
        });
        return results;
      });

      totalOnSite += laws.length;

      // Check each law against database
      for (const law of laws) {
        if (law.pdfUrl) {
          const fullPdfUrl = law.pdfUrl.startsWith('http') ? law.pdfUrl : `https://fs.knesset.gov.il${law.pdfUrl}`;

          // Check if we have this law and if PDF URL is different/missing
          const existing = await pool.query(
            'SELECT pdf_url, pdf_path FROM laws WHERE law_item_id = $1',
            [law.lawItemId]
          );

          if (existing.rows.length > 0) {
            const row = existing.rows[0];
            if (!row.pdf_url || row.pdf_url !== fullPdfUrl) {
              // Update PDF URL
              await pool.query(
                'UPDATE laws SET pdf_url = $1 WHERE law_item_id = $2',
                [fullPdfUrl, law.lawItemId]
              );
              console.log(`  Updated PDF URL for ${law.lawItemId}`);
              updatedPdfs++;

              // Download if not already downloaded
              if (!row.pdf_path) {
                const pdfPath = await downloadPdf(fullPdfUrl, law.lawItemId);
                if (pdfPath) {
                  await pool.query(
                    'UPDATE laws SET pdf_path = $1 WHERE law_item_id = $2',
                    [pdfPath, law.lawItemId]
                  );
                  console.log(`  Downloaded: law_${law.lawItemId}.pdf`);
                }
                await sleep(PDF_DELAY_MS);
              }
            }
          }
        }
      }

      await sleep(PAGE_DELAY_MS);

    } catch (error) {
      console.log(`  Page ${pageNum} error: ${error}`);
    }
  }

  await browser.close();
  await pool.end();

  console.log('\n=== RE-SCRAPE COMPLETE ===');
  console.log(`Total laws on site: ${totalOnSite}`);
  console.log(`New laws found: ${newLaws}`);
  console.log(`Updated PDF URLs: ${updatedPdfs}`);
}

const command = process.argv[2] || 'verify';

if (command === 'rescrape') {
  rescrapeAndCompare().catch(console.error);
} else {
  verifyAndFixMissingPdfs().catch(console.error);
}
