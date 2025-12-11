// app.js
(function () {
    // ------------------------------
    //  State
    // ------------------------------
    let repos = (window.STARRED_REPOS || []).map((r) => ({ ...r }));
    let currentSort = { key: "stars", dir: "desc" };
    let showArchivedOnly = false;
    let searchQuery = "";
    let languageFilter = "__ALL__";
    let currentLang = "fr";

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
        if (dictionaries[lang]) return; // already loaded
        const res = await fetch(`./locales/${lang}.json`);
        if (!res.ok) throw new Error(`Cannot load language: ${lang}`);
        dictionaries[lang] = await res.json();
    }

    async function setLanguage(lang) {
        currentLang = lang;
        await loadLang(lang);
        applyTranslations();
        initLanguageFilterOptions(); // refresh labels ("All languages", etc.)
        render(); // refresh table + count
    }

    // ------------------------------
    //  Formatting helpers
    // ------------------------------

    // Format stars with French thousands separator (1 000, 10 000, 100 000)
    function formatStars(count) {
        const n = Number(count || 0);
        if (Number.isNaN(n)) return "0";
        return n.toLocaleString("fr-FR"); // uses spaces as thousands separator visually
    }

    // Format date as French style without leading zero and ASCII month, e.g. "8 dec. 2025"
    function formatDate(iso) {
        if (!iso) return "";
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;

        const day = d.getDate(); // no leading zero
        const year = d.getFullYear();

        // ASCII French month abbreviations (no accents)
        const months = [
            "janv.",
            "fevr.",
            "mars",
            "avr.",
            "mai",
            "juin",
            "juil.",
            "aout",
            "sept.",
            "oct.",
            "nov.",
            "dec."
        ];

        const month = months[d.getMonth()] || "";
        return `${day} ${month} ${year}`;
    }

    function escapeHtml(str) {
        if (!str) return "";
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    // ------------------------------
    //  Count visible repositories
    // ------------------------------
    function updateCount() {
        const el = document.getElementById("repo-count");
        if (!el) return;

        const total = repos.length;

        const visibles = repos.filter((r) => {
            if (r.hidden) return false;
            if (showArchivedOnly && !r.archived) return false;

            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const name = (r.full_name || "").toLowerCase();
                const shortName = (r.name || "").toLowerCase();
                if (!name.includes(q) && !shortName.includes(q)) return false;
            }

            if (languageFilter !== "__ALL__") {
                if (languageFilter === "__NONE__") {
                    if (r.language) return false; // filter only repos with no language
                } else {
                    if (r.language !== languageFilter) return false;
                }
            }

            return true;
        }).length;

        const label =
            total === 1 ? t("count_singular") : t("count_plural");

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

    function render() {
        sortRepos();

        const tbody = document.getElementById("repo-body");
        if (!tbody) return;

        let html = "";

        repos.forEach((repo, index) => {
            if (repo.hidden) return;
            if (showArchivedOnly && !repo.archived) return;

            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const name = (repo.full_name || "").toLowerCase();
                const shortName = (repo.name || "").toLowerCase();
                if (!name.includes(q) && !shortName.includes(q)) return;
            }

            if (languageFilter !== "__ALL__") {
                if (languageFilter === "__NONE__") {
                    if (repo.language) return;
                } else {
                    if (repo.language !== languageFilter) return;
                }
            }

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
          <td>${repo.archived
                    ? `<span class="pill-archived">${escapeHtml(t("pill_archived"))}</span>`
                    : ""
                }</td>
        </tr>
      `;
        });

        tbody.innerHTML = html;
        updateCount();
    }

    function initLanguageFilterOptions() {
        const select = document.getElementById("filter-language");
        if (!select) return;

        const previous = select.value || "__ALL__";

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

        // Restore previous selection if possible
        if (["__ALL__", "__NONE__", ...languages].includes(previous)) {
            select.value = previous;
            languageFilter = previous;
        } else {
            select.value = "__ALL__";
            languageFilter = "__ALL__";
        }
    }

    function applyTranslations() {
        // Translate static text
        document.querySelectorAll("[data-i18n]").forEach((el) => {
            const key = el.getAttribute("data-i18n");
            if (!key) return;
            el.textContent = t(key);
        });

        // Translate placeholders
        document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
            const key = el.getAttribute("data-i18n-placeholder");
            if (!key) return;
            el.setAttribute("placeholder", t(key));
        });

        // Update theme button text
        const themeBtn = document.getElementById("toggle-theme");
        if (themeBtn) {
            const isLight = document.body.classList.contains("light");
            themeBtn.textContent = isLight
                ? t("theme_button_dark")
                : t("theme_button_light");
        }
    }

    document.addEventListener("DOMContentLoaded", async () => {
        const tbody = document.getElementById("repo-body");
        const toggleArchived = document.getElementById("toggle-archived");
        const toggleTheme = document.getElementById("toggle-theme");
        const searchInput = document.getElementById("search-name");
        const langSelect = document.getElementById("lang-select");

        // Default sorting: stars desc
        currentSort = { key: "stars", dir: "desc" };
        const thStars = document.querySelector('th[data-sort="stars"]');
        if (thStars) thStars.classList.add("sorted-desc");

        // Load default language
        try {
            await loadLang("fr");
            currentLang = "fr";
            applyTranslations();
        } catch (e) {
            console.error("Failed to load fr.json:", e);
        }

        // Fill language filter (PHP, Rust…)
        initLanguageFilterOptions();

        // Main render
        render();

        // Hide repo on click
        if (tbody) {
            tbody.addEventListener("click", (event) => {
                const link = event.target.closest(".repo-link");
                if (!link) return;
                const index = Number(link.dataset.index);
                if (!isNaN(index)) {
                    repos[index].hidden = true;
                    render();
                }
            });
        }

        // Filter archived
        if (toggleArchived) {
            toggleArchived.addEventListener("change", () => {
                showArchivedOnly = toggleArchived.checked;
                render();
            });
        }

        // Search
        if (searchInput) {
            searchInput.addEventListener("input", () => {
                searchQuery = searchInput.value.trim();
                render();
            });
        }

        // Language selector (FR / EN / ES)
        if (langSelect) {
            langSelect.value = "fr";
            langSelect.addEventListener("change", () => {
                const lang = langSelect.value;
                setLanguage(lang).catch((err) =>
                    console.error("Language change failed:", err)
                );
            });
        }

        // Theme toggle
        if (toggleTheme) {
            toggleTheme.addEventListener("click", () => {
                const body = document.body;
                const isLight = body.classList.toggle("light");
                toggleTheme.textContent = isLight
                    ? t("theme_button_dark")
                    : t("theme_button_light");
            });
        }

        // Table header sort (name, description, language, stars, created, pushed)
        document.querySelectorAll("th[data-sort]").forEach((th) => {
            th.addEventListener("click", () => {
                const key = th.dataset.sort;
                if (!key) return;

                // Toggle or change sort direction
                if (currentSort.key === key) {
                    currentSort.dir = currentSort.dir === "asc" ? "desc" : "asc";
                } else {
                    currentSort.key = key;
                    // Default: stars in desc, others in asc
                    currentSort.dir = key === "stars" ? "desc" : "asc";
                }

                // Update header sort classes
                document.querySelectorAll("th[data-sort]").forEach((el) =>
                    el.classList.remove("sorted-asc", "sorted-desc")
                );
                th.classList.add(
                    currentSort.dir === "asc" ? "sorted-asc" : "sorted-desc"
                );

                render();
            });
        });

        // Repo language filter (PHP, Rust…)
        const repoLangSelect = document.getElementById("filter-language");
        if (repoLangSelect) {
            repoLangSelect.addEventListener("change", () => {
                languageFilter = repoLangSelect.value;
                render();
            });
        }
    });
})();
