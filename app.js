(() => {
    const STORAGE_KEY = "starred_viewer_state_v1";
    const LANGUAGE_SLUGS_JSON_URL = "./assets/img/languages.json";
    const SIMPLE_ICONS_CDN = "https://cdn.simpleicons.org";

    const VIRTUAL_BUFFER_ROWS = 10;
    const DEFAULT_ROW_HEIGHT = 46;

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
        } catch { }
    };

    const repos = (window.STARRED_REPOS || []).map((r) => ({ ...r }));
    const hiddenRepos = new Set();

    let archivedOnly = false;
    let searchQuery = "";
    let languageFilter = "__ALL__";
    let createdYearFilter = "__ALL__";
    let activityYearFilter = "__ALL__";

    let sortState = { key: "stars", dir: "desc" };
    let uiLang = "fr";

    const dictionaries = {};

    let languageSlugMap = {};

    let tableWrapperEl = null;
    let tbodyEl = null;
    let colCount = 7;
    let rowHeight = DEFAULT_ROW_HEIGHT;
    let viewRepos = [];
    let rafScheduled = false;

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

    const formatStars = (count) => {
        const n = Number(count || 0);
        if (Number.isNaN(n)) return "0";
        return n.toLocaleString("fr-FR");
    };

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

    const dictFor = (lang) => dictionaries[lang] || dictionaries["fr"] || {};
    const t = (key) => dictFor(uiLang)[key] ?? key;

    const loadLang = async (lang) => {
        if (dictionaries[lang]) return;
        const res = await fetch(`./locales/${lang}.json`);
        if (!res.ok) throw new Error(`Cannot load language: ${lang}`);
        dictionaries[lang] = await res.json();
    };

    const applyTranslations = () => {
        const title = t("page_title");
        if (title && title !== "page_title") document.title = title;

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
    };

    const setLanguage = async (lang) => {
        uiLang = lang;
        await loadLang(lang);

        applyTranslations();
        initLanguageFilterOptions();
        initYearFilterOptions();
        updateSortHeaderClasses();

        rebuildViewAndRender(true);
        saveState();
    };

    // Simple Icons
    const loadLanguageSlugs = async () => {
        try {
            const res = await fetch(LANGUAGE_SLUGS_JSON_URL);
            if (!res.ok) throw new Error("languages.json not found");

            const json = await res.json();

            languageSlugMap = json && typeof json === "object" ? json : {};
        } catch (e) {
            console.warn("Language slugs not loaded:", e);
            languageSlugMap = {};
        }
    };

    const renderLanguageCell = (language) => {
        if (!language) {
            return `
            <span class="lang-na" title="${escapeHtml(t("lang_none_title"))}">
                ${escapeHtml(t("lang_na"))}
            </span>
            `;
        }

        const mapped = languageSlugMap[language];
        const hasSlug = typeof mapped === "string" && mapped.trim() !== "";

        if (!hasSlug) {
            return `
                <span class="lang-text" title="${escapeHtml(language)}">
                    ${escapeHtml(language)}
                </span>
            `;
        }

        const src = `${SIMPLE_ICONS_CDN}/${encodeURIComponent(mapped.trim())}`;

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

    const sortInPlace = (arr) => {
        const { key, dir } = sortState;
        const factor = dir === "asc" ? 1 : -1;

        arr.sort((a, b) => {
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

    const updateCount = () => {
        const el = document.getElementById("repo-count");
        if (!el) return;

        const total = repos.length;
        const visible = viewRepos.length;
        const label = total === 1 ? t("count_singular") : t("count_plural");
        el.textContent = `${visible} / ${total} ${label}`;
    };

    const measureRowHeightIfNeeded = () => {
        if (!tbodyEl) return;
        const firstRealRow = tbodyEl.querySelector("tr[data-row='item']");
        if (!firstRealRow) return;

        const rect = firstRealRow.getBoundingClientRect();
        const h = Math.round(rect.height);
        if (h && h > 20 && h < 200) rowHeight = h;
    };

    const buildRowHtml = (repo) => {
        const archivedPill = repo.archived
            ? `<span class="pill-archived">${escapeHtml(t("pill_archived"))}</span>`
            : "";

        return `
            <tr class="repo-row" data-row="item">
                <td>
                    <a
                        href="${repo.html_url}"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="repo-link"
                        data-fullname="${escapeHtml(repo.full_name)}"
                    >
                        ${escapeHtml(repo.full_name)}
                    </a>
                </td>
                <td class="description">${escapeHtml(repo.description || "")}</td>
                <td class="text-center">${renderLanguageCell(repo.language)}</td>
                <td class="numeric">${formatStars(repo.stargazers_count)}</td>
                <td class="text-center">${formatDate(repo.created_at)}</td>
                <td class="text-center">${formatDate(repo.pushed_at)}</td>
                <td class="text-center">${archivedPill}</td>
            </tr>
        `;
    };

    const renderVirtual = () => {
        if (!tbodyEl || !tableWrapperEl) return;

        const totalRows = viewRepos.length;
        const viewportHeight = tableWrapperEl.clientHeight;
        const scrollTop = tableWrapperEl.scrollTop;

        const approxStart = Math.floor(scrollTop / rowHeight);
        const visibleCount = Math.ceil(viewportHeight / rowHeight);

        const startIndex = Math.max(0, approxStart - VIRTUAL_BUFFER_ROWS);
        const endIndex = Math.min(totalRows, approxStart + visibleCount + VIRTUAL_BUFFER_ROWS);

        const topSpacer = startIndex * rowHeight;
        const bottomSpacer = Math.max(0, (totalRows - endIndex) * rowHeight);

        let html = "";

        html += `
            <tr data-row="spacer-top">
                <td colspan="${colCount}" style="height:${topSpacer}px; padding:0; border:0;"></td>
            </tr>
        `;

        for (let i = startIndex; i < endIndex; i += 1) {
            html += buildRowHtml(viewRepos[i]);
        }

        html += `
            <tr data-row="spacer-bottom">
                <td colspan="${colCount}" style="height:${bottomSpacer}px; padding:0; border:0;"></td>
            </tr>
        `;

        tbodyEl.innerHTML = html;
        updateCount();

        measureRowHeightIfNeeded();
    };

    const scheduleVirtualRender = () => {
        if (rafScheduled) return;
        rafScheduled = true;

        requestAnimationFrame(() => {
            rafScheduled = false;
            renderVirtual();
        });
    };

    const rebuildView = () => {
        viewRepos = repos.filter(passesFilters);
        sortInPlace(viewRepos);
    };

    const rebuildViewAndRender = (resetScroll = false) => {
        rebuildView();

        if (resetScroll && tableWrapperEl) {
            tableWrapperEl.scrollTop = 0;
        }

        scheduleVirtualRender();
    };

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
        rebuildViewAndRender(true);
        saveState();
    };

    document.addEventListener("DOMContentLoaded", async () => {
        const saved = loadState();

        tableWrapperEl = document.querySelector(".table-wrapper");
        tbodyEl = document.getElementById("repo-body");
        colCount = document.querySelectorAll("thead th").length || 7;

        if (saved?.theme === "dark") {
            document.body.classList.remove("light");
        } else {
            document.body.classList.add("light");
        }

        const initialLang = saved?.lang || "fr";
        try {
            await loadLang("fr");
            if (initialLang !== "fr") await loadLang(initialLang);
            uiLang = initialLang;
            applyTranslations();
        } catch (e) {
            console.error("Locales load error:", e);
        }

        await loadLanguageSlugs();

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

        initLanguageFilterOptions();
        initYearFilterOptions();

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

        rebuildViewAndRender(true);
        saveState();

        if (tableWrapperEl) {
            tableWrapperEl.addEventListener("scroll", () => {
                scheduleVirtualRender();
            });

            window.addEventListener("resize", () => {
                rebuildViewAndRender(false);
            });
        }

        if (tbodyEl) {
            tbodyEl.addEventListener("click", (event) => {
                const link = event.target.closest(".repo-link");
                if (!link) return;

                const fullName = link.dataset.fullname;
                if (!fullName) return;

                hiddenRepos.add(fullName);
                rebuildViewAndRender(false);
                saveState();
            });
        }

        if (archivedEl) {
            archivedEl.addEventListener("change", () => {
                archivedOnly = archivedEl.checked;
                rebuildViewAndRender(true);
                saveState();
            });
        }

        const debounce = (fn, ms = 200) => {
            let timer;
            return (...args) => {
                clearTimeout(timer);
                timer = setTimeout(() => fn(...args), ms);
            };
        };

        if (searchEl) {
            searchEl.addEventListener(
                "input",
                debounce(() => {
                    searchQuery = searchEl.value.trim();
                    rebuildViewAndRender(true);
                    saveState();
                }, 200)
            );
        }

        if (repoLangSelect) {
            repoLangSelect.addEventListener("change", () => {
                languageFilter = repoLangSelect.value;
                rebuildViewAndRender(true);
                saveState();
            });
        }

        if (createdSelect) {
            createdSelect.addEventListener("change", () => {
                createdYearFilter = createdSelect.value;
                rebuildViewAndRender(true);
                saveState();
            });
        }

        if (activitySelect) {
            activitySelect.addEventListener("change", () => {
                activityYearFilter = activitySelect.value;
                rebuildViewAndRender(true);
                saveState();
            });
        }

        if (uiLangSelect) {
            uiLangSelect.addEventListener("change", () => {
                setLanguage(uiLangSelect.value).catch((err) =>
                    console.error("Language change error:", err)
                );
            });
        }

        const themeBtn = document.getElementById("toggle-theme");
        if (themeBtn) {
            themeBtn.addEventListener("click", () => {
                document.body.classList.toggle("light");
                applyTranslations();
                saveState();

                rebuildViewAndRender(false);
            });
        }

        const resetBtn = document.getElementById("reset-filters");
        if (resetBtn) {
            resetBtn.addEventListener("click", () => resetAll());
        }

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
                rebuildViewAndRender(true);
                saveState();
            });
        });
    });
})();
