require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || true;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  console.warn('⚠️  Supabase environment variables are not fully configured.');
}

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));

const frontendDir = fs.existsSync(path.join(__dirname, '..', 'frontend'))
  ? path.join(__dirname, '..', 'frontend')
  : path.join(__dirname, 'frontend');
if (fs.existsSync(frontendDir)) app.use(express.static(frontendDir));

// In-memory cache for media info to avoid duplicate network fetches
const infoCache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function getCachedInfo(url) {
  const item = infoCache.get(url);
  if (!item) return null;
  if (Date.now() - item.time > CACHE_TTL) {
    infoCache.delete(url);
    return null;
  }
  return item.data;
}

function setCachedInfo(url, data) {
  // Keep cache small
  if (infoCache.size > 200) {
    const oldestKey = infoCache.keys().next().value;
    infoCache.delete(oldestKey);
  }
  infoCache.set(url, { data, time: Date.now() });
}

// Public browser configuration. Never expose the service-role key here.
app.get('/api/config', (req, res) => {
  res.json({ supabaseUrl: SUPABASE_URL || '', supabaseAnonKey: SUPABASE_ANON_KEY || '' });
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'instadown-backend' }));

async function authenticate(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token || !supabaseAdmin) return res.status(401).json({ error: 'Google sign-in required.' });

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: 'Session expired. Please sign in with Google again.' });
  req.authUser = data.user;
  next();
}

async function ensureUser(user) {
  const payload = {
    id: user.id,
    email: user.email || null,
    full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
    avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
    last_login: new Date().toISOString()
  };
  const { data, error } = await supabaseAdmin
    .from('users')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const user = await ensureUser(req.authUser);
    res.json({ user });
  } catch (error) {
    console.error('Profile error:', error.message);
    res.status(500).json({ error: 'Could not load your account.' });
  }
});

app.get('/api/auth/history', authenticate, async (req, res) => {
  try {
    await ensureUser(req.authUser);
    const { data, error } = await supabaseAdmin
      .from('download_history')
      .select('id, url, media_type, title, downloaded_at')
      .eq('user_id', req.authUser.id)
      .order('downloaded_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json({ history: data || [] });
  } catch (error) {
    console.error('History error:', error.message);
    res.status(500).json({ error: 'Could not load download history.' });
  }
});

function cleanTitle(raw, platform = 'instagram') {
  if (!raw) return platform === 'youtube' ? 'YouTube Video' : 'Instagram Video';
  const lines = String(raw).split('\n').filter(line => line.trim() && !/^@[\w.]+$/.test(line.trim()));
  const clean = lines.join(' ').replace(/@[\w.]+/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) return platform === 'youtube' ? 'YouTube Video' : 'Instagram Video';
  return clean.length > 80 ? clean.slice(0, 77) + '…' : clean;
}

function formatDuration(sec) {
  if (!sec || isNaN(sec)) return null;
  const s = Math.round(Number(sec));
  const m = Math.floor(s / 60);
  const remainingS = s % 60;
  if (m < 60) {
    return `${m}:${remainingS < 10 ? '0' : ''}${remainingS}`;
  }
  const h = Math.floor(m / 60);
  const remainingM = m % 60;
  return `${h}:${remainingM < 10 ? '0' : ''}${remainingM}:${remainingS < 10 ? '0' : ''}${remainingS}`;
}

function run(command, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Process timed out after ${Math.round(timeoutMs / 1000)} seconds.`));
    }, timeoutMs);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', err => { clearTimeout(timer); reject(err); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim().replace(/\r?\n/g, ' ').slice(-1200) || `Process exited with code ${code}`));
    });
  });
}

async function hasAudio(filePath) {
  try {
    await run('ffprobe', [
      '-v', 'error', '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_name', '-of', 'default=noprint_wrappers=1:nokey=1', filePath
    ], 15000);
    return true;
  } catch {
    return false;
  }
}

// Fast metadata extraction with caching
async function fetchMediaInfo(url, platform) {
  const isYouTube = platform === 'youtube' || /youtu\.?be/i.test(url);
  const cached = getCachedInfo(url);
  if (cached) return cached;

  const args = [
    '-m', 'yt_dlp',
    '--no-playlist',
    '--no-warnings',
    '--socket-timeout', '15',
    '--dump-single-json',
  ];

  if (isYouTube) {
    // Critical: prevents bot check / 429 errors on YouTube
    args.push('--extractor-args', 'youtube:player_client=android,web');
  }

  args.push(url);

  let stdout;
  try {
    ({ stdout } = await run('python', args, 35000));
  } catch (firstError) {
    try {
      ({ stdout } = await run('python3', args, 35000));
    } catch (secondError) {
      throw new Error(`Media fetch failed: ${secondError.message || firstError.message}`);
    }
  }

  const raw = JSON.parse(stdout.trim().split(/\r?\n/).pop() || '{}');
  const info = {
    title: cleanTitle(raw.title || raw.description, isYouTube ? 'youtube' : 'instagram'),
    description: raw.description ? String(raw.description).split('\n')[0].slice(0, 140) : '',
    thumbnail: raw.thumbnail || null,
    duration: raw.duration || null,
    durationFormatted: formatDuration(raw.duration),
    resolution: raw.resolution || (raw.width && raw.height ? `${raw.width}x${raw.height}` : null),
    platform: isYouTube ? 'youtube' : 'instagram',
    uploader: raw.uploader || raw.channel || null
  };

  setCachedInfo(url, info);
  return info;
}

async function ytdlpDownload(url, { quality, audioOnly, platform } = {}) {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const isYouTube = platform === 'youtube' || /youtu\.?be/i.test(url);

  let formatArg, outTemplate, mergeFormat;
  if (audioOnly) {
    // Audio-only: extract audio and convert to mp3
    formatArg = 'bestaudio/best';
    outTemplate = path.join(os.tmpdir(), `instadown_${id}.%(ext)s`);
    mergeFormat = null;
  } else if (isYouTube && quality) {
    // YouTube with specific quality — merge video + audio
    formatArg = quality;
    outTemplate = path.join(os.tmpdir(), `instadown_${id}.%(ext)s`);
    mergeFormat = 'mp4';
  } else {
    // Instagram or default: best video + audio merged
    formatArg = 'bestvideo*+bestaudio/best';
    outTemplate = path.join(os.tmpdir(), `instadown_${id}.%(ext)s`);
    mergeFormat = 'mp4';
  }

  const args = [
    '-m', 'yt_dlp',
    '--no-playlist',
    '--no-warnings',
    '--socket-timeout', '20',
    '--restrict-filenames',
    '--format', formatArg,
    '--output', outTemplate,
    '--print', 'after_move:filepath',
  ];

  if (isYouTube) {
    // Critical: prevents bot check / 429 errors on YouTube
    args.push('--extractor-args', 'youtube:player_client=android,web');
  }

  if (mergeFormat) {
    args.push('--merge-output-format', mergeFormat);
  }

  if (audioOnly) {
    args.push('--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0');
  }

  args.push(url);

  let stdout;
  try {
    ({ stdout } = await run('python', args, 180000));
  } catch (firstError) {
    try {
      ({ stdout } = await run('python3', args, 180000));
    } catch (secondError) {
      throw new Error(`Download failed: ${secondError.message || firstError.message}`);
    }
  }

  const lines = stdout.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const printedPath = lines.pop();
  let filePath = printedPath && fs.existsSync(printedPath) ? printedPath : null;

  if (!filePath) {
    const candidates = fs.readdirSync(os.tmpdir())
      .filter(name => name.startsWith(`instadown_${id}.`))
      .map(name => path.join(os.tmpdir(), name));
    filePath = candidates.find(fs.existsSync) || null;
  }

  if (!filePath) throw new Error('Download completed but the media file was not found.');

  // For non-audio-only, check audio stream
  if (!audioOnly) {
    const okAudio = await hasAudio(filePath);
    if (!okAudio) {
      console.warn('Audio check: video has no separate audio track or ffprobe timed out.');
    }
  }

  const base = path.basename(filePath);

  // Reuse cached metadata so we NEVER execute a redundant second yt-dlp call
  let metadata = getCachedInfo(url);
  if (!metadata) {
    // Fast fallback metadata
    metadata = {
      title: cleanTitle(path.parse(base).name.replace(/_mp4$|_mp3$/i, '').replace(/instadown_\w+_/i, ''), isYouTube ? 'youtube' : 'instagram'),
      description: '',
      thumbnail: null
    };
  }

  return {
    filePath,
    title: metadata.title || cleanTitle(null, isYouTube ? 'youtube' : 'instagram'),
    description: metadata.description || '',
    thumbnail: metadata.thumbnail || null,
    durationFormatted: metadata.durationFormatted || null,
    isVideo: !audioOnly,
    audioOnly,
    filename: base
  };
}

const tempFiles = new Map();

// Fast info endpoint for real-time video preview
app.post('/api/info', authenticate, async (req, res) => {
  try {
    let { url, platform } = req.body || {};
    if (!url) return res.status(400).json({ error: 'Please paste a video link.' });
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

    const parsed = new URL(url);
    const isInstagram = /(^|\.)instagram\.com$/i.test(parsed.hostname);
    const isYouTube = /(^|\.)youtube\.com$/i.test(parsed.hostname) || /^youtu\.be$/i.test(parsed.hostname);

    if (!isInstagram && !isYouTube) {
      return res.status(400).json({ error: 'Please provide a valid Instagram or YouTube URL.' });
    }

    const detectedPlatform = isYouTube ? 'youtube' : 'instagram';
    const cleanUrl = isYouTube ? url : `${parsed.origin}${parsed.pathname}`;

    const info = await fetchMediaInfo(cleanUrl, platform || detectedPlatform);
    res.json({ success: true, ...info });
  } catch (err) {
    console.error('Info fetch error:', err.message);
    res.status(500).json({ error: 'Unable to fetch video details. Ensure the content is publicly accessible.' });
  }
});

app.post('/api/download', authenticate, async (req, res) => {
  let result;
  try {
    let { url, platform, quality, audioOnly } = req.body || {};
    if (!url) return res.status(400).json({ error: 'Please paste a video link.' });
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

    const parsed = new URL(url);
    const isInstagram = /(^|\.)instagram\.com$/i.test(parsed.hostname);
    const isYouTube = /(^|\.)youtube\.com$/i.test(parsed.hostname) || /^youtu\.be$/i.test(parsed.hostname);

    if (!isInstagram && !isYouTube) {
      return res.status(400).json({ error: 'Please provide a valid Instagram or YouTube URL.' });
    }

    const detectedPlatform = isYouTube ? 'youtube' : 'instagram';
    const cleanUrl = isYouTube ? url : `${parsed.origin}${parsed.pathname}`;

    result = await ytdlpDownload(cleanUrl, {
      platform: platform || detectedPlatform,
      quality: quality || null,
      audioOnly: audioOnly === true
    });

    const token = `dl_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    tempFiles.set(token, result.filePath);
    setTimeout(() => {
      const fp = tempFiles.get(token);
      if (fp) { try { fs.unlinkSync(fp); } catch {} tempFiles.delete(token); }
    }, 10 * 60 * 1000);

    await ensureUser(req.authUser);
    const { error: historyError } = await supabaseAdmin.from('download_history').insert({
      user_id: req.authUser.id,
      url: cleanUrl,
      media_type: result.audioOnly ? 'audio' : 'video',
      title: result.title
    });
    if (historyError) console.error('History insert error:', historyError.message);

    const { error: countError } = await supabaseAdmin.rpc('increment_download_count', { target_user_id: req.authUser.id });
    if (countError) console.warn('Download counter update skipped:', countError.message);

    const fileSize = fs.statSync(result.filePath).size;
    res.json({
      success: true,
      isVideo: !result.audioOnly,
      audioOnly: result.audioOnly || false,
      hasAudio: true,
      thumbnail: result.thumbnail,
      title: result.title,
      description: result.description,
      durationFormatted: result.durationFormatted,
      fileSize,
      downloadUrl: `/api/file/${token}`
    });
  } catch (error) {
    if (result?.filePath) try { fs.unlinkSync(result.filePath); } catch {}
    console.error('Download error:', error.message);
    res.status(500).json({ error: error.message || 'Download failed. Please try another public video.' });
  }
});

// Direct file download using the one-time secure capability token generated by /api/download
app.get('/api/file/:token', async (req, res) => {
  const filePath = tempFiles.get(req.params.token);
  if (!filePath || !fs.existsSync(filePath)) {
    tempFiles.delete(req.params.token);
    return res.status(404).json({ error: 'File not found or expired.' });
  }

  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const isMp3 = ext === '.mp3';
  const contentType = isMp3 ? 'audio/mpeg' : 'video/mp4';
  const defaultName = isMp3 ? `audio_${Date.now()}.mp3` : `video_${Date.now()}.mp4`;
  const requestedName = req.query.name ? path.basename(String(req.query.name)).replace(/[^\w.-]/g, '_') : null;
  const filename = requestedName || defaultName;

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Accept-Ranges', 'bytes');
  fs.createReadStream(filePath).pipe(res);
  res.on('finish', () => setTimeout(() => {
    try { fs.unlinkSync(filePath); } catch {}
    tempFiles.delete(req.params.token);
  }, 3000));
});

app.get('/api/admin/users', authenticate, async (req, res) => {
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (!adminEmails.includes((req.authUser.email || '').toLowerCase())) return res.status(403).json({ error: 'Forbidden' });
  const { data, error } = await supabaseAdmin.from('users').select('id,email,full_name,avatar_url,downloads,created_at,last_login').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ count: data.length, users: data });
});

app.get('*', (req, res) => {
  if (fs.existsSync(path.join(frontendDir, 'index.html'))) return res.sendFile(path.join(frontendDir, 'index.html'));
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 InstaDown Pro backend listening on ${PORT}`);
  console.log('🔐 Authentication: Supabase Google OAuth');
  console.log('🎬 Download engine: yt-dlp + FFmpeg (audio verification enabled)');
});
