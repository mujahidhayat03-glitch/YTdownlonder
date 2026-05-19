let currentVideoUrl = '';
let videoFormats = [];

function showElement(id) {
    document.getElementById(id).classList.remove('hidden');
}

function hideElement(id) {
    document.getElementById(id).classList.add('hidden');
}

function formatFileSize(bytes) {
    if (!bytes) return 'Unknown';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1000) return (mb / 1024).toFixed(2) + ' GB';
    return mb.toFixed(2) + ' MB';
}

function formatDuration(seconds) {
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

async function fetchVideoInfo() {
    const url = document.getElementById('videoUrl').value.trim();
    if (!url) {
        showError('Please enter a video URL');
        return;
    }

    currentVideoUrl = url;
    hideElement('error');
    hideElement('videoInfo');
    showElement('loading');

    try {
        const response = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
        const data = await response.json();

        hideElement('loading');

        if (data.error) {
            showError(data.error);
            return;
        }

        videoFormats = data.formats;
        displayVideoInfo(data);
        displayFormats(data.formats);
        showElement('videoInfo');
    } catch (error) {
        hideElement('loading');
        showError('Failed to fetch video information. Please check the URL and try again.');
    }
}

function showError(message) {
    document.getElementById('errorText').textContent = message;
    showElement('error');
}

function displayVideoInfo(info) {
    document.getElementById('thumbnail').src = info.thumbnail || '';
    document.getElementById('title').textContent = info.title || 'Unknown Title';
    document.getElementById('uploader').textContent = info.uploader || '';
    document.getElementById('duration').textContent = formatDuration(info.duration);
}

function displayFormats(formats) {
    const videoFormatsContainer = document.getElementById('videoFormats');
    const audioFormatsContainer = document.getElementById('audioFormats');

    const videoOnly = formats.filter(f => f.vcodec !== 'none' && f.acodec === 'none');
    const combined = formats.filter(f => f.vcodec !== 'none' && f.acodec !== 'none');
    const audioOnly = formats.filter(f => f.vcodec === 'none' && f.acodec !== 'none');

    const allVideoFormats = [...combined, ...videoOnly];
    const uniqueQualities = new Map();

    allVideoFormats.forEach(f => {
        if (!uniqueQualities.has(f.quality) && f.quality !== 'audio') {
            uniqueQualities.set(f.quality, f);
        }
    });

    videoFormatsContainer.innerHTML = '';
    uniqueQualities.forEach((format, quality) => {
        const btn = createQualityButton(format, quality);
        videoFormatsContainer.appendChild(btn);
    });

    audioFormatsContainer.innerHTML = '';
    const uniqueAudio = new Map();
    audioOnly.forEach(f => {
        const key = f.format_note || f.quality;
        if (!uniqueAudio.has(key)) {
            uniqueAudio.set(key, f);
        }
    });

    uniqueAudio.forEach((format, key) => {
        const btn = createAudioButton(format, key);
        audioFormatsContainer.appendChild(btn);
    });

    if (uniqueAudio.size === 0) {
        audioFormatsContainer.innerHTML = '<p class="text-muted">No audio-only formats available</p>';
    }
}

function createQualityButton(format, quality) {
    const btn = document.createElement('button');
    btn.className = 'quality-btn';
    btn.onclick = () => downloadVideo(format.id);
    btn.innerHTML = `
        <div class="quality-label">${quality}</div>
        <div class="quality-info">${format.ext.toUpperCase()} ${format.format_note ? '- ' + format.format_note : ''}</div>
        <div class="quality-size">${formatFileSize(format.filesize)}</div>
    `;
    return btn;
}

function createAudioButton(format, label) {
    const btn = document.createElement('button');
    btn.className = 'quality-btn';
    btn.onclick = () => downloadVideo(format.id);
    btn.innerHTML = `
        <div class="quality-label">Audio</div>
        <div class="quality-info">${format.ext.toUpperCase()} ${label ? '- ' + label : ''}</div>
        <div class="quality-size">${formatFileSize(format.filesize)}</div>
    `;
    return btn;
}

async function downloadVideo(formatId) {
    hideElement('videoInfo');
    showElement('downloading');
    document.getElementById('downloadStatus').textContent = 'Preparing download...';

    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: currentVideoUrl,
                formatId: formatId
            })
        });

        if (response.ok) {
            const contentDisposition = response.headers.get('content-disposition');
            let filename = 'video';
            if (contentDisposition) {
                const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (match) filename = match[1].replace(/['"]/g, '');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            hideElement('downloading');
            showElement('videoInfo');
        } else {
            const error = await response.json();
            hideElement('downloading');
            showError(error.error || 'Download failed');
            showElement('videoInfo');
        }
    } catch (error) {
        hideElement('downloading');
        showError('Download failed. Please try again.');
        showElement('videoInfo');
    }
}

async function convertVideo(format) {
    hideElement('videoInfo');
    showElement('downloading');
    document.getElementById('downloadStatus').textContent = `Converting to ${format.toUpperCase()}... This may take a while.`;

    try {
        const response = await fetch(`/api/convert?url=${encodeURIComponent(currentVideoUrl)}&format=${format}`);

        if (response.ok) {
            const contentDisposition = response.headers.get('content-disposition');
            let filename = `video.${format}`;
            if (contentDisposition) {
                const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (match) filename = match[1].replace(/['"]/g, '');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            hideElement('downloading');
            showElement('videoInfo');
        } else {
            const error = await response.json();
            hideElement('downloading');
            showError(error.error || 'Conversion failed');
            showElement('videoInfo');
        }
    } catch (error) {
        hideElement('downloading');
        showError('Conversion failed. Please try again.');
        showElement('videoInfo');
    }
}

function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));

    event.target.classList.add('active');

    if (tab === 'video') {
        document.getElementById('videoTab').classList.remove('hidden');
    } else if (tab === 'audio') {
        document.getElementById('audioTab').classList.remove('hidden');
    } else if (tab === 'convert') {
        document.getElementById('convertTab').classList.remove('hidden');
    }
}

document.getElementById('videoUrl').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        fetchVideoInfo();
    }
});
