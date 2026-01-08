require("dotenv").config();

const GITHUB_TOKEN = process.env.STARRED_TOKEN;
const fs = require('fs');
const path = require('path');
const axios = require('axios');

if (!GITHUB_TOKEN) {
    console.error("❌ Error: The environment variable STARRED_TOKEN is not defined");
    process.exit(1);
}

const api = axios.create({
    baseURL: "https://api.github.com",
    headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "User-Agent": "starred-repos-node-script"
    },
    timeout: 15000
});

function getLastPageFromLink(linkHeader) {
    if (!linkHeader) return 1;
    const parts = linkHeader.split(",");
    for (const part of parts) {
        const section = part.trim();
        if (section.endsWith('rel="last"')) {
            const match = section.match(/[&?]page=(\d+)/);
            if (match) {
                return parseInt(match[1], 10);
            }
        }
    }
    return 1;
}

async function fetchStarredPage(page, perPage) {
    const res = await api.get("/user/starred", {
        params: { per_page: perPage, page }
    });
    return {
        data: res.data || [],
        link: res.headers.link
    };
}

async function fetchAllStarred() {
    const perPage = 100;

    console.log("Fetching page 1...");
    const first = await fetchStarredPage(1, perPage);
    const results = [...first.data];

    const lastPage = getLastPageFromLink(first.link);
    console.log(`Last page estimate: ${lastPage}`);

    if (lastPage <= 1) {
        return results;
    }

    const pages = [];
    for (let p = 2; p <= lastPage; p++) {
        pages.push(p);
    }

    const concurrency = 5;
    let index = 0;

    async function worker(workerId) {
        while (index < pages.length) {
            const page = pages[index++];
            console.log(`Worker ${workerId}: fetching page ${page}...`);
            try {
                const res = await fetchStarredPage(page, perPage);
                results.push(...res.data);
            } catch (err) {
                console.error(`Error on page ${page}:`, err.response?.status || err.message);
            }
        }
    }

    const workers = [];
    for (let i = 0; i < concurrency; i++) {
        workers.push(worker(i + 1));
    }

    await Promise.all(workers);

    return results;
}

async function main() {
    try {
        console.log("Fetching starred repositories (parallel)...");
        const repos = await fetchAllStarred();
        console.log("Fetched:", repos.length);

        const simplified = repos.map(r => ({
            name: r.name,
            full_name: r.full_name,
            html_url: r.html_url,
            description: r.description,
            stargazers_count: r.stargazers_count,
            archived: r.archived,
            created_at: r.created_at,
            pushed_at: r.pushed_at,
            language: r.language
        }));

        const json = JSON.stringify(simplified).replace(/</g, "\\u003c");
        const content = `// Généré automatiquement par fetch_starred.js
// ${new Date().toISOString()}
window.STARRED_REPOS = ${json};
`;

        const outPath = path.join(process.cwd(), "starred-data.js");
        fs.writeFileSync(outPath, content, "utf8");
        console.log("✔ File generated:", outPath);
        console.log("Open index.html in you're navigator (with a little HTTP server).");
    } catch (err) {
        console.error("Error:", err.response?.data || err.message || err);
        process.exit(1);
    }
}

main();
