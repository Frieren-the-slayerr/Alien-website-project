const state = {
  records: [],
  filter: 'all',
  query: '',
  sort: 'newest',
};

const elements = {
  grid: document.querySelector('#record-grid'),
  empty: document.querySelector('#empty-state'),
  count: document.querySelector('#record-count'),
  note: document.querySelector('#results-note'),
  search: document.querySelector('#search-input'),
  sort: document.querySelector('#sort-select'),
  clear: document.querySelector('#clear-button'),
  status: document.querySelector('#sync-status'),
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
};

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;',
}[character]));

const formatDate = (value) => {
  if (!value) return 'Date unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en', {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(date);
};

const searchableText = (record) => [record.title, record.description, record.author, record.identifier]
  .filter(Boolean).join(' ').toLowerCase();

const getVisibleRecords = () => {
  const query = state.query.trim().toLowerCase();
  const filtered = state.records.filter((record) => {
    const matchesQuery = !query || searchableText(record).includes(query);
    const imageCount = Array.isArray(record.image_urls) ? record.image_urls.length : 0;
    const matchesFilter = state.filter === 'all'
      || (state.filter === 'images' && imageCount > 0)
      || (state.filter === 'text' && imageCount === 0);
    return matchesQuery && matchesFilter;
  });
  return filtered.sort((left, right) => {
    if (state.sort === 'title') return (left.title || '').localeCompare(right.title || '');
    const leftDate = left.published_at ? new Date(left.published_at).getTime() : 0;
    const rightDate = right.published_at ? new Date(right.published_at).getTime() : 0;
    return state.sort === 'oldest' ? leftDate - rightDate : rightDate - leftDate;
  });
};

const renderCard = (record, index) => {
  const imageUrl = Array.isArray(record.image_urls) && record.image_urls[0];
  const title = escapeHtml(record.title || 'Untitled record');
  const description = escapeHtml(record.description || 'No description was supplied with this record.');
  const image = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : '<div class="media-placeholder" aria-hidden="true">◌</div>';
  return `<article class="record-card" style="animation-delay: ${Math.min(index * 35, 350)}ms">
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
    : 'Select a record to inspect its source, notes, and images';
  elements.grid.innerHTML = visibleRecords.map(renderCard).join('');
  elements.empty.hidden = visibleRecords.length > 0;
  elements.grid.hidden = visibleRecords.length === 0;
};

const openDetails = (record) => {
  if (!record) return;
  const imageUrl = Array.isArray(record.image_urls) && record.image_urls[0];
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
    ? `<img src="${escapeHtml(imageUrl)}" alt="" referrerpolicy="no-referrer">`
    : '';
  elements.dialog.hidden = false;
  document.body.style.overflow = 'hidden';
  elements.closeDialog.focus();
};

const closeDetails = () => {
  elements.dialog.hidden = true;
  document.body.style.overflow = '';
};

const loadRecords = async () => {
  try {
    const response = await fetch('../data/records.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.records = await response.json();
    elements.status.textContent = 'LOCAL INDEX ONLINE';
    render();
  } catch (error) {
    elements.status.textContent = 'INDEX UNAVAILABLE';
    elements.note.textContent = 'Could not load data/records.json';
    elements.empty.hidden = false;
    elements.grid.hidden = true;
    console.error(error);
  }
};

document.addEventListener('click', (event) => {
  const filter = event.target.closest('[data-filter]');
  if (filter) {
    document.querySelectorAll('.filter-button').forEach((button) => button.classList.remove('is-active'));
    filter.classList.add('is-active');
    state.filter = filter.dataset.filter;
    render();
    return;
  }
  const openButton = event.target.closest('[data-record-id]');
  if (openButton) {
    const record = state.records.find((item) => (item.identifier || item.url) === openButton.dataset.recordId);
    openDetails(record);
  }
});

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
  render();
  elements.search.focus();
});

elements.closeDialog.addEventListener('click', closeDetails);
elements.dialog.addEventListener('click', (event) => {
  if (event.target === elements.dialog) closeDetails();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !elements.dialog.hidden) closeDetails();
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

loadRecords();
