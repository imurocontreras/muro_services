// blog.js

// ---------- helpers ----------

function getPlainText(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  const text = tmp.textContent || tmp.innerText || '';
  return text.replace(/\s+/g, ' ').trim();
}

// Turn HTML content into a text excerpt
function createExcerpt(html, maxLength = 220) {
  const cleaned = getPlainText(html);
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).trim() + '…';
}

// Escape HTML for small text fields (used before inserting into templates)
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Estimate reading time (in minutes) from HTML content
function estimateReadingTime(html) {
  const text = getPlainText(html);
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  if (!words) return '';
  const minutes = Math.max(1, Math.round(words / 220)); // ~220 wpm
  return `${minutes} min read`;
}

// Format Supabase timestamp/date string without timezone surprises
function formatSupabaseDate(value) {
  if (!value) return '';
  const str = String(value); // e.g. "2024-10-03T00:00:00+00:00" or "2024-10-03 00:00:00+00"
  // Always take the first 10 chars: "YYYY-MM-DD"
  const datePart = str.slice(0, 10);
  const [yearStr, monthStr, dayStr] = datePart.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (!year || !month || !day) return '';

  const dt = new Date(year, month - 1, day);
  if (Number.isNaN(dt.getTime())) return '';

  return dt.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ---------- global state ----------

let allPosts = [];
let selectedCategory = 'all';  // 'all' or specific category name
let selectedTag = null;        // null or specific tag string
let searchQuery = '';          // free-text search

// ---------- filtering ----------

function passesFilters(post) {
  const category = (post.category || '').toLowerCase();
  const tags = Array.isArray(post.tags)
    ? post.tags.map(t => String(t).toLowerCase())
    : [];

  // category filter
  if (selectedCategory && selectedCategory !== 'all') {
    if (category !== selectedCategory.toLowerCase()) return false;
  }

  // tag filter
  if (selectedTag) {
    if (!tags.includes(selectedTag.toLowerCase())) return false;
  }

  // search filter
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    const haystack =
      ((post.title || '') + ' ' + getPlainText(post.content || '')).toLowerCase();
    if (!haystack.includes(q)) return false;
  }

  return true;
}

// ---------- filter button styling (high contrast) ----------

function updateFilterButtonStates() {
  const categoryButtons = document.querySelectorAll('[data-category-filter]');
  const tagButtons = document.querySelectorAll('[data-tag-filter]');

  const baseCategoryClasses =
    'inline-flex items-center px-3 py-1.5 rounded-full border text-xs font-semibold transition';
  const activeCategoryClasses = ' bg-primary text-paper border-primary shadow-sm';
  const inactiveCategoryClasses = ' bg-paper border-dark-brown/30 text-dark-brown';

  categoryButtons.forEach(btn => {
    const value = (btn.getAttribute('data-category-filter') || 'all').toLowerCase();
    const isActive =
      (selectedCategory === 'all' && (value === 'all' || value === '')) ||
      (selectedCategory !== 'all' && value === selectedCategory.toLowerCase());

    btn.className = baseCategoryClasses + (isActive ? activeCategoryClasses : inactiveCategoryClasses);
  });

  const baseTagClasses =
    'inline-flex items-center px-3 py-1.5 rounded-full border text-[0.7rem] font-semibold transition';
  const activeTagClasses = ' bg-primary text-paper border-primary shadow-sm';
  const inactiveTagClasses = ' bg-paper border-dark-brown/30 text-dark-brown';

  tagButtons.forEach(btn => {
    const value = (btn.getAttribute('data-tag-filter') || '').toLowerCase();
    const isActive = selectedTag && value === selectedTag.toLowerCase();

    btn.className = baseTagClasses + (isActive ? activeTagClasses : inactiveTagClasses);
  });
}

// ---------- related posts ----------

function getRelatedPosts(currentPost, max = 3) {
  if (!allPosts?.length) return [];

  const currentTags = Array.isArray(currentPost.tags)
    ? currentPost.tags.map(t => String(t).toLowerCase())
    : [];
  const currentCategory = (currentPost.category || '').toLowerCase();

  const scored = allPosts
    .filter(p => p.slug !== currentPost.slug)
    .map(p => {
      const pTags = Array.isArray(p.tags)
        ? p.tags.map(t => String(t).toLowerCase())
        : [];
      const pCategory = (p.category || '').toLowerCase();

      const sharedTags = currentTags.filter(t => pTags.includes(t));
      const sharedTagCount = sharedTags.length;

      let score = sharedTagCount * 2; // tags matter most
      if (currentCategory && pCategory === currentCategory) {
        score += 1; // small bump for same category
      }

      return { post: p, score };
    })
    .filter(item => item.score > 0);

  if (scored.length) {
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, max)
      .map(item => item.post);
  }

  // Fallback: just pick latest other posts
  return allPosts
    .filter(p => p.slug !== currentPost.slug)
    .slice(0, max);
}

// ---------- modal ----------

function openBlogModal(post, meta) {
  const modal = document.getElementById('blog-modal');
  const content = document.getElementById('blog-modal-content');
  if (!modal || !content) return;

  const dateText = meta?.date || '';
  const readTimeText = meta?.readTime || '';
  const categoryText = post.category || 'Insight';

  const tags = Array.isArray(post.tags) ? post.tags.filter(Boolean) : [];
  const related = getRelatedPosts(post, 3);
  const slugParam = post.slug ? encodeURIComponent(post.slug) : null;

  const tagsHtml = tags.length
    ? `<p class="text-[0.72rem] text-dark-grey mb-1">
         ${tags.map(t => `<span class="inline-block mr-1">#${t}</span>`).join('')}
       </p>`
    : '';

  // Render and sanitize the post content (Markdown -> HTML)
  const rawContent = post.content || '';
  let renderedContent = rawContent;
  try {
    if (typeof marked !== 'undefined' && rawContent) {
      renderedContent = marked.parse(rawContent);
    }
  } catch (e) {
    console.warn('marked.parse error', e);
    renderedContent = rawContent;
  }

  try {
    if (typeof DOMPurify !== 'undefined') {
      renderedContent = DOMPurify.sanitize(renderedContent);
    }
  } catch (e) {
    console.warn('DOMPurify.sanitize error', e);
  }

  const authorHtml = post.author ? `<p class="text-sm text-dark-grey/80 mt-4 text-right">By ${escapeHtml(post.author)}</p>` : '';
  const dateHtml = dateText ? `<p class="text-xs text-dark-grey/70 mt-1 text-right">${escapeHtml(dateText)}</p>` : '';

  const openInNewPageHtml = slugParam
    ? `
      <div class="mt-3 mb-4">
        <a
          href="post.html?slug=${slugParam}"
          class="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-accent underline underline-offset-2"
        >
          <span>Open this insight in a new page</span>
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M14 3h7m0 0v7m0-7L10 14" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M5 5v14h14" />
          </svg>
        </a>
      </div>
    `
    : '';

  const relatedHtml = related.length
    ? `
      <div class="mt-8 pt-5 border-t border-dark-brown/15">
        <h3 class="text-sm font-semibold text-dark-brown mb-3">
          Related insights
        </h3>
        <div class="space-y-2">
          ${related
            .map(r => {
              const rDate = formatSupabaseDate(r.published_at);
              return `
                <button
                  type="button"
                  class="w-full text-left text-sm text-primary hover:text-accent underline-offset-2 hover:underline flex flex-col"
                  data-rel-slug="${r.slug}"
                >
                  <span class="font-semibold">${r.title}</span>
                  <span class="text-[0.7rem] text-dark-grey">${rDate}</span>
                </button>
              `;
            })
            .join('')}
        </div>
      </div>
    `
    : '';

  content.innerHTML = `
    <div class="mb-3">
      <p class="text-[0.72rem] font-semibold tracking-[0.16em] uppercase text-primary mb-1">
        ${escapeHtml(categoryText)}
      </p>
      ${tagsHtml}
    </div>
    <h2 id="blog-modal-title" class="text-2xl md:text-3xl font-semibold mb-1 text-dark-brown">
      ${escapeHtml(post.title)}
    </h2>
    <p class="text-xs md:text-sm text-dark-grey">
      ${readTimeText || ''}
    </p>
    ${openInNewPageHtml}
    <div class="prose max-w-none text-[0.95rem] leading-relaxed text-dark-grey">
      ${renderedContent}
    </div>
    <div class="mt-4">
      ${authorHtml}
      ${dateHtml}
    </div>
    ${relatedHtml}
  `;

  // attach click handlers for related items
  if (related.length) {
    content.querySelectorAll('[data-rel-slug]').forEach(btn => {
      const slug = btn.getAttribute('data-rel-slug');
      const relatedPost = allPosts.find(p => p.slug === slug);
      if (!relatedPost) return;

      btn.addEventListener('click', () => {
        const rDate = formatSupabaseDate(relatedPost.published_at);
        const rReadTime = estimateReadingTime(relatedPost.content || '');
        openBlogModal(relatedPost, { date: rDate, readTime: rReadTime });
      });
    });
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.body.classList.add('no-scroll');
}

function closeBlogModal() {
  const modal = document.getElementById('blog-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  document.body.classList.remove('no-scroll');
}

// ---------- filters UI (dynamic buttons) ----------

function buildFilterButtons() {
  const categoryContainer = document.getElementById('category-filters');
  const tagContainer = document.getElementById('tag-filters');
  if (!categoryContainer || !tagContainer) return;

  const categorySet = new Set();
  const tagSet = new Set();

  allPosts.forEach(post => {
    if (post.category) categorySet.add(post.category);
    if (Array.isArray(post.tags)) {
      post.tags.filter(Boolean).forEach(t => tagSet.add(t));
    }
  });

  // Categories
  categoryContainer.innerHTML = '';
  const categories = Array.from(categorySet).sort((a, b) =>
    a.localeCompare(b)
  );

  // "All insights" button
  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.textContent = 'All insights';
  allBtn.setAttribute('data-category-filter', 'all');
  allBtn.className =
    'inline-flex items-center px-3 py-1.5 rounded-full border text-xs font-semibold transition';
  allBtn.addEventListener('click', (e) => {
    e.preventDefault();
    selectedCategory = 'all';
    selectedTag = null;
    updateFilterButtonStates();
    renderPosts();
  });
  categoryContainer.appendChild(allBtn);

  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = cat;
    btn.setAttribute('data-category-filter', cat);
    btn.className =
      'inline-flex items-center px-3 py-1.5 rounded-full border text-xs font-semibold transition';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      selectedCategory = cat;
      selectedTag = null;
      updateFilterButtonStates();
      renderPosts();
    });
    categoryContainer.appendChild(btn);
  });

  // Tags
  tagContainer.innerHTML = '';
  const tags = Array.from(tagSet).sort((a, b) =>
    a.localeCompare(b)
  );

  if (!tags.length) {
    tagContainer.innerHTML = `
      <p class="text-[0.78rem] text-dark-grey/80">
        No topics yet. Add tags to posts in Supabase to enable topic filters.
      </p>`;
  } else {
    tags.forEach(tag => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = tag;
      btn.setAttribute('data-tag-filter', tag);
      btn.className =
        'inline-flex items-center px-3 py-1.5 rounded-full border text-[0.7rem] font-semibold transition';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const current = selectedTag ? selectedTag.toLowerCase() : null;
        const value = tag.toLowerCase();
        selectedTag = current === value ? null : tag; // toggle
        updateFilterButtonStates();
        renderPosts();
      });
      tagContainer.appendChild(btn);
    });
  }

  updateFilterButtonStates();
}

// ---------- rendering posts ----------

function renderPosts() {
  const container = document.getElementById('blog-posts');
  const loading = document.getElementById('blog-loading');
  const errorEl = document.getElementById('blog-error');

  if (!container) return;

  if (loading) loading.classList.add('hidden');
  if (errorEl) errorEl.classList.add('hidden');

  container.innerHTML = '';

  const visible = allPosts.filter(passesFilters);

  if (!visible.length) {
    container.innerHTML =
      '<p class="text-sm text-dark-grey">No insights match your filters yet.</p>';
    return;
  }

  visible.forEach((post) => {
    const wrapper = document.createElement('article');
    wrapper.className =
      'bg-white rounded-2xl border border-dark-brown/15 shadow-card/40 p-5 ' +
      'flex flex-col h-full cursor-pointer transition hover:-translate-y-0.5 ' +
      'hover:shadow-lg focus-within:-translate-y-0.5 focus-within:shadow-lg outline-none';

    const date = formatSupabaseDate(post.published_at);
    const excerpt = createExcerpt(post.content || '');
    const readTime = estimateReadingTime(post.content || '');
    const categoryLabel = post.category || 'Insight';
    const tags = Array.isArray(post.tags) ? post.tags.filter(Boolean) : [];
    // In grid (cards) we hide author — author is shown only in modal/single post view.
    const authorLine = '';

    wrapper.innerHTML = `
      <div class="flex flex-col h-full">
          <div class="mb-3">
          <span class="inline-flex items-center px-2.5 py-1 rounded-full bg-primary/10 border border-primary/40 text-[0.7rem] font-semibold tracking-[0.14em] uppercase text-primary">
            ${escapeHtml(categoryLabel)}
          </span>
        </div>

        <h2 class="text-lg md:text-xl font-semibold mb-1 text-dark-brown">
          ${escapeHtml(post.title)}
        </h2>

        <p class="text-[0.75rem] text-dark-grey mb-2">
          ${[date, readTime].filter(Boolean).join(' • ')}
        </p>

        ${
          tags.length
            ? `<p class="text-[0.7rem] text-dark-grey/90 mb-2">
                 ${tags.map(t => `<span class="inline-block mr-1">#${t}</span>`).join('')}
               </p>`
            : ''
        }

        <p class="text-sm text-dark-grey/95 flex-1">
          ${excerpt}
        </p>

        ${authorLine}

        <p class="mt-3 text-[0.72rem] uppercase tracking-[0.16em] text-primary font-semibold">
          Open full insight
        </p>
      </div>
    `;

    wrapper.addEventListener('click', () => {
      const dateMeta = date;
      const readTimeMeta = readTime;
      openBlogModal(post, { date: dateMeta, readTime: readTimeMeta });
    });

    wrapper.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const dateMeta = date;
        const readTimeMeta = readTime;
        openBlogModal(post, { date: dateMeta, readTime: readTimeMeta });
      }
    });

    container.appendChild(wrapper);
  });
}

// ---------- data load ----------

async function loadPosts() {
  const loading = document.getElementById('blog-loading');
  const errorEl = document.getElementById('blog-error');

  if (loading) {
    loading.classList.remove('hidden');
  }
  if (errorEl) {
    errorEl.classList.add('hidden');
  }

  try {
    const { data, error } = await window.supabaseClient
      .from('posts')
      .select('title, slug, content, published_at, category, tags, author, is_published')
      .eq('is_published', true)
      .order('published_at', { ascending: false });

    if (error) {
      console.error(error);
      if (errorEl) {
        errorEl.textContent =
          'Unable to load insights right now. Please try again later.';
        errorEl.classList.remove('hidden');
      }
      if (loading) loading.classList.add('hidden');
      return;
    }

    allPosts = Array.isArray(data) ? data : [];

    if (loading) loading.classList.add('hidden');

    buildFilterButtons();
    renderPosts();
  } catch (err) {
    console.error(err);
    if (loading) loading.classList.add('hidden');
    if (errorEl) {
      errorEl.textContent =
        'Something went wrong while loading insights.';
      errorEl.classList.remove('hidden');
    }
  }
}

// ---------- init ----------

document.addEventListener('DOMContentLoaded', () => {
  loadPosts();

  const backdrop = document.getElementById('blog-modal-backdrop');
  const closeBtn = document.getElementById('blog-modal-close');

  if (backdrop) {
    backdrop.addEventListener('click', closeBlogModal);
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', closeBlogModal);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeBlogModal();
    }
  });

  // search input
  const searchInput = document.getElementById('blog-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value || '';
      renderPosts();
    });
  }
});
