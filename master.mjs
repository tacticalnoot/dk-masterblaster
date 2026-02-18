#!/usr/bin/env node

/**
 * ╔════════════════════════════════════════════════════════════╗
 * ║   DK MasterBlaster — Part 1: Auto-Mastering Engine        ║
 * ║   Batch master your tracks on DistroKid Mixea              ║
 * ║   https://github.com/1OF1/dk-masterblaster                 ║
 * ╚════════════════════════════════════════════════════════════╝
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── CONFIGURATION ──────────────────────────────────────────
const MIXEA_URL = 'https://distrokid.com/mixea/';

// Intensity positions (0-4): 0=Low, 1=Low-Med, 2=Medium, 3=Med-High, 4=High
const INTENSITY_MAP = { low: 0, 'low-med': 1, medium: 2, 'med-high': 3, high: 4 };

// ─── LOAD CONFIG ────────────────────────────────────────────
function loadConfig() {
    const configPath = path.join(__dirname, 'config.json');
    if (!fs.existsSync(configPath)) {
        console.error('❌ No config.json found! Copy config.example.json → config.json and edit it.');
        console.error('   cp config.example.json config.json');
        process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    const sourceDir = path.resolve(raw.source);
    const outputDir = raw.output
        ? (path.isAbsolute(raw.output) ? raw.output : path.join(sourceDir, raw.output))
        : path.join(sourceDir, 'Mastered');

    const intensity = INTENSITY_MAP[(raw.intensity || 'high').toLowerCase()];
    if (intensity === undefined) {
        console.error(`❌ Invalid intensity: "${raw.intensity}". Use: low, low-med, medium, med-high, high`);
        process.exit(1);
    }

    // Auto-detect tracks if not specified
    let tracks = raw.tracks;
    if (!tracks || tracks.length === 0) {
        tracks = fs.readdirSync(sourceDir)
            .filter(f => /\.(mp3|wav|flac|m4a|aac|ogg)$/i.test(f))
            .sort();
        console.log(`📁 Auto-detected ${tracks.length} audio files in source directory`);
    }

    return { sourceDir, outputDir, intensity, eq: raw.eq || 'preserve', format: raw.format || 'ultra-hd', tracks };
}

// ─── HELPERS ────────────────────────────────────────────────
function log(msg) { console.log(msg); }
function warn(msg) { console.warn(`⚠️  ${msg}`); }
function success(msg) { console.log(`✅ ${msg}`); }
function fail(msg) { console.error(`❌ ${msg}`); }

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ─── MAIN ENGINE ────────────────────────────────────────────
async function run() {
    const config = loadConfig();
    const { sourceDir, outputDir, intensity, eq, format, tracks } = config;

    console.log(`
╔══════════════════════════════════════════════╗
║         🔫 DK MasterBlaster v1.0            ║
║         Part 1: Auto-Mastering               ║
╚══════════════════════════════════════════════╝
`);
    log(`📂 Source:    ${sourceDir}`);
    log(`📦 Output:    ${outputDir}`);
    log(`🎚️  Intensity: Position ${intensity}/4 (${Object.keys(INTENSITY_MAP).find(k => INTENSITY_MAP[k] === intensity)})`);
    log(`🎛️  EQ:        ${eq === 'preserve' ? 'Preserved (untouched)' : eq}`);
    log(`📀 Format:    ${format}`);
    log(`🎵 Tracks:    ${tracks.length}\n`);

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        log(`Created output directory: ${outputDir}`);
    }

    // ─── BROWSER LAUNCH ─────────────────────────────────
    const browserDataDir = path.join(__dirname, 'browser_data');
    const browser = await chromium.launchPersistentContext(browserDataDir, {
        headless: false,
        acceptDownloads: true,
        viewport: { width: 1280, height: 900 },
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    browser.on('page', p => {
        p.on('download', dl => log(`   ⬇️  Download started: ${dl.suggestedFilename()}`));
    });

    const page = browser.pages().length > 0 ? browser.pages()[0] : await browser.newPage();

    let completed = 0;
    let skipped = 0;
    let failed = 0;

    try {
        log('🌐 Navigating to Mixea...');
        await page.goto(MIXEA_URL);

        log('\n⚠️  LOG IN TO DISTROKID IN THE BROWSER WINDOW ⚠️');
        log('⏳ Waiting for Mixea interface...\n');

        await page.waitForFunction(() => {
            return document.querySelector('input[type="file"]') ||
                document.body.innerText.includes('My mastered tracks') ||
                document.body.innerText.includes('Master a new track');
        }, { timeout: 0 });

        success('Interface detected! Starting batch...\n');

        // ─── PROCESS EACH TRACK ─────────────────────────
        for (let idx = 0; idx < tracks.length; idx++) {
            const filename = tracks[idx];
            const filePath = path.join(sourceDir, filename);
            const outName = filename.replace(/\.[^.]+$/, '.wav');
            const outputFilePath = path.join(outputDir, outName);

            log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            log(`🎧 [${idx + 1}/${tracks.length}] ${filename}`);

            // Skip if already downloaded
            if (fs.existsSync(outputFilePath)) {
                log(`   ⏭️  Already exists: ${outName}`);
                skipped++;
                continue;
            }

            if (!fs.existsSync(filePath)) {
                fail(`   File not found: ${filePath}`);
                failed++;
                continue;
            }

            try {
                // ─── CHECK IF ALREADY MASTERED ──────────
                log('   🔍 Checking existing mastered tracks...');
                const masteredRow = page.locator('.finished-tracks-row').filter({ hasText: filename }).first();
                const exists = await masteredRow.isVisible().catch(() => false);
                let settingsMatch = false;

                if (exists) {
                    const isGenerating = await masteredRow.innerText().then(t => t.includes('Generating'));
                    if (!isGenerating) {
                        const settingsSpan = masteredRow.locator('span[id^="js_settings_"]');
                        const trackIntensity = await settingsSpan.getAttribute('data-intensity').catch(() => null);
                        const trackEq = await settingsSpan.getAttribute('data-eq').catch(() => null);
                        log(`   📊 Current: Intensity=${trackIntensity}, EQ=${trackEq}`);

                        if (trackIntensity === 'High' && intensity === 4) {
                            settingsMatch = true;
                            log('   ✨ Settings match! Skipping re-master.');
                        }
                    }
                }

                // ─── UPLOAD & MASTER ────────────────────
                if (!settingsMatch) {
                    if (exists) {
                        log('   🔄 Re-mastering with new settings...');
                        const newBtn = page.locator('#upload-music-button, .new-track-button-mobile')
                            .filter({ hasText: /Master a new track/i }).first();
                        if (await newBtn.isVisible().catch(() => false)) {
                            await newBtn.click();
                        } else {
                            await page.goto(MIXEA_URL);
                        }
                        await page.waitForTimeout(2000);
                    }

                    log(`   📤 Uploading: ${filename}`);
                    const fileInput = page.locator('input[type="file"]').first();
                    await fileInput.setInputFiles(filePath);

                    log('   ⏳ Waiting for editor...');
                    await page.waitForSelector('#intensity-range', { state: 'visible', timeout: 300000 });
                    success('Editor ready');

                    // ─── SET INTENSITY ──────────────────
                    log(`   🎚️  Setting intensity to position ${intensity}...`);
                    const slider = page.locator('#intensity-range');
                    const box = await slider.boundingBox();

                    if (box) {
                        const x = box.x + (box.width * 0.1) + ((box.width * 0.8) * (intensity / 4));
                        const y = box.y + (box.height / 2);
                        await page.mouse.click(x, y);
                        await page.waitForTimeout(2000);

                        // Verify
                        const label = await page.evaluate(() => {
                            return Array.from(document.querySelectorAll('span, div, b'))
                                .map(s => s.innerText).find(t => t.includes('Intensity')) || 'NOT FOUND';
                        });
                        log(`   🎯 Confirmed: ${label}`);
                    }

                    // EQ is preserved by default (don't touch the slider)
                    if (eq !== 'preserve') {
                        log(`   🎛️  EQ mode: ${eq} (custom EQ not yet implemented, preserving default)`);
                    }

                    // ─── WAIT FOR MASTERING ─────────────
                    log('   ⚡ Mastering in progress...');
                    await page.locator('button:has-text("Download mastered track")')
                        .waitFor({ state: 'visible', timeout: 300000 });
                    success('Mastering complete!');
                }

                // ─── DOWNLOAD ───────────────────────────
                log('   💾 Initiating download...');

                let downloadBtn;
                if (exists && settingsMatch) {
                    downloadBtn = masteredRow.locator('button').filter({ hasText: /Download/i }).first();
                } else {
                    downloadBtn = page.locator('button').filter({ hasText: /Download/i }).first();
                }

                await downloadBtn.waitFor({ state: 'visible', timeout: 30000 });
                await downloadBtn.click();
                await page.waitForTimeout(2000);

                // Select Ultra HD (WAV)
                const ultraHd = page.locator('div, span, li, button, a').filter({ hasText: /Ultra HD/i }).first();
                await ultraHd.waitFor({ state: 'visible', timeout: 15000 });

                // Multi-strategy download capture
                const downloadPromise = page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
                const newPagePromise = browser.waitForEvent('page', { timeout: 60000 }).catch(() => null);

                let audioUrl = null;
                const onResponse = (resp) => {
                    const ct = resp.headers()['content-type'] || '';
                    const url = resp.url();
                    if (ct.includes('audio') || ct.includes('octet-stream') || url.includes('.wav')) {
                        audioUrl = url;
                    }
                };
                page.on('response', onResponse);

                await ultraHd.click();
                await page.waitForTimeout(3000);

                const [download, newPage] = await Promise.all([downloadPromise, newPagePromise]);
                page.off('response', onResponse);

                if (download) {
                    await download.saveAs(outputFilePath);
                    const size = fs.statSync(outputFilePath).size;
                    success(`Saved: ${outName} (${formatBytes(size)})`);
                } else if (newPage) {
                    await newPage.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => { });
                    const resp = await page.request.get(newPage.url());
                    fs.writeFileSync(outputFilePath, await resp.body());
                    const size = fs.statSync(outputFilePath).size;
                    success(`Saved: ${outName} (${formatBytes(size)})`);
                    await newPage.close();
                } else if (audioUrl) {
                    const resp = await page.request.get(audioUrl);
                    fs.writeFileSync(outputFilePath, await resp.body());
                    const size = fs.statSync(outputFilePath).size;
                    success(`Saved: ${outName} (${formatBytes(size)})`);
                } else {
                    // Fallback: scan for direct download link
                    const wavLink = await page.evaluate(() => {
                        const links = document.querySelectorAll('a[href*=".wav"], a[href*="download"]');
                        return links.length > 0 ? links[0].href : null;
                    });

                    if (wavLink) {
                        const resp = await page.request.get(wavLink);
                        fs.writeFileSync(outputFilePath, await resp.body());
                        const size = fs.statSync(outputFilePath).size;
                        success(`Saved: ${outName} (${formatBytes(size)})`);
                    } else {
                        throw new Error('All download strategies failed');
                    }
                }

                completed++;

                // Return to main list
                if (!settingsMatch) {
                    await page.goto(MIXEA_URL);
                    await page.waitForTimeout(3000);
                }

            } catch (trackErr) {
                fail(`${filename}: ${trackErr.message}`);
                await page.screenshot({ path: path.join(__dirname, `error_${filename}.png`), fullPage: true }).catch(() => { });
                failed++;

                // Try to recover by going back to main page
                try {
                    await page.goto(MIXEA_URL);
                    await page.waitForTimeout(3000);
                } catch (e) { /* ignore */ }
            }
        }

    } catch (error) {
        fail(`Global failure: ${error.message}`);
    } finally {
        console.log(`
╔══════════════════════════════════════════════╗
║         🏁 BATCH COMPLETE                    ║
╠══════════════════════════════════════════════╣
║  ✅ Completed: ${String(completed).padEnd(5)} tracks               ║
║  ⏭️  Skipped:   ${String(skipped).padEnd(5)} tracks               ║
║  ❌ Failed:    ${String(failed).padEnd(5)} tracks               ║
║  📁 Output:   ${outputDir.substring(0, 28).padEnd(29)}║
╚══════════════════════════════════════════════╝
`);
        if (browser) await browser.close();
    }
}

run();
