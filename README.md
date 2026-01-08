<p align="center">
  <a href="https://machou.github.io/StarsCleaner/">
    <picture>
      <img src="assets/img/logo.png" alt="Stars Cleaner" width="320px" />
    </picture>
  </a>
</p>

# Stars Cleaner

Sortable, filterable list with auto-hide on click.

![GitHub last commit](https://img.shields.io/github/last-commit/Machou/StarsCleaner)

![GitHub issues](https://img.shields.io/github/issues/Machou/StarsCleaner)

![License](https://img.shields.io/github/license/Machou/StarsCleaner)


## 🧰 Prerequisites

Before you begin, make sure you have installed:

- Git
- Node.js (v18 or higher recommended)
- A [personal GitHub token](https://github.com/settings/tokens) (scopes `public_repo` or `repo` depending on your needs)


## ❓ How To

1. Clone depot

```ssh
git clone https://github.com/Machou/StarsCleaner.git
cd StarsCleaner
```

2. Install Node dependencies

```ssh
npm install
```

3. Update you're token

```ssh
nano .env

# change
export STARRED_TOKEN="MY_TOKEN"
```

4. Get my **Stars**

```ssh
node fetch_starred.js
```

5. Launch the web page locally

*The application is 100% static, but a local server is required*

```ssh
npx http-server .
```

Then open the URL shown in the terminal.


## 📂 Project structure
```
tree -L 3 -I "node_modules"
.
├── app.js
├── assets
│   ├── css
│   │   └── style.css
│   └── img
│       ├── languages.json
│       ├── logo.png
│       ├── preview.png
├── fetch_starred.js
├── index.html
├── LICENSE
├── locales
│   ├── en.json
│   ├── es.json
│   └── fr.json
├── package.json
├── package-lock.json
├── README.md
└── starred-data.js
```

5 directories, 16 files


## 🖼️ Preview

![Preview](./assets/img/preview.png?v2)


## 🙏 Thanks To

- [Simple Icons](https://github.com/simple-icons/simple-icons)
- [Font Awesome](https://github.com/FortAwesome/Font-Awesome)
- Logo : [ChatGPT](https://chatgpt.com/)


## 👨‍💻 Contribute

Contributions are welcome!

---

[![Star History Chart](https://api.star-history.com/svg?repos=Machou/StarsCleaner&type=date&legend=top-left)](https://www.star-history.com/#Machou/StarsCleaner&type=date&legend=top-left)