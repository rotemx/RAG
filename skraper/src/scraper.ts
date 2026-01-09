import { chromium, Browser, Page } from 'playwright';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { LawRecord, upsertLaw, updatePdfPath, getLawsWithoutPdf, getStats, closePool } from './db';

const BASE_URL = 'https://main.knesset.gov.il';
const LAWS_URL = `${BASE_URL}/Activity/Legislation/Laws/Pages/LawReshumot.aspx`;
const DOWNLOADS_DIR = path.join(__dirname, '..', 'downloads');

// Rate limiting configuration - be respectful to the server
const PAGE_DELAY_MS = 5000;      // 5 seconds between page navigations
const PDF_DELAY_MS = 1000;       // 1 second between PDF downloads
const REQUEST_TIMEOUT_MS = 60000; // 60 seconds timeout

interface ScrapedLaw {
  lawItemId: string;
  lawName: string;
  lawPageUrl: string;
  pdfUrl: string | null;
  publicationSeries: string | null;
  bookletNumber: string | null;
  pageNumber: string | null;
  publicationDate: Date | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseDate(dateStr: string): Date | null {
  // Format: DD/MM/YYYY
  const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
}

function extractLawItemId(url: string): string | null {
  const match = url.match(/lawitemid=(\d+)/i);
  return match ? match[1] : null;
}

async function scrapePage(page: Page, pageNum: number): Promise<ScrapedLaw[]> {
  const url = `${LAWS_URL}?t=lawreshumot&st=lawreshumotlaws&pn=${pageNum}&sb=PublicationDate&so=D`;
  console.log(`Scraping page ${pageNum}: ${url}`);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: REQUEST_TIMEOUT_MS });

  // Wait for the law links to appear (more specific selector)
  await page.waitForSelector('a[href*="LawBill.aspx"]', { timeout: 45000 });

  // Give the page a bit more time to fully render
  await sleep(2000);

  // Extract law data from the table rows
  const laws = await page.evaluate(() => {
    const results: Array<{
      lawItemId: string | null;
      lawName: string;
      lawPageUrl: string;
      pdfUrl: string | null;
      publicationSeries: string | null;
      bookletNumber: string | null;
      pageNumber: string | null;
      publicationDate: string | null;
    }> = [];

    // Find all table rows in the main data table
    const rows = document.querySelectorAll('table[role="grid"] tbody tr, div[id*="grid"] table tbody tr');

    // If no grid table found, try finding by the row structure
    if (rows.length === 0) {
      // Alternative: find rows by their structure (each law row has specific cells)
      const allRows = document.querySelectorAll('tr');
      allRows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 6) {
          // Check if this looks like a law row (has a link to LawBill.aspx)
          const lawLink = row.querySelector('a[href*="LawBill.aspx"]');
          const pdfLink = row.querySelector('a[href*=".pdf"]');

          if (lawLink) {
            const lawName = lawLink.textContent?.trim() || '';
            const lawPageUrl = lawLink.getAttribute('href') || '';
            const pdfUrl = pdfLink?.getAttribute('href') || null;

            // Extract lawItemId from URL
            const lawItemIdMatch = lawPageUrl.match(/lawitemid=(\d+)/i);
            const lawItemId = lawItemIdMatch ? lawItemIdMatch[1] : null;

            // Get cell values - order: summary button, law name, series, booklet, page, date, pdf
            let publicationSeries: string | null = null;
            let bookletNumber: string | null = null;
            let pageNumber: string | null = null;
            let publicationDate: string | null = null;

            const cellTexts = Array.from(cells).map(c => c.textContent?.trim() || '');

            // Find the index of the law name cell
            for (let i = 0; i < cells.length; i++) {
              const cellText = cellTexts[i];
              if (cellText === lawName) {
                // Next cells should be: series, booklet, page, date
                publicationSeries = cellTexts[i + 1] || null;
                bookletNumber = cellTexts[i + 2] || null;
                pageNumber = cellTexts[i + 3] || null;
                publicationDate = cellTexts[i + 4] || null;
                break;
              }
            }

            if (lawItemId && lawName) {
              results.push({
                lawItemId,
                lawName,
                lawPageUrl,
                pdfUrl,
                publicationSeries,
                bookletNumber,
                pageNumber,
                publicationDate,
              });
            }
          }
        }
      });
    }

    return results;
  });

  // Process and convert dates
  return laws
    .filter(law => law.lawItemId !== null)
    .map(law => ({
      lawItemId: law.lawItemId!,
      lawName: law.lawName,
      lawPageUrl: law.lawPageUrl.startsWith('http')
        ? law.lawPageUrl
        : `https://main.knesset.gov.il/Activity/Legislation/Laws/Pages/${law.lawPageUrl}`,
      pdfUrl: law.pdfUrl ? (law.pdfUrl.startsWith('http') ? law.pdfUrl : `https://main.knesset.gov.il${law.pdfUrl}`) : null,
      publicationSeries: law.publicationSeries,
      bookletNumber: law.bookletNumber,
      pageNumber: law.pageNumber,
      publicationDate: law.publicationDate ? parseDate(law.publicationDate) : null,
    }));
}

async function downloadPdf(pdfUrl: string, lawItemId: string): Promise<string | null> {
  try {
    // Fix URL encoding issues (backslashes in the URL)
    const fixedUrl = pdfUrl.replace(/\\/g, '/');

    const response = await axios.get(fixedUrl, {
      responseType: 'arraybuffer',
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/pdf,*/*',
        'Referer': BASE_URL,
      },
    });

    // Create downloads directory if it doesn't exist
    if (!fs.existsSync(DOWNLOADS_DIR)) {
      fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
    }

    const filename = `law_${lawItemId}.pdf`;
    const filepath = path.join(DOWNLOADS_DIR, filename);

    fs.writeFileSync(filepath, response.data);
    console.log(`  Downloaded: ${filename}`);

    return filepath;
  } catch (error) {
    console.error(`  Failed to download PDF for ${lawItemId}: ${error}`);
    return null;
  }
}

async function scrapeAllLaws(startPage: number = 1, endPage: number = 290): Promise<void> {
  console.log('Starting Knesset Laws Scraper...');
  console.log(`Will scrape pages ${startPage} to ${endPage}`);

  // Use headed mode if HEADED=true, otherwise headless
  const headed = process.env.HEADED === 'true';
  console.log(`Running in ${headed ? 'headed' : 'headless'} mode`);

  const browser = await chromium.launch({
    headless: !headed,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
    ],
  });

  // Mask navigator.webdriver to avoid detection
  await browser.newContext().then(ctx => ctx.close()).catch(() => {});

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'he-IL',
    viewport: { width: 1920, height: 1080 },
    javaScriptEnabled: true,
  });

  // Add stealth scripts to bypass automation detection
  await context.addInitScript(() => {
    // Override the navigator.webdriver property
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });

    // Override plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });

    // Override languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['he-IL', 'he', 'en-US', 'en'],
    });

    // Mask automation
    (window as any).chrome = { runtime: {} };
  });

  const page = await context.newPage();

  try {
    let totalScraped = 0;

    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      try {
        const laws = await scrapePage(page, pageNum);
        console.log(`  Found ${laws.length} laws on page ${pageNum}`);

        for (const law of laws) {
          // Download PDF immediately if available (skip if already exists)
          let pdfPath: string | null = null;
          const expectedPdfPath = path.join(DOWNLOADS_DIR, `law_${law.lawItemId}.pdf`);

          if (law.pdfUrl) {
            if (fs.existsSync(expectedPdfPath)) {
              console.log(`    Skipping (exists): law_${law.lawItemId}.pdf`);
              pdfPath = expectedPdfPath;
            } else {
              console.log(`    Downloading PDF for: ${law.lawName.substring(0, 50)}...`);
              pdfPath = await downloadPdf(law.pdfUrl, law.lawItemId);
              await sleep(PDF_DELAY_MS);
            }
          }

          const record: LawRecord = {
            law_item_id: law.lawItemId,
            law_name: law.lawName,
            law_page_url: law.lawPageUrl,
            pdf_url: law.pdfUrl,
            pdf_path: pdfPath,
            publication_series: law.publicationSeries,
            booklet_number: law.bookletNumber,
            page_number: law.pageNumber,
            publication_date: law.publicationDate,
          };

          await upsertLaw(record);
          totalScraped++;
        }

        // Rate limiting between pages
        if (pageNum < endPage) {
          console.log(`  Waiting ${PAGE_DELAY_MS}ms before next page...`);
          await sleep(PAGE_DELAY_MS);
        }

      } catch (error) {
        console.error(`Error on page ${pageNum}: ${error}`);
        // Continue to next page even if one fails
        await sleep(PAGE_DELAY_MS);
      }
    }

    console.log(`\nScraping complete! Total laws scraped: ${totalScraped}`);

  } finally {
    await browser.close();
  }
}

async function downloadAllPdfs(): Promise<void> {
  console.log('Starting PDF download phase...');

  const laws = await getLawsWithoutPdf();
  console.log(`Found ${laws.length} laws without downloaded PDFs`);

  let downloaded = 0;
  let failed = 0;

  for (const law of laws) {
    if (!law.pdf_url) {
      console.log(`  Skipping ${law.law_item_id} - no PDF URL`);
      continue;
    }

    console.log(`Downloading PDF for: ${law.law_name.substring(0, 50)}...`);

    const pdfPath = await downloadPdf(law.pdf_url, law.law_item_id);

    if (pdfPath) {
      await updatePdfPath(law.law_item_id, pdfPath);
      downloaded++;
    } else {
      failed++;
    }

    // Rate limiting between downloads
    await sleep(PDF_DELAY_MS);
  }

  console.log(`\nPDF download complete! Downloaded: ${downloaded}, Failed: ${failed}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'all';

  try {
    switch (command) {
      case 'scrape':
        const startPage = parseInt(args[1]) || 1;
        const endPage = parseInt(args[2]) || 290;
        await scrapeAllLaws(startPage, endPage);
        break;

      case 'download':
        await downloadAllPdfs();
        break;

      case 'stats':
        const stats = await getStats();
        console.log('Database Statistics:');
        console.log(`  Total laws: ${stats.total}`);
        console.log(`  Laws with PDFs downloaded: ${stats.withPdf}`);
        break;

      case 'all':
      default:
        console.log('=== Phase 1: Scraping law metadata ===');
        await scrapeAllLaws();
        console.log('\n=== Phase 2: Downloading PDFs ===');
        await downloadAllPdfs();
        const finalStats = await getStats();
        console.log('\n=== Final Statistics ===');
        console.log(`  Total laws: ${finalStats.total}`);
        console.log(`  Laws with PDFs downloaded: ${finalStats.withPdf}`);
        break;
    }
  } finally {
    await closePool();
  }
}

main().catch(console.error);
