#!/usr/bin/env node

/**
 * ╔════════════════════════════════════════════════════════════╗
 * ║   DK MasterBlaster — Grab: Song Downloader                ║
 * ║   Download all songs from a Smol mixtape or artist page    ║
 * ║   https://github.com/1OF1/dk-masterblaster                ║
 * ╚════════════════════════════════════════════════════════════╝
 *
 * Usage:
 *   node grab.mjs <mixtape-url-or-id> [options]
 *
 * Examples:
 *   node grab.mjs https://app.smol.xyz/mixtapes/abc123
 *   node grab.mjs abc123 --artist "1OF1" --album "Solstice"
 *   node grab.mjs abc123 --output "./My Album"
 *   node grab.mjs abc123 --covers    (also download cover art)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = 'https://api.smol.xyz';
const APP_URL = 'https://app.smol.xyz';

// ─── PARSE ARGS ─────────────────────────────────────────────
function parseArgs() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log(`
╔══════════════════════════════════════════════╗
║  🔫 DK MasterBlaster — Grab                 ║
║  Download songs from Smol mixtapes           ║
╚══════════════════════════════════════════════╝

Usage:
  node grab.mjs <mixtape-url-or-id> [options]

Options:
  --artist <name>    Artist name for folder & file naming
  --album <name>     Album name for folder naming
  --output <path>    Output directory (default: Desktop/<Artist - Album>)
  --covers           Also download cover art for each track
  --numbered         Prefix filenames with track numbers (01 - ...)

Examples:
  node grab.mjs https://app.smol.xyz/mixtapes/abc123
  node grab.mjs abc123 --artist "1OF1" --album "Solstice" --numbered --covers
`);
        process.exit(0);
    }

    const opts = {
        input: args[0],
        artist: null,
        album: null,
        output: null,
        covers: false,
        numbered: false,
    };

    for (let i = 1; i < args.length; i++) {
        switch (args[i]) {
            case '--artist': opts.artist = args[++i]; break;
            case '--album': opts.album = args[++i]; break;
            case '--output': opts.output = args[++i]; break;
            case '--covers': opts.covers = true; break;
            case '--numbered': opts.numbered = true; break;
        }
    }

    // Extract mixtape ID from URL or use directly
    if (opts.input.includes('smol.xyz')) {
        const parts = opts.input.split('/');
        opts.input = parts[parts.length - 1].split('?')[0];
    }

    return opts;
}

// ─── HELPERS ────────────────────────────────────────────────
function sanitize(name) {
    return name.replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, ' ').trim();
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
}

async function downloadFile(url, filepath) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${url}`);
    const buffer = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(filepath, buffer);
    return buffer.length;
}

// ─── FETCH MIXTAPE DATA ─────────────────────────────────────
async function getMixtapeData(mixtapeId) {
    console.log(`🔍 Fetching mixtape: ${mixtapeId}`);
    const resp = await fetch(`${API_URL}/mixtapes/${mixtapeId}`);
    if (!resp.ok) throw new Error(`Failed to fetch mixtape: ${resp.status} ${resp.statusText}`);

    const data = await resp.json();
    return {
        id: data.Id,
        title: data.Title,
        description: data.Desc,
        tracks: data.Smols || [],
    };
}

// ─── FETCH TRACK DETAILS ────────────────────────────────────
async function getTrackData(smolId) {
    const resp = await fetch(`${API_URL}/${smolId}`);
    if (!resp.ok) return null;

    const data = await resp.json();
    const d1 = data?.d1;
    const kv_do = data?.kv_do;
    const songs = kv_do?.songs || [];
    const bestSong = d1?.Song_1;
    const bestSongData = songs.find(s => s.music_id === bestSong);

    const audioUrl = (bestSongData && bestSongData.status < 4)
        ? bestSongData.audio
        : bestSongData?.music_id
            ? `${API_URL}/song/${bestSongData.music_id}.mp3`
            : null;

    return {
        id: smolId,
        title: kv_do?.lyrics?.title ?? kv_do?.description ?? d1?.Title ?? 'Untitled',
        creator: d1?.Address ?? null,
        audioUrl,
        coverUrl: `${API_URL}/image/${smolId}.png`,
    };
}

// ─── MAIN ───────────────────────────────────────────────────
async function run() {
    const opts = parseArgs();

    console.log(`
╔══════════════════════════════════════════════╗
║  🔫 DK MasterBlaster — Grab                 ║
║  Downloading from Smol...                    ║
╚══════════════════════════════════════════════╝
`);

    // Fetch mixtape
    const mixtape = await getMixtapeData(opts.input);
    console.log(`📀 Mixtape: ${mixtape.title}`);
    console.log(`🎵 Tracks:  ${mixtape.tracks.length}\n`);

    // Determine output directory
    const artist = opts.artist || 'Unknown Artist';
    const album = opts.album || sanitize(mixtape.title) || 'Untitled';
    const outputDir = opts.output || path.join(
        process.env.USERPROFILE || process.env.HOME || '.',
        'Desktop',
        `${artist} - ${album}`
    );

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    console.log(`📂 Output: ${outputDir}\n`);

    // Process tracks
    let downloaded = 0;
    let failed = 0;
    const trackList = [];

    for (let i = 0; i < mixtape.tracks.length; i++) {
        const smol = mixtape.tracks[i];
        const smolId = typeof smol === 'string' ? smol : smol.Id;

        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`🎧 [${i + 1}/${mixtape.tracks.length}] Fetching track data...`);

        try {
            const track = await getTrackData(smolId);
            if (!track || !track.audioUrl) {
                console.log(`   ❌ No audio URL found for: ${smolId}`);
                failed++;
                continue;
            }

            const title = sanitize(track.title);
            const prefix = opts.numbered ? `${String(i + 1).padStart(2, '0')} - ` : '';
            const filename = `${prefix}${title}.mp3`;
            const filepath = path.join(outputDir, filename);

            // Skip if exists
            if (fs.existsSync(filepath)) {
                console.log(`   ⏭️  Already exists: ${filename}`);
                trackList.push({ num: i + 1, title, filename, status: 'skipped' });
                continue;
            }

            // Download audio
            console.log(`   📥 Downloading: ${title}`);
            console.log(`      URL: ${track.audioUrl.substring(0, 80)}...`);
            const size = await downloadFile(track.audioUrl, filepath);
            console.log(`   ✅ Saved: ${filename} (${formatBytes(size)})`);
            trackList.push({ num: i + 1, title, filename, status: 'downloaded', size });
            downloaded++;

            // Download cover if requested
            if (opts.covers && track.coverUrl) {
                const coversDir = path.join(outputDir, 'covers');
                if (!fs.existsSync(coversDir)) fs.mkdirSync(coversDir, { recursive: true });
                const coverPath = path.join(coversDir, `${prefix}${title}.png`);
                if (!fs.existsSync(coverPath)) {
                    try {
                        await downloadFile(track.coverUrl, coverPath);
                        console.log(`   🎨 Cover saved`);
                    } catch (e) {
                        console.log(`   ⚠️  Cover download failed: ${e.message}`);
                    }
                }
            }

            // Small delay to be nice to the API
            await new Promise(r => setTimeout(r, 300));

        } catch (err) {
            console.log(`   ❌ Failed: ${err.message}`);
            failed++;
        }
    }

    // Summary
    console.log(`
╔══════════════════════════════════════════════╗
║  🏁 GRAB COMPLETE                            ║
╠══════════════════════════════════════════════╣
║  📀 ${mixtape.title.substring(0, 40).padEnd(41)}║
║  ✅ Downloaded: ${String(downloaded).padEnd(5)} tracks               ║
║  ❌ Failed:     ${String(failed).padEnd(5)} tracks               ║
║  📂 ${outputDir.substring(0, 42).padEnd(43)}║
╚══════════════════════════════════════════════╝
`);

    // Write tracklist
    const listPath = path.join(outputDir, 'tracklist.txt');
    const listContent = trackList
        .map(t => `${String(t.num).padStart(2, '0')}. ${t.title}${t.size ? ` (${formatBytes(t.size)})` : ''}`)
        .join('\n');
    fs.writeFileSync(listPath, `${artist} - ${album}\n${'='.repeat(40)}\n\n${listContent}\n`);
    console.log(`📝 Tracklist saved to: tracklist.txt`);
}

run().catch(err => {
    console.error(`\n❌ Fatal error: ${err.message}`);
    process.exit(1);
});
