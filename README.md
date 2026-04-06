[![Watch Demo](https://img.youtube.com/vi/fFDfLm-_pZI/hqdefault.jpg)](https://youtu.be/fFDfLm-_pZI)

# Platonic Solids Parametric Rendering Engine

Run the app in a browser. You need **Node.js** (v18 or newer) installed.

---

## If you zipped the **full project** (has `package.json`, `src/`, etc.)

Unzip the folder, open a terminal in that folder, then run:

```bash
npm install
npm run dev
```

Then open the URL shown (e.g. **http://localhost:5173/**) in your browser.

To run the **built** version instead:

```bash
npm install
npm run build
npm run preview
```

Then open **http://localhost:4173/**.

---

## If you zipped only the **built app** (just `index.html` + `assets/` inside the zip)

Unzip the folder, open a terminal **inside that folder**, then run one of these:

**Option 1 — with Node.js:**

```bash
npx serve .
```

Then open **http://localhost:3000/** (or the URL shown).

**Option 2 — with Python 3:**

```bash
python3 -m http.server 4173
```

Then open **http://localhost:4173/**.

You cannot double-click `index.html`; the app uses ES modules and must be served over HTTP.

---

## Summary

| What you have        | Commands |
|----------------------|----------|
| Full project (no `node_modules`) | `npm install` → `npm run dev` |
| Full project (no `node_modules`) | `npm install` → `npm run build` → `npm run preview` |
| Pre-built folder only           | `npx serve .` or `python3 -m http.server 4173` |

When zipping the **full project**, exclude the `node_modules` folder so the zip stays small; recipients run `npm install` to get dependencies.
