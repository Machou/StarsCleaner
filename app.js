// app.js
(() => {
	// ----------------------------------------
	// Configuration
	// ----------------------------------------
	const STORAGE_KEY = "starred_viewer_state_v1";
	const LANGUAGE_SLUGS_JSON_URL = "./assets/img/languages.json";
	const SIMPLE_ICONS_CDN = "https://cdn.simpleicons.org";

	// ----------------------------------------
	// Storage helpers
	// ----------------------------------------
	const loadState = () => {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			return raw ? JSON.parse(raw) : null;
		} catch {
			return null;
		}
	};

	const saveState = () => {
		const state = {
			lang: uiLang,
			theme: document.body.classList.contains("light") ? "light" : "dark",
			filters: {
				archivedOnly,
				searchQuery,
				languageFilter,
				createdYearFilter,
				activityYearFilter
			},
			sort: { ...sortState },
			hiddenRepos: Array.from(hiddenRepos)
		};

		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
		} catch {
			// ignore quota errors
		}
	};

	// ----------------------------------------
	// Data / State
	// ----------------------------------------
	const repos = (window.STARRED_REPOS || []).map((r) => ({ ...r }));
	const hiddenRepos = new Set(); // stored by full_name

	let archivedOnly = false;
	let searchQuery = "";
	let languageFilter = "__ALL__";
	let createdYearFilter = "__ALL__";
	let activityYearFilter = "__ALL__";

	let sortState = { key: "stars", dir: "desc" };
	let uiLang = "fr";

	// i18n dictionaries
	const dictionaries = {};

	// Language -> simpleicons slug map
	let languageSlugMap = {};

	// ----------------------------------------
	// Generic helpers
	// ----------------------------------------
	const escapeHtml = (str) => {
		if (!str) return "";
		return String(str)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	};

	const getYear = (iso) => {
		if (!iso) return null;
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return null;
		return d.getFullYear();
	};

	// French thousands grouping: 1 000 / 10 000 / 100 000
	const formatStars = (count) => {
		const n = Number(count || 0);
		if (Number.isNaN(n)) return "0";
		return n.toLocaleString("fr-FR");
	};

	// Requested date format: "8 dec. 2025" (no leading zero, no accents)
	const formatDate = (iso) => {
		if (!iso) return "";
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return iso;

		const day = d.getDate();
		const year = d.getFullYear();
		const months = [
			"janv.", "fevr.", "mars", "avr.", "mai", "juin",
			"juil.", "aout", "sept.", "oct.", "nov.", "dec."
		];
		return `${day} ${months[d.getMonth()] || ""} ${year}`;
	};

	// ----------------------------------------
	// i18n
	// ----------------------------------------
	const dictFor = (lang) => dictionaries[lang] || dictionaries["fr"] || {};
	const t = (key) => dictFor(uiLang)[key] ?? key;

	const loadLang = async (lang) => {
		if (dictionaries[lang]) return;
		const res = await fetch(`./locales/${lang}.json`);
		if (!res.ok) throw new Error(`Cannot load language: ${lang}`);
		dictionaries[lang] = await res.json();
	};

	const applyTranslations = () => {
		// Translate <title>
		const title = t("page_title");
		if (title && title !== "page_title") document.title = title;

		// Static labels
		document.querySelectorAll("[data-i18n]").forEach((el) => {
			const key = el.getAttribute("data-i18n");
			if (!key) return;
			el.textContent = t(key);
		});

		// Placeholders
		document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
			const key = el.getAttribute("data-i18n-placeholder");
			if (!key) return;
			el.setAttribute("placeholder", t(key));
		});

		// Theme button text (if button uses text)
		const themeBtn = document.getElementById("toggle-theme");
		if (themeBtn) {
			const isLight = document.body.classList.contains("light");
			themeBtn.textContent = isLight ? t("theme_button_dark") : t("theme_button_light");
		}
	};

	const setLanguage = async (lang) => {
		uiLang = lang;
		await loadLang(lang);
		applyTranslations();
		initLanguageFilterOptions();
		initYearFilterOptions();
		updateSortHeaderClasses();
		render();
		saveState();
	};

	// ----------------------------------------
	// Simple Icons CDN mapping
	// ----------------------------------------
	const loadLanguageSlugs = async () => {
		try {
			const res = await fetch(LANGUAGE_SLUGS_JSON_URL);
			if (!res.ok) throw new Error("languages.json not found");
			const json = await res.json();
			// Expect: { "Python": "python", ... }
			languageSlugMap = json && typeof json === "object" ? json : {};
		} catch (e) {
			console.warn("Language slugs not loaded:", e);
			languageSlugMap = {};
		}
	};

	// const toCdnIconUrl = (slug) => `${SIMPLE_ICONS_CDN}/${encodeURIComponent(slug)}`;

	// const getLanguageSlug = (language) => {
	// 	if (!language) return null;
	// 	const mapped = languageSlugMap[language];
	// 	if (typeof mapped === "string" && mapped.trim() !== "") return mapped.trim();
	// 	return DEFAULT_ICON_SLUG;
	// };

	const renderLanguageIcon = (language) => {
		if (!language) return "";

		const mapped = languageSlugMap[language];
		const hasSlug = typeof mapped === "string" && mapped.trim() !== "";

		// If no icon available → display language name as text
		if (!hasSlug) {
					return `
			<span class="lang-text" title="${escapeHtml(language)}">
				${escapeHtml(language)}
			</span>
			`;
		}

		// Icon via Simple Icons CDN
		const src = `https://cdn.simpleicons.org/${encodeURIComponent(mapped.trim())}`;

		return `
		<span class="lang-icon" title="${escapeHtml(language)}">
		<img
			src="${src}"
			alt="${escapeHtml(language)}"
			loading="lazy"
			referrerpolicy="no-referrer"
		>
		</span>
		`;
	};

	// ----------------------------------------
	// Filters
	// ----------------------------------------
	const passesFilters = (repo) => {
		if (hiddenRepos.has(repo.full_name)) return false;
		if (archivedOnly && !repo.archived) return false;

		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			const full = (repo.full_name || "").toLowerCase();
			const short = (repo.name || "").toLowerCase();
			if (!full.includes(q) && !short.includes(q)) return false;
		}

		if (languageFilter !== "__ALL__") {
			if (languageFilter === "__NONE__") {
				if (repo.language) return false;
			} else {
				if (repo.language !== languageFilter) return false;
			}
		}

		if (createdYearFilter !== "__ALL__") {
			const y = getYear(repo.created_at);
			if (!y || String(y) !== String(createdYearFilter)) return false;
		}

		if (activityYearFilter !== "__ALL__") {
			const y = getYear(repo.pushed_at);
			if (!y || String(y) !== String(activityYearFilter)) return false;
		}

		return true;
	};

	// ----------------------------------------
	// Sorting
	// ----------------------------------------
	const sortRepos = () => {
		const { key, dir } = sortState;
		const factor = dir === "asc" ? 1 : -1;

		repos.sort((a, b) => {
			let va;
			let vb;

			if (key === "stars") {
				va = a.stargazers_count || 0;
				vb = b.stargazers_count || 0;
			} else if (key === "name") {
				va = (a.full_name || "").toLowerCase();
				vb = (b.full_name || "").toLowerCase();
			} else if (key === "description") {
				va = (a.description || "").toLowerCase();
				vb = (b.description || "").toLowerCase();
			} else if (key === "language") {
				va = (a.language || "").toLowerCase();
				vb = (b.language || "").toLowerCase();
			} else if (key === "created") {
				va = new Date(a.created_at).getTime() || 0;
				vb = new Date(b.created_at).getTime() || 0;
			} else if (key === "pushed") {
				va = new Date(a.pushed_at).getTime() || 0;
				vb = new Date(b.pushed_at).getTime() || 0;
			} else {
				va = 0;
				vb = 0;
			}

			if (va < vb) return -1 * factor;
			if (va > vb) return 1 * factor;
			return 0;
		});
	};

	const updateSortHeaderClasses = () => {
		document.querySelectorAll("th[data-sort]").forEach((th) => {
			th.classList.remove("sorted-asc", "sorted-desc");
			if (th.dataset.sort === sortState.key) {
				th.classList.add(sortState.dir === "asc" ? "sorted-asc" : "sorted-desc");
			}
		});
	};

	// ----------------------------------------
	// Select options builders
	// ----------------------------------------
	const initLanguageFilterOptions = () => {
		const select = document.getElementById("filter-language");
		if (!select) return;

		const previous = languageFilter || select.value || "__ALL__";

		const set = new Set();
		repos.forEach((r) => {
			if (r.language) set.add(r.language);
		});

		const languages = [...set].sort((a, b) =>
			a.localeCompare(b, "fr", { sensitivity: "base" })
		);

		let options = `
      <option value="__ALL__">${escapeHtml(t("all_languages"))}</option>
      <option value="__NONE__">${escapeHtml(t("no_language"))}</option>
    `;

		languages.forEach((lang) => {
			options += `<option value="${escapeHtml(lang)}">${escapeHtml(lang)}</option>`;
		});

		select.innerHTML = options;

		if (["__ALL__", "__NONE__", ...languages].includes(previous)) {
			select.value = previous;
			languageFilter = previous;
		} else {
			select.value = "__ALL__";
			languageFilter = "__ALL__";
		}
	};

	const initYearFilterOptions = () => {
		const createdSelect = document.getElementById("filter-created-year");
		const activitySelect = document.getElementById("filter-activity-year");

		const createdYears = new Set();
		const activityYears = new Set();

		repos.forEach((r) => {
			const cy = getYear(r.created_at);
			const ay = getYear(r.pushed_at);
			if (cy) createdYears.add(cy);
			if (ay) activityYears.add(ay);
		});

		const createdList = [...createdYears].sort((a, b) => b - a);
		const activityList = [...activityYears].sort((a, b) => b - a);

		if (createdSelect) {
			const prev = createdYearFilter || createdSelect.value || "__ALL__";
			let opts = `<option value="__ALL__">${escapeHtml(t("all_created_years"))}</option>`;
			createdList.forEach((y) => (opts += `<option value="${y}">${y}</option>`));
			createdSelect.innerHTML = opts;

			createdYearFilter =
				prev === "__ALL__" || createdList.includes(Number(prev)) ? prev : "__ALL__";
			createdSelect.value = createdYearFilter;
		}

		if (activitySelect) {
			const prev = activityYearFilter || activitySelect.value || "__ALL__";
			let opts = `<option value="__ALL__">${escapeHtml(t("all_activity_years"))}</option>`;
			activityList.forEach((y) => (opts += `<option value="${y}">${y}</option>`));
			activitySelect.innerHTML = opts;

			activityYearFilter =
				prev === "__ALL__" || activityList.includes(Number(prev)) ? prev : "__ALL__";
			activitySelect.value = activityYearFilter;
		}
	};

	// ----------------------------------------
	// Rendering
	// ----------------------------------------
	const updateCount = () => {
		const el = document.getElementById("repo-count");
		if (!el) return;

		const total = repos.length;
		const visible = repos.filter(passesFilters).length;
		const label = total === 1 ? t("count_singular") : t("count_plural");
		el.textContent = `${visible} / ${total} ${label}`;
	};

	const render = () => {
		sortRepos();

		const tbody = document.getElementById("repo-body");
		if (!tbody) return;

		let html = "";

		repos.forEach((repo, index) => {
			if (!passesFilters(repo)) return;

			html += `
        <tr class="repo-row">
          <td>
            <a href="${repo.html_url}" target="_blank" rel="noopener noreferrer"
               class="repo-link" data-index="${index}">
              ${escapeHtml(repo.full_name)}
            </a>
          </td>
          <td class="description">${escapeHtml(repo.description || "")}</td>
          <td class="numeric">${renderLanguageIcon(repo.language)}</td>
          <td class="numeric">${formatStars(repo.stargazers_count)}</td>
          <td>${formatDate(repo.created_at)}</td>
          <td>${formatDate(repo.pushed_at)}</td>
          <td>${repo.archived ? `<span class="pill-archived">${escapeHtml(t("pill_archived"))}</span>` : ""}</td>
        </tr>
      `;
		});

		tbody.innerHTML = html;
		updateCount();
	};

	// ----------------------------------------
	// Reset
	// ----------------------------------------
	const resetAll = () => {
		archivedOnly = false;
		searchQuery = "";
		languageFilter = "__ALL__";
		createdYearFilter = "__ALL__";
		activityYearFilter = "__ALL__";

		hiddenRepos.clear();
		sortState = { key: "stars", dir: "desc" };

		const archivedEl = document.getElementById("toggle-archived");
		if (archivedEl) archivedEl.checked = false;

		const searchEl = document.getElementById("search-name");
		if (searchEl) searchEl.value = "";

		initLanguageFilterOptions();
		initYearFilterOptions();

		updateSortHeaderClasses();
		render();
		saveState();
	};

	// ----------------------------------------
	// Bootstrap
	// ----------------------------------------
	document.addEventListener("DOMContentLoaded", async () => {
		const saved = loadState();

		// Theme: default is light
		if (saved?.theme === "dark") {
			document.body.classList.remove("light");
		} else {
			document.body.classList.add("light");
		}

		// Locales
		const initialLang = saved?.lang || "fr";
		try {
			await loadLang("fr");
			if (initialLang !== "fr") await loadLang(initialLang);
			uiLang = initialLang;
			applyTranslations();
		} catch (e) {
			console.error("Locales load error:", e);
		}

		// Load language -> slug mapping
		await loadLanguageSlugs();

		// Restore filters/sort/hidden
		if (saved?.filters) {
			archivedOnly = !!saved.filters.archivedOnly;
			searchQuery = saved.filters.searchQuery || "";
			languageFilter = saved.filters.languageFilter || "__ALL__";
			createdYearFilter = saved.filters.createdYearFilter || "__ALL__";
			activityYearFilter = saved.filters.activityYearFilter || "__ALL__";
		}

		if (saved?.sort?.key && saved?.sort?.dir) {
			sortState = { key: saved.sort.key, dir: saved.sort.dir };
		}

		if (Array.isArray(saved?.hiddenRepos)) {
			saved.hiddenRepos.forEach((n) => hiddenRepos.add(n));
		}

		// Init selects
		initLanguageFilterOptions();
		initYearFilterOptions();

		// Set UI values
		const uiLangSelect = document.getElementById("lang-select");
		if (uiLangSelect) uiLangSelect.value = uiLang;

		const archivedEl = document.getElementById("toggle-archived");
		if (archivedEl) archivedEl.checked = archivedOnly;

		const searchEl = document.getElementById("search-name");
		if (searchEl) searchEl.value = searchQuery;

		const repoLangSelect = document.getElementById("filter-language");
		if (repoLangSelect) repoLangSelect.value = languageFilter;

		const createdSelect = document.getElementById("filter-created-year");
		if (createdSelect) createdSelect.value = createdYearFilter;

		const activitySelect = document.getElementById("filter-activity-year");
		if (activitySelect) activitySelect.value = activityYearFilter;

		updateSortHeaderClasses();
		render();
		saveState();

		// ----------------------------------------
		// Events
		// ----------------------------------------

		// Hide repo on click
		const tbody = document.getElementById("repo-body");
		if (tbody) {
			tbody.addEventListener("click", (event) => {
				const link = event.target.closest(".repo-link");
				if (!link) return;

				const index = Number(link.dataset.index);
				const repo = repos[index];
				if (!repo?.full_name) return;

				hiddenRepos.add(repo.full_name);
				render();
				saveState();
			});
		}

		// Archived only
		if (archivedEl) {
			archivedEl.addEventListener("change", () => {
				archivedOnly = archivedEl.checked;
				render();
				saveState();
			});
		}

		// Search
		if (searchEl) {
			searchEl.addEventListener("input", () => {
				searchQuery = searchEl.value.trim();
				render();
				saveState();
			});
		}

		// Repo language filter
		if (repoLangSelect) {
			repoLangSelect.addEventListener("change", () => {
				languageFilter = repoLangSelect.value;
				render();
				saveState();
			});
		}

		// Created year filter
		if (createdSelect) {
			createdSelect.addEventListener("change", () => {
				createdYearFilter = createdSelect.value;
				render();
				saveState();
			});
		}

		// Activity year filter
		if (activitySelect) {
			activitySelect.addEventListener("change", () => {
				activityYearFilter = activitySelect.value;
				render();
				saveState();
			});
		}

		// UI language selector
		if (uiLangSelect) {
			uiLangSelect.addEventListener("change", () => {
				setLanguage(uiLangSelect.value).catch((err) =>
					console.error("Language change error:", err)
				);
			});
		}

		// Theme toggle
		const themeBtn = document.getElementById("toggle-theme");
		if (themeBtn) {
			themeBtn.addEventListener("click", () => {
				document.body.classList.toggle("light");
				applyTranslations();
				saveState();
			});
		}

		// Reset filters
		const resetBtn = document.getElementById("reset-filters");
		if (resetBtn) {
			resetBtn.addEventListener("click", () => resetAll());
		}

		// Sorting via headers
		document.querySelectorAll("th[data-sort]").forEach((th) => {
			th.addEventListener("click", () => {
				const key = th.dataset.sort;
				if (!key) return;

				if (sortState.key === key) {
					sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
				} else {
					sortState.key = key;
					sortState.dir = key === "stars" ? "desc" : "asc";
				}

				updateSortHeaderClasses();
				render();
				saveState();
			});
		});
	});
})();