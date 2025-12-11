// app.js
(function () {
    let repos = (window.STARRED_REPOS || []).map(r => ({ ...r }));
    let currentSort = { key: "stars", dir: "desc" };
    let showArchivedOnly = false;
    let searchQuery = "";
    let languageFilter = "__ALL__";
    let currentLang = "fr";

    const I18N = {
        fr: {
            title: "Dépôts GitHub étoilés",
            subtitle: "Liste triable, filtrable, avec masquage automatique au clic.",
            theme_button_dark: "Mode sombre",
            theme_button_light: "Mode clair",
            lang_button: "EN",
            show_archived_only: "Afficher uniquement les dépôts archivés",
            search_label: "Recherche :",
            search_placeholder: "Nom du dépôt...",
            language_label: "Langage :",
            col_repo: "Dépôt",
            col_description: "Description",
            col_language: "Langage",
            col_stars: "★",
            col_created: "Créé le",
            col_pushed: "Dernière activité",
            col_archived: "Archivé",
            hint: "💡 Clique sur le nom d’un dépôt pour l’ouvrir dans un nouvel onglet et le masquer de la liste.",
            count_singular: "dépôt étoilé",
            count_plural: "dépôts étoilés",
            all_languages: "Toutes langues",
            no_language: "(Sans langage)",
            pill_archived: "Archivé"
        },
        en: {
            title: "Starred GitHub repositories",
            subtitle: "Sortable, filterable list with auto-hide on click.",
            theme_button_dark: "Dark mode",
            theme_button_light: "Light mode",
            lang_button: "FR",
            show_archived_only: "Show archived repositories only",
            search_label: "Search:",
            search_placeholder: "Repository name...",
            language_label: "Language:",
            col_repo: "Repository",
            col_description: "Description",
            col_language: "Language",
            col_stars: "★",
            col_created: "Created at",
            col_pushed: "Last activity",
            col_archived: "Archived",
            hint: "💡 Click on a repository name to open it in a new tab and hide it from the list.",
            count_singular: "starred repository",
            count_plural: "starred repositories",
            all_languages: "All languages",
            no_language: "(No language)",
            pill_archived: "Archived"
        }
    };

    function getT(key) {
        const lang = I18N[currentLang] || I18N.fr;
        return lang[key] ?? key;
    }

    function formatDate(iso) {
        if (!iso) return "";
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        // On garde fr-FR même en EN pour un format lisible; si tu veux, tu peux adapter
        return d.toLocaleDateString("fr-FR", {
            year: "numeric",
            month: "short",
            day: "2-digit"
        });
    }

    function escapeHtml(str) {
        if (!str) return "";
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function updateCount() {
        const el = document.getElementById("repo-count");
        const total = repos.length;

        const visibles = repos.filter((r) => {
            if (r.hidden) return false;
            if (showArchivedOnly && !r.archived) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const n = (r.full_name || "").toLowerCase();
                const shortName = (r.name || "").toLowerCase();
                if (!n.includes(q) && !shortName.includes(q)) return false;
            }
            if (languageFilter !== "__ALL__") {
                if (languageFilter === "__NONE__") {
                    if (r.language) return false;
                } else {
                    if (r.language !== languageFilter) return false;
                }
            }
            return true;
        }).length;

        const label =
            total === 1 ? getT("count_singular") : getT("count_plural");

        el.textContent = `${visibles} / ${total} ${label}`;
    }

    function sortRepos() {
        const { key, dir } = currentSort;
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
        let html = "";

        repos.forEach((repo, index) => {
            if (repo.hidden) return;
            if (showArchivedOnly && !repo.archived) return;

            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const n = (repo.full_name || "").toLowerCase();
                const shortName = (repo.name || "").toLowerCase();
                if (!n.includes(q) && !shortName.includes(q)) return;
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
          <td class="numeric">${repo.stargazers_count || 0}</td>
          <td>${formatDate(repo.created_at)}</td>
          <td>${formatDate(repo.pushed_at)}</td>
          <td>${repo.archived ? `<span class="pill-archived">${escapeHtml(getT("pill_archived"))}</span>` : ""}</td>
        </tr>
      `;
        });

        tbody.innerHTML = html;
        updateCount();
    }

    function initLanguageFilter() {
        const select = document.getElementById("filter-language");
        if (!select) return;

        const set = new Set();
        repos.forEach((r) => {
            if (r.language) {
                set.add(r.language);
            }
        });

        const languages = Array.from(set).sort((a, b) =>
            a.localeCompare(b, "fr", { sensitivity: "base" })
        );

        let options = `
      <option value="__ALL__">${escapeHtml(getT("all_languages"))}</option>
      <option value="__NONE__">${escapeHtml(getT("no_language"))}</option>
    `;
        languages.forEach((lang) => {
            options += `<option value="${escapeHtml(lang)}">${escapeHtml(lang)}</option>`;
        });

        select.innerHTML = options;
        languageFilter = "__ALL__";

        select.addEventListener("change", () => {
            const v = select.value;
            languageFilter = v;
            render();
        });
    }

    function applyTranslations() {
        // Textes simples
        document.querySelectorAll("[data-i18n]").forEach((el) => {
            const key = el.getAttribute("data-i18n");
            if (!key) return;
            // On laisse l'emoji dans le hint (déjà inclus dans la string fr/en)
            el.textContent = getT(key);
        });

        // Placeholders
        document
            .querySelectorAll("[data-i18n-placeholder]")
            .forEach((el) => {
                const key = el.getAttribute("data-i18n-placeholder");
                if (!key) return;
                el.setAttribute("placeholder", getT(key));
            });

        // Bouton thème : texte dépend aussi de l’état actuel (light/dark)
        const themeBtn = document.getElementById("toggle-theme");
        if (themeBtn) {
            const isLight = document.body.classList.contains("light");
            themeBtn.textContent = isLight
                ? getT("theme_button_dark")
                : getT("theme_button_light");
        }

        // Bouton langue
        const langBtn = document.getElementById("toggle-lang");
        if (langBtn) {
            langBtn.textContent = getT("lang_button");
        }

        // Re-générer le select langage (labels "Toutes langues" / "(Sans langage)")
        initLanguageFilter();

        // Re-rendu du tableau (pour pill "Archivé" / compteur)
        render();
    }

    document.addEventListener("DOMContentLoaded", () => {
        const tbody = document.getElementById("repo-body");
        const toggleArchived = document.getElementById("toggle-archived");
        const toggleTheme = document.getElementById("toggle-theme");
        const toggleLang = document.getElementById("toggle-lang");
        const searchInput = document.getElementById("search-name");

        // Tri par défaut : étoiles desc
        currentSort = { key: "stars", dir: "desc" };
        const thStars = document.querySelector('th[data-sort="stars"]');
        if (thStars) thStars.classList.add("sorted-desc");

        // Langue par défaut : fr
        currentLang = "fr";
        applyTranslations();

        // Masquage au clic sur un dépôt
        tbody.addEventListener("click", (event) => {
            const link = event.target.closest(".repo-link");
            if (!link) return;
            const index = parseInt(link.getAttribute("data-index"), 10);
            if (!Number.isNaN(index) && repos[index]) {
                repos[index].hidden = true;
                render();
            }
            // le lien s'ouvre dans un nouvel onglet (target=_blank)
        });

        // Filtre archivés
        toggleArchived.addEventListener("change", () => {
            showArchivedOnly = toggleArchived.checked;
            render();
        });

        // Recherche par nom
        if (searchInput) {
            searchInput.addEventListener("input", () => {
                searchQuery = searchInput.value.trim();
                render();
            });
        }

        // Tri via en-têtes
        document.querySelectorAll("th[data-sort]").forEach((th) => {
            th.addEventListener("click", () => {
                const key = th.getAttribute("data-sort");
                if (currentSort.key === key) {
                    currentSort.dir = currentSort.dir === "asc" ? "desc" : "asc";
                } else {
                    currentSort.key = key;
                    currentSort.dir = key === "stars" ? "desc" : "asc";
                }

                document
                    .querySelectorAll("th[data-sort]")
                    .forEach((el) => el.classList.remove("sorted-asc", "sorted-desc"));

                th.classList.add(
                    currentSort.dir === "asc" ? "sorted-asc" : "sorted-desc"
                );

                render();
            });
        });

        // Toggle thème
        if (toggleTheme) {
            toggleTheme.addEventListener("click", () => {
                const body = document.body;
                const isLight = body.classList.toggle("light");
                toggleTheme.textContent = isLight
                    ? getT("theme_button_dark")
                    : getT("theme_button_light");
            });
        }

        // Toggle langue FR <-> EN
        if (toggleLang) {
            toggleLang.addEventListener("click", () => {
                currentLang = currentLang === "fr" ? "en" : "fr";
                applyTranslations();
            });
        }
    });
})();
