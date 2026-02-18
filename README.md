# 🔫 DK MasterBlaster

**Batch auto-master your tracks on DistroKid Mixea.**

```
╔══════════════════════════════════════════════╗
║         🔫 DK MasterBlaster v1.0            ║
║         Part 1: Auto-Mastering               ║
╚══════════════════════════════════════════════╝
```

Feed it a folder of tracks, walk away, come back to a folder of mastered WAV files. That's it.

## What It Does

DK MasterBlaster automates the [DistroKid Mixea](https://distrokid.com/mixea/) mastering process using Playwright browser automation:

1. **Uploads** each track to Mixea
2. **Sets intensity** (Low → High, 5-point slider)
3. **Preserves EQ** (or lets you change it)
4. **Downloads** the mastered track as Ultra HD WAV
5. **Skips** tracks already mastered with matching settings
6. **Recovers** from errors and continues the batch

### The DK MasterBlaster Toolkit

| Part | What | Status |
|------|-------|--------|
| **Part 1** | Auto-Mastering (Mixea) | ✅ Ready |
| **Part 2** | Album Upload Automation | 🔜 Coming Soon |

## Quick Start

### 1. Install

```bash
git clone https://github.com/YOUR_USERNAME/dk-masterblaster.git
cd dk-masterblaster
npm install
npm run setup    # installs Chromium for Playwright
```

### 2. Configure

```bash
cp config.example.json config.json
```

Edit `config.json`:

```json
{
  "source": "C:\\Users\\You\\Desktop\\Artist - Album",
  "output": "Mastered",
  "intensity": "high",
  "eq": "preserve",
  "format": "ultra-hd",
  "tracks": []
}
```

> **Tip:** Leave `tracks` empty (`[]`) to auto-detect all audio files in `source`.

### 3. Run

```bash
npm run master
```

A browser window opens → **log into DistroKid** → it takes over from there.

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `source` | string | *required* | Path to folder with your MP3/WAV/FLAC files |
| `output` | string | `"Mastered"` | Output folder (relative to source, or absolute path) |
| `intensity` | string | `"high"` | `low`, `low-med`, `medium`, `med-high`, `high` |
| `eq` | string | `"preserve"` | `preserve` keeps the default EQ untouched |
| `format` | string | `"ultra-hd"` | Download format (Ultra HD WAV) |
| `tracks` | array | `[]` | Explicit track list, or `[]` for auto-detect |

## How It Works

DK MasterBlaster uses a **4-tier download capture strategy** because Mixea doesn't trigger standard browser downloads:

1. **Standard download event** — Playwright's built-in download detection
2. **New page/popup** — Catches files opened in new tabs
3. **Network interception** — Monitors for audio content-type responses
4. **Direct link scan** — Finds the actual WAV download URL in the DOM

Strategy 4 is the one that consistently works. The others are failsafes.

### Resumable

Already mastered some tracks? No problem:
- Tracks already in the output folder are **skipped automatically**
- Tracks already mastered on Mixea with matching settings **skip re-upload**
- If a track fails, the script **recovers** and continues with the next one

## Troubleshooting

### Browser won't start
```bash
# Kill any zombie browser processes
taskkill /F /IM chrome.exe 2>nul
npm run clean     # removes browser_data/
npm run setup     # reinstall Chromium
```

### Login required every time
The script uses a persistent browser profile (`browser_data/`). Once you log in once, it stays logged in for future runs.

### Track fails to download
Check the `error_*.png` screenshots generated in the project root. These show exactly what the browser looked like when the download failed.

## Part 2: Album Upload (Coming Soon)

Part 2 will automate the DistroKid album upload process:
- Fill in album metadata (title, artist, genre, etc.)
- Upload cover art
- Set track order and metadata
- Configure release date and pricing
- Submit for distribution

Stay tuned. 🚀

## License

MIT
