// =======================
// CONFIG
// =======================
let isOnlineAI = true; // Toggle between online (OpenAI) and offline (WebLLM)
const OPENAI_API_KEY = ""; // Optional: if set and isOnlineAI = true, uses OpenAI

const GITHUB_TOKEN = ""; // <-- Add your GitHub Personal Access Token (repo scope)
const GITHUB_REPO = "username/repo"; // e.g., "seriki/project-upgrader-ai"
const GITHUB_BRANCH = "main";

// Offline model preference (for WebLLM if available)
const MODEL_NAME = "Llama-3-8B-Instruct-q4f32_1-MLC";
const MODEL_TEMP = 0.4;

// =======================
// GLOBAL STATE
// =======================
window.loadedFiles = []; // [{ name, content }]
let aiSession = null;

// =======================
// UTILITIES
// =======================
function ui(id) { return document.getElementById(id); }

function toBase64UTF8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function fromBase64UTF8(b64) {
  return decodeURIComponent(escape(atob(b64)));
}

function listFiles() {
  const box = ui("fileList");
  if (!window.loadedFiles.length) {
    box.innerHTML = "<em>No files loaded.</em>";
    return;
  }
  const rows = window.loadedFiles.map(
    f => `<div><strong>${f.name}</strong> <span class="muted">(${f.content.length} chars)</span></div>`
  );
  box.innerHTML = rows.join("");
}

async function zipFiles() {
  if (typeof JSZip === "undefined") {
    const bundle = window.loadedFiles
      .map(f => `--- ${f.name} ---\n${f.content}`)
      .join("\n\n");
    const blob = new Blob([bundle], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "project-bundle.txt";
    a.click();
    URL.revokeObjectURL(a.href);
    return;
  }
  const zip = new JSZip();
  window.loadedFiles.forEach(f => zip.file(f.name, f.content));
  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "project.zip";
  a.click();
  URL.revokeObjectURL(a.href);
}

function safeSlice(str, max = 60000) {
  return str.length > max ? str.slice(0, max) + "\n\n/* [truncated for context] */" : str;
}

// =======================
// FILE HANDLING
// =======================
ui("btnLoadFiles")?.addEventListener("click", async () => {
  const input = ui("fileInput");
  const files = Array.from(input?.files || []);
  if (!files.length) {
    alert("Select files to load first.");
    return;
  }

  const textLike = (name) =>
    /\.(txt|md|js|ts|jsx|tsx|json|html|css|py|java|c|cpp|rs|go|rb|sh|yml|yaml|toml|ini|xml)$/i.test(name);

  const reads = files.map(file => new Promise((resolve) => {
    if (!textLike(file.name)) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.webkitRelativePath || file.name,
      content: String(reader.result || "")
    });
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  }));

  const results = (await Promise.all(reads)).filter(Boolean);
  window.loadedFiles = results;
  listFiles();
  ui("output").textContent = `Loaded ${results.length} file(s).`;
});

ui("btnClearFiles")?.addEventListener("click", () => {
  window.loadedFiles = [];
  listFiles();
  ui("output").textContent = "Cleared loaded files.";
});

ui("btnDownload")?.addEventListener("click", zipFiles);

ui("btnSaveLocal")?.addEventListener("click", () => {
  localStorage.setItem("web4ai_project_files", JSON.stringify(window.loadedFiles));
  ui("output").textContent = "Saved to local storage.";
});

ui("btnLoadLocal")?.addEventListener("click", () => {
  try {
    const raw = localStorage.getItem("web4ai_project_files");
    window.loadedFiles = raw ? JSON.parse(raw) : [];
    listFiles();
    ui("output").textContent = `Loaded ${window.loadedFiles.length} file(s) from local storage.`;
  } catch {
    ui("output").textContent = "Failed to load from local storage.";
  }
});

// =======================
// AI BACKENDS
// =======================
// Offline: WebLLM session
async function ensureAISession() {
  if (aiSession) return aiSession;

  const toggle = ui("toggleOnlineAI");
  if (toggle) {
    isOnlineAI = toggle.checked;
  }

  if (!isOnlineAI && window.WebLLM) {
    aiSession = await window.WebLLM.createChatSession({
      model: MODEL_NAME,
      temperature: MODEL_TEMP
    });
    return aiSession;
  }

  // Fallback shim when no online key and no WebLLM
  aiSession = {
    chat: {
      completions: {
        create: async ({ messages }) => {
          const last = messages[messages.length - 1]?.content || "";
          return {
            choices: [{
              message: {
                content: "[AI fallback] " + (typeof last === "string"
                  ? last.slice(0, 2000)
                  : JSON.stringify(last).slice(0, 2000))
              }
            }]
          };
        }
      }
    }
  };
  return aiSession;
}

// Unified AI call
async function runAI(system, user) {
  // Online via OpenAI if configured
  const toggle = ui("toggleOnlineAI");
  const useOnline = toggle ? toggle.checked : isOnlineAI;

  if (useOnline && OPENAI_API_KEY) {
    const body = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    };
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(`OpenAI error: ${err.error?.message || resp.statusText}`);
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  }

  // Offline via WebLLM (or shim)
  const session = await ensureAISession();
  const out = await session.chat.completions.create({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  });
  return out.choices[0].message.content;
}

// =======================
// AI ACTIONS
// =======================
ui("btnRefactor")?.addEventListener("click", async () => {
  if (!loadedFiles.length) return alert("Load files first.");
  const parts = loadedFiles.slice(0, 5).map(f => `${f.name}:\n${safeSlice(f.content)}`).join("\n\n");
  const out = await runAI(
    "You are a senior engineer. Refactor the code for clarity, maintainability, and performance. Return updated code and rationale.",
    parts
  );
  ui("output").textContent = out;
});

ui("btnAnalyze")?.addEventListener("click", async () => {
  if (!loadedFiles.length) return alert("Load files first.");
  const parts = loadedFiles.slice(0, 8).map(f => `${f.name}:\n${safeSlice(f.content)}`).join("\n\n");
  const out = await runAI(
    "You are a code analyst. Identify architecture, dependencies, risks, and improvement opportunities.",
    parts
  );
  ui("output").textContent = out;
});

ui("btnDocGen")?.addEventListener("click", async () => {
  if (!loadedFiles.length) return alert("Load files first.");
  const parts = loadedFiles.slice(0, 8).map(f => `${f.name}:\n${safeSlice(f.content)}`).join("\n\n");
  const out = await runAI(
    "You are a technical writer. Generate a README and API docs in markdown.",
    parts
  );
  ui("output").textContent = out;
});

ui("btnFormat")?.addEventListener("click", async () => {
  if (!loadedFiles.length) return alert("Load files first.");
  const parts = loadedFiles.slice(0, 5).map(f => `${f.name}:\n${safeSlice(f.content)}`).join("\n\n");
  const out = await runAI(
    "You are a formatter. Apply idiomatic formatting and consistent style. Return only formatted code.",
    parts
  );
  ui("output").textContent = out;
});

ui("btnTests")?.addEventListener("click", async () => {
  if (!loadedFiles.length) return alert("Load files first.");
  const parts = loadedFiles.slice(0, 5).map(f => `${f.name}:\n${safeSlice(f.content)}`).join("\n\n");
  const out = await runAI(
    "You are a test engineer. Propose unit tests with structure and edge cases.",
    parts
  );
  ui("output").textContent = out;
});

ui("btnComments")?.addEventListener("click", async () => {
  if (!loadedFiles.length) return alert("Load files first.");
  const parts = loadedFiles.slice(0, 5).map(f => `${f.name}:\n${safeSlice(f.content)}`).join("\n\n");
  const out = await runAI(
    "You are a maintainer. Add concise, high-signal comments and docstrings.",
    parts
  );
  ui("output").textContent = out;
});

ui("btnRunCustom")?.addEventListener("click", async () => {
  if (!loadedFiles.length) return alert("Load files first.");
  const prompt = ui("customPrompt").value.trim();
  if (!prompt) return alert("Enter a prompt.");
  const context = loadedFiles.map(f => `${f.name}:\n${safeSlice(f.content)}`).join("\n\n");
  const out = await runAI("You are a helpful code assistant.", `${prompt}\n\nProject Context:\n${context}`);
  ui("output").textContent = out;
});

ui("btnSummarize")?.addEventListener("click", async () => {
  if (!loadedFiles.length) return alert("Load files first.");
  const context = loadedFiles.map(f => `${f.name}:\n${safeSlice(f.content)}`).join("\n\n");
  const out = await runAI(
    "You summarize projects for clarity and actionability.",
    `Summarize this project:\n\n${context}`
  );
  ui("output").textContent = out;
});

// =======================
// AI → GITHUB HELPERS
// =======================
async function aiRefactorFileContent(file) {
  // Return ONLY the updated file content (no markdown fences)
  const out = await runAI(
    "You are a senior engineer. Refactor the following file. Return ONLY the updated file content. Do not wrap in markdown fences.",
    `${file.name}:\n${file.content}`
  );
  return out;
}

async function commitToGitHub(filename, content, message) {
  if (!GITHUB_TOKEN) throw new Error("GitHub token not set.");
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filename}`;
// =======================
// DIFF HELPERS
// =======================
// Minimal line diff (O(n*m) LCS) for reasonable file sizes
function lcsMatrix(a, b) {
  const m = a.length, n = b.length;
  const dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

function backtrackDiff(a, b, dp) {
  let i = a.length, j = b.length;
  const ops = [];
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      ops.push({ type: "equal", text: a[i - 1] });
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.push({ type: "del", text: a[i - 1] }); i--;
    } else {
      ops.push({ type: "add", text: b[j - 1] }); j--;
    }
  }
  while (i > 0) { ops.push({ type: "del", text: a[i - 1] }); i--; }
  while (j > 0) { ops.push({ type: "add", text: b[j - 1] }); j--; }
  return ops.reverse();
}

function computeLineDiff(oldStr, newStr) {
  const a = oldStr.split("\n"), b = newStr.split("\n");
  const dp = lcsMatrix(a, b);
  return backtrackDiff(a, b, dp);
}

function renderDiffHTML(diffOps) {
  const left = [];
  const right = [];
  for (const op of diffOps) {
    if (op.type === "equal") {
      left.push(`<span class="line equal">${escapeHtml(op.text)}</span>`);
      right.push(`<span class="line equal">${escapeHtml(op.text)}</span>`);
    } else if (op.type === "del") {
      left.push(`<span class="line del">- ${escapeHtml(op.text)}</span>`);
    } else if (op.type === "add") {
      right.push(`<span class="line add">+ ${escapeHtml(op.text)}</span>`);
    }
  }
  return `
    <div class="diff-panels">
      <div class="panel" aria-label="Original">${left.join("")}</div>
      <div class="panel" aria-label="Proposed">${right.join("")}</div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// =======================
// DIFF MODAL STATE
// =======================
let previewFiles = []; // [{ name, before, after, selected }]
function openDiffModal(files) {
  previewFiles = files.map(f => ({ ...f, selected: true }));
  const backdrop = ui("diffBackdrop");
  const list = ui("diffList");
  const summary = ui("diffSummary");
  list.innerHTML = "";

  for (const file of previewFiles) {
    const ops = computeLineDiff(file.before, file.after);
    const html = renderDiffHTML(ops);
    const container = document.createElement("div");
    container.className = "diff-item";
    container.innerHTML = `
      <div class="diff-item-header">
        <input type="checkbox" class="diff-select" data-name="${file.name}" checked />
        <span class="diff-filename">${escapeHtml(file.name)}</span>
      </div>
      ${html}
    `;
    list.appendChild(container);
  }

  const updateSummary = () => {
    const selectedCount = previewFiles.filter(f => f.selected).length;
    summary.textContent = `${selectedCount} selected of ${previewFiles.length}`;
  };

  list.addEventListener("change", (e) => {
    if (e.target.classList.contains("diff-select")) {
      const name = e.target.getAttribute("data-name");
      const f = previewFiles.find(x => x.name === name);
      if (f) f.selected = e.target.checked;
      updateSummary();
    }
  }, { once: false });

  ui("selectAllDiff").checked = true;
  ui("selectAllDiff").onchange = (e) => {
    previewFiles.forEach(f => f.selected = e.target.checked);
    list.querySelectorAll(".diff-select").forEach(cb => cb.checked = e.target.checked);
    updateSummary();
  };

  ui("closeDiff").onclick = () => closeDiffModal();
  ui("commitSeparate").onclick = () => commitPreviewSeparate();
  ui("commitSingle").onclick = () => commitPreviewSingle();

  updateSummary();
  backdrop.style.display = "flex";
  backdrop.setAttribute("aria-hidden", "false");
}

function closeDiffModal() {
  const backdrop = ui("diffBackdrop");
  backdrop.style.display = "none";
  backdrop.setAttribute("aria-hidden", "true");
  previewFiles = [];
}

async function commitPreviewSeparate() {
  try {
    const selected = previewFiles.filter(f => f.selected);
    if (!selected.length) { alert("No files selected."); return; }
    for (const f of selected) {
      await commitToGitHub(f.name, f.after, `AI Refactor: ${f.name}`);
    }
    ui("output").textContent = "Committed selected files (separate commits).";
    closeDiffModal();
  } catch (e) {
    ui("output").textContent = e.message;
  }
}

async function commitPreviewSingle() {
  try {
    const selected = previewFiles.filter(f => f.selected);
    if (!selected.length) { alert("No files selected."); return; }
    await commitMultipleFilesSingleCommit(
      selected.map(f => ({ name: f.name, refactored: f.after })),
      "AI Refactor: Multiple files"
    );
    ui("output").textContent = "Committed selected files in a single commit.";
    closeDiffModal();
  } catch (e) {
    ui("output").textContent = e.message;
  }
}

// =======================
// PREVIEW FLOWS (replace commit flows)
// =======================
async function refactorAndPreviewSingle() {
  if (!loadedFiles.length) return alert("Load files first.");
  const f = loadedFiles[0];
  const after = await aiRefactorFileContent(f);
  openDiffModal([{ name: f.name, before: f.content, after }]);
}

async function refactorAndPreviewSeparate() {
  if (!loadedFiles.length) return alert("Load files first.");
  const results = [];
  for (const f of loadedFiles) {
    const after = await aiRefactorFileContent(f);
    results.push({ name: f.name, before: f.content, after });
  }
  openDiffModal(results);
}

async function refactorAndPreviewSingleCommit() {
  await refactorAndPreviewSeparate(); // same preview; user chooses single commit in modal
}

// Rewire buttons to preview-first behavior
const btnOne = ui("btnRefactorCommitOne");
const btnMany = ui("btnRefactorCommitMany");
const btnSingle = ui("btnRefactorCommitSingle");

if (btnOne) btnOne.onclick = refactorAndPreviewSingle;
if (btnMany) btnMany.onclick = refactorAndPreviewSeparate;
if (btnSingle) btnSingle.onclick = refactorAndPreviewSingleCommit;

  // Fetch SHA if file exists
  let sha = undefined;
  const head = await fetch(url, { headers: { Authorization: `token ${GITHUB_TOKEN}` } });
  if (head.ok) {
    const data = await head.json();
    sha = data.sha;
  }

  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message,
      content: toBase64UTF8(content),
      branch: GITHUB_BRANCH,
      sha
    })
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Commit failed for ${filename}: ${err.message || resp.statusText}`);
  }
}

async function commitMultipleFilesSingleCommit(files, message) {
  if (!GITHUB_TOKEN) throw new Error("GitHub token not set.");

  const branchUrl = `https://api.github.com/repos/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`;
  const branchResp = await fetch(branchUrl, { headers: { Authorization: `token ${GITHUB_TOKEN}` } });
  if (!branchResp.ok) throw new Error("Failed to get branch ref.");
  const branchData = await branchResp.json();
  const latestCommitSha = branchData.object.sha;

  const commitResp = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/git/commits/${latestCommitSha}`,
    { headers: { Authorization: `token ${GITHUB_TOKEN}` } }
  );
  if (!commitResp.ok) throw new Error("Failed to get latest commit.");
  const commitData = await commitResp.json();
  const baseTreeSha = commitData.tree.sha;

  // Create blobs
  const treeEntries = [];
  for (const file of files) {
    const blobResp = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/git/blobs`,
      {
        method: "POST",
        headers: { Authorization: `token ${GITHUB_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: file.refactored, encoding: "utf-8" })
      }
    );
    if (!blobResp.ok) throw new Error(`Failed to create blob for ${file.name}`);
    const blobData = await blobResp.json();
    treeEntries.push({ path: file.name, mode: "100644", type: "blob", sha: blobData.sha });
  }

  // Create tree
  const treeResp = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/git/trees`,
    {
      method: "POST",
      headers: { Authorization: `token ${GITHUB_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries })
    }
  );
  if (!treeResp.ok) throw new Error("Failed to create tree.");
  const treeData = await treeResp.json();

  // Create commit
  const newCommitResp = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/git/commits`,
    {
      method: "POST",
      headers: { Authorization: `token ${GITHUB_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message, tree: treeData.sha, parents: [latestCommitSha] })
    }
  );
  if (!newCommitResp.ok) throw new Error("Failed to create commit.");
  const newCommitData = await newCommitResp.json();

  // Update ref
  const updateResp = await fetch(branchUrl, {
    method: "PATCH",
    headers: { Authorization: `token ${GITHUB_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sha: newCommitData.sha })
  });
  if (!updateResp.ok) throw new Error("Failed to update branch reference.");
}

// =======================
// AI → GITHUB FLOWS
// =======================
ui("btnRefactorCommitOne")?.addEventListener("click", async () => {
  try {
    if (!loadedFiles.length) return alert("Load files first.");
    const f = loadedFiles[0];
    const updated = await aiRefactorFileContent(f);
    await commitToGitHub(f.name, updated, `AI Refactor: ${f.name}`);
    ui("output").textContent = `Committed ${f.name} successfully.`;
  } catch (e) {
    ui("output").textContent = e.message;
  }
});

ui("btnRefactorCommitMany")?.addEventListener("click", async () => {
  try {
    if (!loadedFiles.length) return alert("Load files first.");
    for (const f of loadedFiles) {
      const updated = await aiRefactorFileContent(f);
      await commitToGitHub(f.name, updated, `AI Refactor: ${f.name}`);
    }
    ui("output").textContent = "Committed all files (separate commits).";
  } catch (e) {
    ui("output").textContent = e.message;
  }
});

ui("btnRefactorCommitSingle")?.addEventListener("click", async () => {
  try {
    if (!loadedFiles.length) return alert("Load files first.");
    const files = [];
    for (const f of loadedFiles) {
      const updated = await aiRefactorFileContent(f);
      files.push({ name: f.name, refactored: updated });
    }
    await commitMultipleFilesSingleCommit(files, "AI Refactor: Multiple files");
    ui("output").textContent = "Committed all files in a single commit.";
  } catch (e) {
    ui("output").textContent = e.message;
  }
});

// =======================
// AUTO-DETECT AI → GITHUB
// =======================
ui("btnAuto")?.addEventListener("click", async () => {
  try {
    if (!loadedFiles.length) return alert("Load files first.");

    if (loadedFiles.length === 1) {
      const f = loadedFiles[0];
      const updated = await aiRefactorFileContent(f);
      await commitToGitHub(f.name, updated, `AI Refactor: ${f.name}`);
      ui("output").textContent = "Auto: single-file refactor and commit complete.";
      return;
    }

    if (loadedFiles.length <= 10) {
      for (const f of loadedFiles) {
        const updated = await aiRefactorFileContent(f);
        await commitToGitHub(f.name, updated, `AI Refactor: ${f.name}`);
      }
      ui("output").textContent = "Auto: multi-file refactor committed as separate commits.";
      return;
    }

    const files = [];
    for (const f of loadedFiles) {
      const updated = await aiRefactorFileContent(f);
      files.push({ name: f.name, refactored: updated });
    }
    await commitMultipleFilesSingleCommit(files, "AI Refactor: Project-wide changes");
    ui("output").textContent = "Auto: multi-file refactor committed in a single commit.";
  } catch (e) {
    ui("output").textContent = e.message;
  }
});
