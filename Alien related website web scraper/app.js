const state = {
  records: [],
  filter: 'all',
  query: '',
  sort: 'popular',
  activeRecord: null,
};

const translationCache = new Map();
const TRANSLATION_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const ENGAGEMENT_STORAGE_KEY = 'signal-archive-engagement-v1';
let engagement = {};

try {
  const savedEngagement = JSON.parse(localStorage.getItem(ENGAGEMENT_STORAGE_KEY) || '{}');
  if (savedEngagement && typeof savedEngagement === 'object' && !Array.isArray(savedEngagement)) {
    engagement = savedEngagement;
  }
} catch (error) {
  console.warn('Could not restore article engagement:', error);
}

const elements = {
  grid: document.querySelector('#record-grid'),
  empty: document.querySelector('#empty-state'),
  count: document.querySelector('#record-count'),
  note: document.querySelector('#results-note'),
  search: document.querySelector('#search-input'),
  sort: document.querySelector('#sort-select'),
  clear: document.querySelector('#clear-button'),
  filterGroup: document.querySelector('.filter-group'),
  filterCursor: document.querySelector('.filter-cursor'),
  dialog: document.querySelector('#detail-dialog'),
  closeDialog: document.querySelector('#close-dialog'),
  detailImageWrap: document.querySelector('#detail-image-wrap'),
  detailSource: document.querySelector('#detail-source'),
  detailTitle: document.querySelector('#detail-title'),
  detailDescription: document.querySelector('#detail-description'),
  detailDate: document.querySelector('#detail-date'),
  detailAuthor: document.querySelector('#detail-author'),
  detailId: document.querySelector('#detail-id'),
  detailSourceLink: document.querySelector('#detail-source-link'),
  copyLink: document.querySelector('#copy-link'),
  copyFeedback: document.querySelector('#copy-feedback'),
  archiveView: document.querySelector('#archive-view'),
  communityView: document.querySelector('#community-view'),
  joinView: document.querySelector('#join-view'),
  joinForm: document.querySelector('#join-form'),
  joinFeedback: document.querySelector('#join-feedback'),
};

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;',
}[character]));

const formatDate = (value) => {
  if (!value) return 'Date unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  }).format(date);
};

  const translateText = async (value) => {
    if (!value || typeof value !== 'string') return value;
    const text = value.trim();
    if (!text || translationCache.has(text)) return translationCache.get(text) || value;

    try {
      const parameters = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: 'en', dt: 't', q: text });
      const response = await fetch(`${TRANSLATION_ENDPOINT}?${parameters.toString()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const translated = Array.isArray(payload[0])
        ? payload[0].map((part) => part[0]).filter(Boolean).join('')
        : '';
      if (translated) translationCache.set(text, translated);
      return translated || value;
    } catch (error) {
      console.warn('Could not translate record text:', error);
      return value;
    }
  };

  const translateRecord = async (record) => {
    const translated = await Promise.all([
      translateText(record.title),
      translateText(record.description),
      translateText(record.author),
    ]);
    return { ...record, title: translated[0], description: translated[1], author: translated[2] };
  };

  const translateRecords = async (records) => Promise.all(records.map(translateRecord));

const searchableText = (record) => [record.title, record.description, record.author, record.identifier]
  .filter(Boolean).join(' ').toLowerCase();

const hasImages = (record) => Array.isArray(record.image_urls) && record.image_urls.length > 0;
const buildFallbackImage = (record) => {
  const title = String(record.title || 'Untitled record').slice(0, 68);
  const source = String(record.source || 'public source').replaceAll('_', ' ').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 620"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f0f0ec"/><stop offset=".48" stop-color="#f0444d"/><stop offset="1" stop-color="#0d0d0d"/></linearGradient><pattern id="p" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M0 32L32 0" stroke="#fff" stroke-opacity=".12"/></pattern></defs><rect width="900" height="620" fill="#0d0d0d"/><rect width="900" height="620" fill="url(#g)" opacity=".24"/><rect width="900" height="620" fill="url(#p)"/><circle cx="700" cy="160" r="112" fill="none" stroke="#f0f0ec" stroke-opacity=".5" stroke-width="2"/><circle cx="700" cy="160" r="72" fill="none" stroke="#f0f0ec" stroke-opacity=".3"/><text x="58" y="500" fill="#f0f0ec" font-family="monospace" font-size="20" letter-spacing="3">${escapeHtml(source)}</text><text x="58" y="550" fill="#fff" font-family="Arial, sans-serif" font-size="30" font-weight="700">${escapeHtml(title)}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};
const getRecordImage = (record) => record.image_urls?.[0] || buildFallbackImage(record);
const recordKey = (record) => record.identifier || record.url;
const getPopularity = (record) => {
  const metrics = engagement[recordKey(record)] || {};
  return (Number(metrics.clicks) || 0) * 3 + (Number(metrics.views) || 0);
};

const trackEngagement = (record, type) => {
  const key = recordKey(record);
  const metrics = engagement[key] || { clicks: 0, views: 0 };
  metrics[type] = (Number(metrics[type]) || 0) + 1;
  engagement[key] = metrics;
  try {
    localStorage.setItem(ENGAGEMENT_STORAGE_KEY, JSON.stringify(engagement));
  } catch (error) {
    console.warn('Could not save article engagement:', error);
  }
};

const getVisibleRecords = () => {
  const query = state.query.trim().toLowerCase();
  const filtered = state.records.filter((record) => {
    const matchesQuery = !query || searchableText(record).includes(query);
    const imageCount = hasImages(record) ? record.image_urls.length : 0;
    const matchesFilter = state.filter === 'all'
      || (state.filter === 'images' && imageCount > 0)
      || (state.filter === 'text' && imageCount === 0);
    return matchesQuery && matchesFilter;
  });
  return filtered.sort((left, right) => {
    if (state.sort === 'popular') {
      const popularityDifference = getPopularity(right) - getPopularity(left);
      if (popularityDifference) return popularityDifference;
    }
    if (state.sort === 'title') return (left.title || '').localeCompare(right.title || '');
    const leftDate = left.published_at ? new Date(left.published_at).getTime() : 0;
    const rightDate = right.published_at ? new Date(right.published_at).getTime() : 0;
    return state.sort === 'oldest' ? leftDate - rightDate : rightDate - leftDate;
  });
};

const moveFilterCursor = (button) => {
  if (!button || !elements.filterCursor) return;
  elements.filterCursor.style.left = `${button.offsetLeft}px`;
  elements.filterCursor.style.width = `${button.offsetWidth}px`;
  elements.filterCursor.style.opacity = '1';
};

const resetFilterCursor = () => {
  moveFilterCursor(document.querySelector('.filter-button.is-active'));
};

const renderCard = (record, index) => {
  const imageUrl = getRecordImage(record);
  const fallbackImage = buildFallbackImage(record);
  const title = escapeHtml(record.title || 'Untitled record');
  const description = escapeHtml(record.description || 'No description was supplied with this record.');
  const image = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="${title}" loading="lazy" referrerpolicy="no-referrer" data-image-fallback data-fallback-image="${escapeHtml(fallbackImage)}">`
    : '<div class="media-placeholder" aria-hidden="true">◌</div>';
  return `<article class="record-card gallery-panel" tabindex="0" data-gallery-index="${index}" data-record-id="${escapeHtml(record.identifier || record.url)}" style="animation-delay: ${Math.min(index * 35, 350)}ms">
    <div class="card-media">${image}<span class="card-index">${String(index + 1).padStart(2, '0')}</span></div>
    <div class="card-body">
      <p class="card-kicker">${escapeHtml(record.source || 'Public source')}</p>
      <h3 class="card-title">${title}</h3>
      <p class="card-description">${description}</p>
      <div class="card-footer">
        <span class="card-date">${escapeHtml(formatDate(record.published_at))}</span>
        <button class="card-open" type="button" data-record-id="${escapeHtml(record.identifier || record.url)}">Inspect ↗</button>
      </div>
    </div>
  </article>`;
};

const render = () => {
  const visibleRecords = getVisibleRecords();
  elements.count.textContent = visibleRecords.length;
  elements.note.textContent = state.query || state.filter !== 'all'
    ? 'Filtered view / select a record to inspect'
    : 'Ranked by local views and source clicks';
  elements.grid.innerHTML = visibleRecords.map(renderCard).join('');
  setExpandedPanel(Math.min(2, visibleRecords.length - 1));
  elements.empty.hidden = visibleRecords.length > 0;
  elements.grid.hidden = visibleRecords.length === 0;
};

const setExpandedPanel = (index) => {
  document.querySelectorAll('.gallery-panel').forEach((panel) => {
    panel.classList.toggle('is-expanded', Number(panel.dataset.galleryIndex) === index);
  });
};

const openDetails = (record) => {
  if (!record) return;
  state.activeRecord = record;
  trackEngagement(record, 'views');
  const imageUrl = getRecordImage(record);
  const fallbackImage = buildFallbackImage(record);
  elements.detailSource.textContent = `${record.source || 'Public source'} / record detail`;
  elements.detailTitle.textContent = record.title || 'Untitled record';
  elements.detailDescription.textContent = record.description || 'No description was supplied with this record.';
  elements.detailDate.textContent = formatDate(record.published_at);
  elements.detailAuthor.textContent = record.author || 'Not listed';
  elements.detailId.textContent = record.identifier || 'Not listed';
  elements.detailSourceLink.href = record.url;
  elements.copyFeedback.textContent = '';
  elements.detailImageWrap.hidden = !imageUrl;
  elements.detailImageWrap.innerHTML = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(record.title || 'Article image')}" referrerpolicy="no-referrer" data-image-fallback data-fallback-image="${escapeHtml(fallbackImage)}">`
    : '';
  elements.dialog.hidden = false;
  document.body.style.overflow = 'hidden';
  elements.closeDialog.focus();
};

const closeDetails = () => {
  elements.dialog.hidden = true;
  document.body.style.overflow = '';
};

const findRecord = (identifier) => state.records.find((item) => (item.identifier || item.url) === identifier);

const switchView = (view) => {
  const isArchive = view === 'archive';
  const isCommunity = view === 'community';
  elements.archiveView.hidden = !isArchive;
  elements.communityView.hidden = !isCommunity;
  elements.joinView.hidden = view !== 'join';
  document.querySelectorAll('.nav-tab').forEach((tab) => {
    const isActive = tab.dataset.view === view;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });
};

const loadRecords = async () => {
  try {
    const response = await fetch('../data/records.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const records = await response.json();
    if (!Array.isArray(records)) throw new Error('Expected records.json to contain an array');
    const validRecords = records.filter((record) => record && typeof record === 'object' && record.url);
    elements.note.textContent = 'Detecting languages and translating the local index...';
    state.records = await translateRecords(validRecords);
    render();
  } catch (error) {
    elements.note.textContent = 'Run a local server, then reload the archive';
    elements.empty.querySelector('h2').textContent = 'Index could not be loaded';
    elements.empty.querySelector('p').textContent = 'Serve this folder locally so the browser can read data/records.json.';
    elements.empty.hidden = false;
    elements.grid.hidden = true;
    console.error(error);
  }
};

document.addEventListener('click', (event) => {
  const viewTab = event.target.closest('[data-view]');
  if (viewTab) {
    const nextView = viewTab.classList.contains('community-action') ? 'join' : viewTab.dataset.view;
    switchView(nextView);
    return;
  }
  const filter = event.target.closest('[data-filter]');
  if (filter) {
    document.querySelectorAll('.filter-button').forEach((button) => button.classList.remove('is-active'));
    document.querySelectorAll('.filter-button').forEach((button) => button.setAttribute('aria-selected', String(button === filter)));
    filter.classList.add('is-active');
    state.filter = filter.dataset.filter;
    moveFilterCursor(filter);
    render();
    return;
  }
  const openButton = event.target.closest('[data-record-id]');
  if (openButton) {
    const record = findRecord(openButton.dataset.recordId);
    openDetails(record);
  }
});

elements.grid.addEventListener('mouseover', (event) => {
  const panel = event.target.closest('.gallery-panel');
  if (panel) setExpandedPanel(Number(panel.dataset.galleryIndex));
});
elements.grid.addEventListener('focusin', (event) => {
  const panel = event.target.closest('.gallery-panel');
  if (panel) setExpandedPanel(Number(panel.dataset.galleryIndex));
});

document.addEventListener('error', (event) => {
  if (event.target.matches('[data-image-fallback]')) {
    const fallback = document.createElement('img');
    fallback.className = 'image-fallback';
    fallback.alt = event.target.alt;
    fallback.src = event.target.dataset.fallbackImage;
    event.target.replaceWith(fallback);
  }
}, true);

elements.search.addEventListener('input', (event) => {
  state.query = event.target.value;
  render();
});

elements.sort.addEventListener('change', (event) => {
  state.sort = event.target.value;
  render();
});

elements.clear.addEventListener('click', () => {
  state.query = '';
  state.filter = 'all';
  elements.search.value = '';
  document.querySelectorAll('.filter-button').forEach((button) => button.classList.toggle('is-active', button.dataset.filter === 'all'));
  document.querySelectorAll('.filter-button').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.filter === 'all')));
  resetFilterCursor();
  render();
  elements.search.focus();
});

elements.closeDialog.addEventListener('click', closeDetails);
elements.dialog.addEventListener('click', (event) => {
  if (event.target === elements.dialog) closeDetails();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !elements.dialog.hidden) closeDetails();
  if (event.key === 'Enter' && event.target.closest('.record-card')) {
    openDetails(findRecord(event.target.closest('.record-card').dataset.recordId));
  }
  if (event.key === '/' && document.activeElement !== elements.search) {
    event.preventDefault();
    elements.search.focus();
  }
});
elements.copyLink.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(elements.detailSourceLink.href);
    elements.copyFeedback.textContent = 'Link copied to clipboard';
  } catch {
    elements.copyFeedback.textContent = 'Copy unavailable in this browser';
  }
});

elements.detailSourceLink.addEventListener('click', () => {
  if (state.activeRecord) trackEngagement(state.activeRecord, 'clicks');
});

elements.joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  elements.joinFeedback.textContent = 'Sign-in request received. We will follow up by email.';
  elements.joinForm.reset();
});

elements.filterGroup.addEventListener('mouseover', (event) => {
  const button = event.target.closest('.filter-button');
  if (button) moveFilterCursor(button);
});
elements.filterGroup.addEventListener('mouseleave', resetFilterCursor);
window.addEventListener('resize', resetFilterCursor);

loadRecords();
resetFilterCursor();
