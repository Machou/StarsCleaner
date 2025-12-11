// app.js
(function () {
    let repos = (window.STARRED_REPOS || []).map(r => ({ ...r }));
    let currentSort = { key: "stars", dir: "desc" };
    let showArchivedOnly = false;
    let searchQuery = "";
    let languageFilter = "__ALL__";

    function formatDate(iso) {
        if (!iso) return "";
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
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

        const label = total === 1 ? "dépôt étoilé" : "dépôts étoilés";
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
          <td>${repo.archived ? '<span class="pill-archived">Archivé</span>' : ""}</td>
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
      <option value="__ALL__">Toutes langues</option>
      <option value="__NONE__">(Sans langage)</option>
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

    document.addEventListener("DOMContentLoaded", () => {
        const tbody = document.getElementById("repo-body");
        const toggleArchived = document.getElementById("toggle-archived");
        const toggleTheme = document.getElementById("toggle-theme");
        const searchInput = document.getElementById("search-name");

        // Thème : light par défaut (déjà sur le body dans index.html)
        if (toggleTheme) {
            toggleTheme.textContent = "Mode sombre";
            toggleTheme.addEventListener("click", () => {
                const body = document.body;
                const isLight = body.classList.toggle("light");
                // si après toggle, body.light est vrai => thème light
                // donc on adapte le texte en conséquence
                toggleTheme.textContent = isLight ? "Mode sombre" : "Mode clair";
            });
        }

        // Tri par défaut : étoiles desc
        currentSort = { key: "stars", dir: "desc" };
        const thStars = document.querySelector('th[data-sort="stars"]');
        if (thStars) thStars.classList.add("sorted-desc");

        // Init filtre langage
        initLanguageFilter();

        // Rendu initial
        render();

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

        // Recherche par nom (full_name + name)
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
    });
})();
