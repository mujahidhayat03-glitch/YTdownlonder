const express = require('express');
const cors = require('cors');
const youtubeDl = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/info', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).json({ error: 'URL required' });

        const info = await youtubeDl(url, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            socketTimeout: 20,
        });

        const videoFormats = info.formats
            .filter(f => f.height && f.ext === 'mp4')
            .map(f => ({
                formatId: f.format_id,
                quality: `${f.height}p`,
                height: f.height,
                ext: f.ext,
                filesize: f.filesize || f.filesize_approx,
            }))
            .sort((a, b) => b.height - a.height);

        const seen = new Set();
        const uniqueFormats = videoFormats.filter(f => {
            if (seen.has(f.quality)) return false;
            seen.add(f.quality);
            return true;
        });

        const audioFormats = info.formats
            .filter(f => f.vcodec === 'none' && f.acodec !== 'none')
            .map(f => ({
                formatId: f.format_id,
                quality: f.format_note || `${Math.round(f.above / 1000)}kbps`,
                ext: f.ext,
                filesize: f.filesize || f.filesize_approx,
            }));

        res.json({
            title: info.title,
            thumbnail: info.thumbnail,
            duration: info.duration,
            uploader: info.uploader,
            videoFormats: uniqueFormats,
            audioFormats: audioFormats.slice(0, 5),
        });
    } catch (error) {
        res.status(400).json({ error: 'Failed to fetch video info', details: error.message });
    }
});

app.get('/api/download', async (req, res) => {
    const { url, formatId, type } = req.query;
    if (!url || !formatId) {
        return res.status(400).json({ error: 'URL and format required' });
    }

    const tempFileName = crypto.randomBytes(16).toString('hex');
    const tempDir = path.join(__dirname, 'downloads');

    try {
        if (type === 'audio') {
            const audioPath = path.join(tempDir, `${tempFileName}.mp3`);
            await youtubeDl(url, {
                format: formatId,
                extractAudio: true,
                audioFormat: 'mp3',
                output: audioPath,
                noCheckCertificates: true,
                noWarnings: true,
                socketTimeout: 30,
            });

            if (fs.existsSync(audioPath)) {
                const stats = fs.statSync(audioPath);
                res.setHeader('Content-Type', 'audio/mpeg');
                res.setHeader('Content-Disposition', `attachment; filename="audio.mp3"`);
                res.setHeader('Content-Length', stats.size);
                const stream = fs.createReadStream(audioPath);
                stream.pipe(res);
                stream.on('end', () => fs.unlinkSync(audioPath));
            } else {
                throw new Error('Audio file not created');
            }
        } else {
            const videoPath = path.join(tempDir, `${tempFileName}.mp4`);
            await youtubeDl(url, {
                format: `${formatId}+bestaudio[ext=m4a]/best`,
                mergeOutputFormat: 'mp4',
                output: videoPath,
                noCheckCertificates: true,
                noWarnings: true,
                socketTimeout: 60,
                retries: 5,
            });

            if (fs.existsSync(videoPath)) {
                const stats = fs.statSync(videoPath);
                res.setHeader('Content-Type', 'video/mp4');
                res.setHeader('Content-Disposition', `attachment; filename="video.mp4"`);
                res.setHeader('Content-Length', stats.size);
                const stream = fs.createReadStream(videoPath);
                stream.pipe(res);
                stream.on('end', () => {
                    if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
                });
            } else {
                throw new Error('Video file not created');
            }
        }
    } catch (error) {
        const files = [`${tempFileName}.mp4`, `${tempFileName}.mp3`];
        files.forEach(f => {
            const fp = path.join(tempDir, f);
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
        });
        res.status(400).json({ error: 'Download failed', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running: http://localhost:${PORT}`);
});
