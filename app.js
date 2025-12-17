// app.js
(function () {
	// ------------------------------
	//  Storage keys
	// ------------------------------
	const STORAGE_KEY = "starred_viewer_state_v1";

	function loadState() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return null;
			return JSON.parse(raw);
		} catch {
			return null;
		}
	}

	function saveState() {
		const state = {
			// UI
			lang: currentLang,
			theme: document.body.classList.contains("light") ? "light" : "dark",

			// Filters
			showArchivedOnly,
			searchQuery,
			languageFilter,
			createdYearFilter,
			activityYearFilter,

			// Sorting
			sort: currentSort,

			// Hidden repos (store by full_name to be stable)
			hiddenRepos: Array.from(hiddenReposSet)
		};

		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
		} catch {
			// ignore quota errors
		}
	}

	// ------------------------------
	//  State
	// ------------------------------
	let repos = (window.STARRED_REPOS || []).map((r) => ({ ...r }));

	let currentSort = { key: "stars", dir: "desc" };
	let showArchivedOnly = false;
	let searchQuery = "";
	let languageFilter = "__ALL__";
	let createdYearFilter = "__ALL__";
	let activityYearFilter = "__ALL__";
	let currentLang = "fr";

	// Hidden repos are stored by repo.full_name
	const hiddenReposSet = new Set();

	// Cache of loaded translation dictionaries
	const dictionaries = {};

	// ------------------------------
	//  Translation helpers
	// ------------------------------
	function getDict(lang) {
		return dictionaries[lang || currentLang] || dictionaries["fr"] || {};
	}

	function t(key) {
		const dict = getDict();
		return dict[key] ?? key;
	}

	async function loadLang(lang) {
		if (dictionaries[lang]) return;
		const res = await fetch(`./locales/${lang}.json`);
		if (!res.ok) throw new Error(`Cannot load language: ${lang}`);
		dictionaries[lang] = await res.json();
	}

	async function setLanguage(lang) {
		currentLang = lang;
		await loadLang(lang);
		applyTranslations();
		initLanguageFilterOptions();
		initYearFilterOptions();
		updateSortHeaderClasses();
		render();
		saveState();
	}

	// ------------------------------
	//  Formatting helpers
	// ------------------------------
	function formatStars(count) {
		const n = Number(count || 0);
		if (Number.isNaN(n)) return "0";
		// French thousands grouping: 1 000 / 10 000 / 100 000
		return n.toLocaleString("fr-FR");
	}

	function formatDate(iso) {
		if (!iso) return "";
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return iso;

		const day = d.getDate(); // no leading zero
		const year = d.getFullYear();

		// ASCII month abbreviations (no accents), as requested: "dec." not "déc."
		const months = ["janv.", "fevr.", "mars", "avr.", "mai", "juin", "juil.", "aout", "sept.", "oct.", "nov.", "dec."];
		const month = months[d.getMonth()] || "";
		return `${day} ${month} ${year}`;
	}

	function getYear(iso) {
		if (!iso) return null;
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return null;
		return d.getFullYear();
	}

	function escapeHtml(str) {
		if (!str) return "";
		return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	}

	// ------------------------------
	//  Filtering predicate
	// ------------------------------
	function passesFilters(repo) {
		// Apply hidden repos from set
		if (hiddenReposSet.has(repo.full_name)) return false;

		if (showArchivedOnly && !repo.archived) return false;

		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			const name = (repo.full_name || "").toLowerCase();
			const shortName = (repo.name || "").toLowerCase();
			if (!name.includes(q) && !shortName.includes(q)) return false;
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
	}

	// ------------------------------
	//  Count visible repositories
	// ------------------------------
	function updateCount() {
		const el = document.getElementById("repo-count");
		if (!el) return;

		const total = repos.length;
		const visibles = repos.filter(passesFilters).length;

		const label = total === 1 ? t("count_singular") : t("count_plural");
		el.textContent = `${visibles} / ${total} ${label}`;
	}

	// ------------------------------
	//  Sorting
	// ------------------------------
	function sortRepos() {
		const { key, dir } = currentSort;
		const factor = dir === "asc" ? 1 : -1;

		repos.sort((a, b) => {
			let va, vb;

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
	}

	// ------------------------------
	//  Rendering table
	// ------------------------------
	function render() {
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
               data-index="${index}" class="repo-link">
              ${escapeHtml(repo.full_name)}
            </a>
          </td>
          <td class="description">${escapeHtml(repo.description || "")}</td>
          <td>${escapeHtml(repo.language || "")}</td>
          <td class="numeric">${formatStars(repo.stargazers_count)}</td>
          <td>${formatDate(repo.created_at)}</td>
          <td>${formatDate(repo.pushed_at)}</td>
          <td>${repo.archived ? `<span class="pill-archived">${escapeHtml(t("pill_archived"))}</span>` : ""}</td>
        </tr>
      `;
		});

		tbody.innerHTML = html;
		updateCount();
	}

	// ------------------------------
	//  Repo language filter options (PHP, Rust…)
	// ------------------------------
	function initLanguageFilterOptions() {
		const select = document.getElementById("filter-language");
		if (!select) return;

		const previous = languageFilter || select.value || "__ALL__";

		const set = new Set();
		repos.forEach((r) => {
			if (r.language) set.add(r.language);
		});

		const languages = [...set].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));

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
	}

	// ------------------------------
	//  Year filter options
	// ------------------------------
	function initYearFilterOptions() {
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
			createdList.forEach((y) => { opts += `<option value="${y}">${y}</option>`; });
			createdSelect.innerHTML = opts;

			if (prev === "__ALL__" || createdList.includes(Number(prev))) {
				createdSelect.value = prev;
				createdYearFilter = prev;
			} else {
				createdSelect.value = "__ALL__";
				createdYearFilter = "__ALL__";
			}
		}

		if (activitySelect) {
			const prev = activityYearFilter || activitySelect.value || "__ALL__";
			let opts = `<option value="__ALL__">${escapeHtml(t("all_activity_years"))}</option>`;
			activityList.forEach((y) => { opts += `<option value="${y}">${y}</option>`; });
			activitySelect.innerHTML = opts;

			if (prev === "__ALL__" || activityList.includes(Number(prev))) {
				activitySelect.value = prev;
				activityYearFilter = prev;
			} else {
				activitySelect.value = "__ALL__";
				activityYearFilter = "__ALL__";
			}
		}
	}

	// ------------------------------
	//  Apply translations
	// ------------------------------
	function applyTranslations() {
		// Translate the <title>
		const pageTitle = t("page_title");
		if (pageTitle && pageTitle !== "page_title") {
			document.title = pageTitle;
		}

		document.querySelectorAll("[data-i18n]").forEach((el) => {
			const key = el.getAttribute("data-i18n");
			if (!key) return;
			el.textContent = t(key);

		});

		document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
			const key = el.getAttribute("data-i18n-placeholder");
			if (!key) return;
			el.setAttribute("placeholder", t(key));
		});

		const themeBtn = document.getElementById("toggle-theme");
		if (themeBtn) {
			const isLight = document.body.classList.contains("light");
			themeBtn.textContent = isLight ? t("theme_button_dark") : t("theme_button_light");
		}
	}

	// ------------------------------
	//  Sort header classes
	// ------------------------------
	function updateSortHeaderClasses() {
		document.querySelectorAll("th[data-sort]").forEach((el) => {
			el.classList.remove("sorted-asc", "sorted-desc");
			if (el.dataset.sort === currentSort.key) {
				el.classList.add(currentSort.dir === "asc" ? "sorted-asc" : "sorted-desc");
			}
		});
	}

	// ------------------------------
	//  Reset all filters + hidden repos + sort
	// ------------------------------
	function resetAll() {
		showArchivedOnly = false;
		searchQuery = "";
		languageFilter = "__ALL__";
		createdYearFilter = "__ALL__";
		activityYearFilter = "__ALL__";

		hiddenReposSet.clear();

		currentSort = { key: "stars", dir: "desc" };

		// Update UI controls
		const archivedEl = document.getElementById("toggle-archived");
		if (archivedEl) archivedEl.checked = false;

		const searchEl = document.getElementById("search-name");
		if (searchEl) searchEl.value = "";

		const langEl = document.getElementById("filter-language");
		if (langEl) langEl.value = "__ALL__";

		const createdEl = document.getElementById("filter-created-year");
		if (createdEl) createdEl.value = "__ALL__";

		const activityEl = document.getElementById("filter-activity-year");
		if (activityEl) activityEl.value = "__ALL__";

		initLanguageFilterOptions();
		initYearFilterOptions();
		updateSortHeaderClasses();
		render();
		saveState();
	}

	// ------------------------------
	//  Initialization
	// ------------------------------
	document.addEventListener("DOMContentLoaded", async () => {
		const tbody = document.getElementById("repo-body");
		const toggleArchived = document.getElementById("toggle-archived");
		const toggleTheme = document.getElementById("toggle-theme");
		const resetBtn = document.getElementById("reset-filters");
		const searchInput = document.getElementById("search-name");
		const uiLangSelect = document.getElementById("lang-select");

		// Load saved state (if any)
		const saved = loadState();

		// Default theme is light in your project
		// If saved theme exists, apply it.
		if (saved?.theme === "light") {
			document.body.classList.add("light");
		} else if (saved?.theme === "dark") {
			document.body.classList.remove("light");
		}

		// Load default language or saved language
		const initialLang = saved?.lang || "fr";
		try {
			await loadLang("fr");
			await loadLang(initialLang);
			currentLang = initialLang;
			applyTranslations();
		} catch (e) {
			console.error("Failed to load locales:", e);
		}

		// Apply saved filters/sort/hidden
		if (saved) {
			showArchivedOnly = !!saved.showArchivedOnly;
			searchQuery = saved.searchQuery || "";
			languageFilter = saved.languageFilter || "__ALL__";
			createdYearFilter = saved.createdYearFilter || "__ALL__";
			activityYearFilter = saved.activityYearFilter || "__ALL__";

			if (saved.sort?.key && saved.sort?.dir) {
				currentSort = saved.sort;
			}

			if (Array.isArray(saved.hiddenRepos)) {
				saved.hiddenRepos.forEach((n) => hiddenReposSet.add(n));
			}
		}

		// Init UI controls values from state
		if (toggleArchived) toggleArchived.checked = showArchivedOnly;
		if (searchInput) searchInput.value = searchQuery;

		if (uiLangSelect) {
			uiLangSelect.value = currentLang;
		}

		// Init options selects
		initLanguageFilterOptions();
		initYearFilterOptions();

		// Set selected values after options are built
		const repoLangSelect = document.getElementById("filter-language");
		if (repoLangSelect) repoLangSelect.value = languageFilter;

		const createdYearSelect = document.getElementById("filter-created-year");
		if (createdYearSelect) createdYearSelect.value = createdYearFilter;

		const activityYearSelect = document.getElementById("filter-activity-year");
		if (activityYearSelect) activityYearSelect.value = activityYearFilter;

		// Update sort header classes
		updateSortHeaderClasses();

		// Initial render
		render();
		saveState();

		// ------------------------------
		//  Events
		// ------------------------------

		// Hide repo on click + save
		if (tbody) {
			tbody.addEventListener("click", (event) => {
				const link = event.target.closest(".repo-link");
				if (!link) return;

				const index = Number(link.dataset.index);
				if (!Number.isNaN(index) && repos[index]) {
					const name = repos[index].full_name;
					if (name) hiddenReposSet.add(name);
					render();
					saveState();
				}
			});
		}

		// Archived filter
		if (toggleArchived) {
			toggleArchived.addEventListener("change", () => {
				showArchivedOnly = toggleArchived.checked;
				render();
				saveState();
			});
		}

		// Search filter
		if (searchInput) {
			searchInput.addEventListener("input", () => {
				searchQuery = searchInput.value.trim();
				render();
				saveState();
			});
		}

		// Repo language filter (PHP/Rust/etc.)
		if (repoLangSelect) {
			repoLangSelect.addEventListener("change", () => {
				languageFilter = repoLangSelect.value;
				render();
				saveState();
			});
		}

		// Created year filter
		if (createdYearSelect) {
			createdYearSelect.addEventListener("change", () => {
				createdYearFilter = createdYearSelect.value;
				render();
				saveState();
			});
		}

		// Activity year filter
		if (activityYearSelect) {
			activityYearSelect.addEventListener("change", () => {
				activityYearFilter = activityYearSelect.value;
				render();
				saveState();
			});
		}

		// UI language selector (FR/EN/ES)
		if (uiLangSelect) {
			uiLangSelect.addEventListener("change", () => {
				setLanguage(uiLangSelect.value).catch((err) => console.error("Language change failed:", err));
			});
		}

		// Theme toggle + save
		if (toggleTheme) {
			toggleTheme.addEventListener("click", () => {
				const isLight = document.body.classList.toggle("light");
				toggleTheme.textContent = isLight ? t("theme_button_dark") : t("theme_button_light");
				saveState();
			});
		}

		// Reset filters button
		if (resetBtn) {
			resetBtn.addEventListener("click", () => {
				resetAll();
			});
		}

		// Table header sort + save
		document.querySelectorAll("th[data-sort]").forEach((th) => {
			th.addEventListener("click", () => {
				const key = th.dataset.sort;
				if (!key) return;

				if (currentSort.key === key) {
					currentSort.dir = currentSort.dir === "asc" ? "desc" : "asc";
				} else {
					currentSort.key = key;
					currentSort.dir = key === "stars" ? "desc" : "asc";
				}

				updateSortHeaderClasses();
				render();
				saveState();
			});
		});
	});
})();