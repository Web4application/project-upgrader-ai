let projectFiles = [];
let isOnlineAI = true;  // Flag to toggle between online/offline AI
// =======================
// CONFIG
// =======================
const GITHUB_TOKEN = ""; // <-- Add your GitHub Personal Access Token (repo scope)
const GITHUB_REPO = "username/repo"; // e.g., "seriki/project-upgrader-ai"
const GITHUB_BRANCH = "main";

// Model preference (used if window.WebLLM is present)
const MODEL_NAME = "Llama-3-8B-Instruct-q4f32_1-MLC";
const MODEL_TEMP = 0.4;

// =======================
// GLOBAL STATE
// =======================
window.loadedFiles = []; // [{name, path?, content}]
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
  const rows = window.loadedFiles.map(f => `<div><strong>${f.name}</strong> <span class="muted">(${f.content.length} chars)</span></div>`);
  box.innerHTML = rows.join("");
}

async function zipFiles() {
  // Simple ad-hoc zip replacement: download a .txt bundle if JSZip not present.
  if (typeof JSZip === "undefined") {
    const bundle = window.loadedFiles.map(f => `--- ${f.name} ---\n${f.content}`).join("\n\n");
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
// AI SESSION
// =======================
async function ensureAISession() {
  if (aiSession) return aiSession;

  if (window.WebLLM && ui("toggleOnlineAI").checked) {
    aiSession = await window.WebLLM.createChatSession({
      model: MODEL_NAME,
      temperature: MODEL_TEMP
    });
    return aiSession;
  }

  // Minimal fallback shim when WebLLM is unavailable.
  aiSession = {
    chat: {
      completions: {
        create: async ({ messages }) => {
          // Echo-style placeholder so the app still "compiles".
          const last = messages[messages.length - 1]?.content || "";
          return { choices: [{ message: { content: "[AI fallback] " + (typeof last === "string" ? last.slice(0, 2000) : JSON.stringify(last).slice(0, 2000)) } }] };
        }
      }
    }
  };
  return aiSession;
}

// Generic AI helper
async function runAI(system, user) {
  const session = await ensureAISession();
  const resp = await session.chat.completions.create({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  });
  return resp.choices[0].message.content;
}

// =======================
// FILE HANDLING
// =======================
ui("btnLoadFiles").addEventListener("click", async () => {
  const input = ui("fileInput");
  const files = Array.from(input.files || []);
  if (!files.length) {
    alert("Select files to load first.");
    return;
  }

  const textLike = (name) => /\.(txt|md|js|ts|jsx|tsx|json|html|css|py|java|c|cpp|rs|go|rb|sh|yml|yaml|toml|ini|xml)$/i.test(name);

  const reads = files.map(file => new Promise((resolve) => {
    if (!textLike(file.name)) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.webkitRelativePath || file.name, content: String(reader.result || "") });
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  }));

  const results = (await Promise.all(reads)).filter(Boolean);
  window.loadedFiles = results;
  listFiles();
  ui("output").textContent = `Loaded ${results.length} file(s).`;
});

ui("btnClearFiles").addEventListener("click", () => {
  window.loadedFiles = [];
  listFiles();
  ui("output").textContent = "Cleared loaded files.";
});

ui("btnDownload").addEventListener("click", zipFiles);

ui("btnSaveLocal").addEventListener("click", () => {
  localStorage.setItem("web4ai_project_files", JSON.stringify(window.loadedFiles));
  ui("output").textContent = "Saved to local storage.";
});

ui("btnLoadLocal").addEventListener("click", () => {
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
// AI ACTIONS (STUBS + IMPLEMENTATIONS)
// =======================
ui("btnRefactor").addEventListener("click", async () => {
  if (!loadedFiles.length) return alert("Load files first.");
  const parts = loadedFiles.slice(0, 5).map(f => `${f.name}:\n${safeSlice(f.content)}`).join("\n\n");
  const out = await runAI(
    "You are a senior engineer. Refactor the code for clarity, maintainability, and performance. Return updated code and rationale.",
    parts
  );
  ui("output").textContent = out;
});

ui("btnAnalyze").addEventListener("click", async () => {
  if (!loadedFiles.length) return alert("Load files first.");
  const parts = loadedFiles.slice(0, 8).map(f => `${f.name}:\n${safeSlice(f.content)}`).join("\n\n");
  const out = await runAI(
    "You are a code analyst. Identify architecture, dependencies, risks, and improvement opportunities.",
    parts
  );
  ui("output").textContent = out;
});

ui("btnDocGen").addEventListener("click", async () => {
  if (!loadedFiles.length) return alert("Load files first.");
  const parts = loadedFiles.slice(0, 8).map(f => `${f.name}:\n${safeSlice(f.content)}`).join("\n\n");
  const out = await runAI(
    "You are a technical writer. Generate clean README and API docs in markdown.",
    parts
  );
  ui("output").textContent = out;
});

ui("btnFormat").addEventListener("click", async () => {
  if (!loadedFiles.length) return alert("Load files first.");
  const parts = loadedFiles.slice(0, 5).map(f => `${f.name}:\n${safeSlice(f.content)}`).join("\n\n");
  const out = await runAI(
    "You are a formatter. Apply idiomatic formatting and consistent style. Return only formatted code.",
    parts
  );
  ui("output").textContent = out;
});

ui("btnTests").addEventListener("click", async () => {
  if (!loadedFiles.length) return alert("Load files first.");
  const parts = loadedFiles.slice(0, 5).map(f => `${f.name}:\n${safeSlice(f.content)}`).join("\n\n");
  const out = await runAI(
    "You are a test engineer. Propose unit tests with clear structure and edge cases.",
    parts
  );
  ui("output").textContent = out;
});

ui("btnComments").addEventListener("click", async () => {
  if (!loadedFiles.length) return alert("Load files first.");
  const parts = loadedFiles.slice(0, 5).map(f => `${f.name}:\n${safeSlice(f.content)}`).join("\n\n");
  const out = await runAI(
    "You are a maintainer. Add concise, high-signal comments and docstrings.",
    parts
  );
  ui("output").textContent = out;
});

ui("btnRunCustom").addEventListener("click", async () => {
  if (!loadedFiles.length) return alert("Load files first.");
  const prompt = ui("customPrompt").value.trim();
  if (!prompt) return alert("Enter a prompt.");
  const context = loadedFiles.map(f => `${f.name}:\n${safeSlice(f.content)}`).join("\n\n");
  const out = await runAI("You are a helpful code assistant.", `${prompt}\n\nProject Context:\n${context}`);
  ui("output").textContent = out;
});

ui("btnSummarize").addEventListener("click", async () => {
  if (!loadedFiles.length) return alert("Load files first.");
  const context = loadedFiles.map(f => `${f.name}:\n${safeSlice(f.content)}`).join("\n\n");
  const out = await runAI("You summarize projects for clarity and actionability.", `Summarize this project:\n\n${context}`);
  ui("output").textContent = out;
});

// =======================
// AI → GITHUB: HELPERS
// =======================
async function aiRefactorFileContent(file) {
  const out = await runAI(
    "You are a senior engineer. Refactor the following file. Return ONLY the updated file content. Do not wrap in markdown fences.",
    `${file.name}:\n${file.content}`
  );
  return out;
}

async function commitToGitHub(filename, content, message) {
  if (!GITHUB_TOKEN) throw new Error("GitHub token not set.");
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filename}`;

  // Try get SHA if file exists
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

  const commitResp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/commits/${latestCommitSha}`, {
    headers: { Authorization: `token ${GITHUB_TOKEN}` }
  });
  if (!commitResp.ok) throw new Error("Failed to get latest commit.");
  const commitData = await commitResp.json();
  const baseTreeSha = commitData.tree.sha;

  // Create blobs
  const treeEntries = [];
  for (const file of files) {
    const blobResp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/blobs`, {
      method: "POST",
      headers: { Authorization: `token ${GITHUB_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: file.refactored, encoding: "utf-8" })
    });
    if (!blobResp.ok) throw new Error(`Failed to create blob for ${file.name}`);
    const blobData = await blobResp.json();
    treeEntries.push({ path: file.name, mode: "100644", type: "blob", sha: blobData.sha });
  }

  // Create tree
  const treeResp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/trees`, {
    method: "POST",
    headers: { Authorization: `token ${GITHUB_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries })
  });
  if (!treeResp.ok) throw new Error("Failed to create tree.");
  const treeData = await treeResp.json();

  // Create commit
  const newCommitResp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/commits`, {
    method: "POST",
    headers: { Authorization: `token ${GITHUB_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message, tree: treeData.sha, parents: [latestCommitSha] })
  });
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
// AI → GITHUB: FLOWS
// =======================
ui("btnRefactorCommitOne").addEventListener("click", async () => {
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

ui("btnRefactorCommitMany").addEventListener("click", async () => {
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

ui("btnRefactorCommitSingle").addEventListener("click", async () => {
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
ui("btnAuto").addEventListener("click", async () => {
  try {
    if (!loadedFiles.length) return alert("Load files first.");

    // Strategy:
    // - 1 file: single-file commit
    // - 2-10 files: separate commits (more readable diffs)
    // - >10 files: single commit (cleaner history)
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

// Handle file input and load files into projectFiles
document.getElementById('fileInput').addEventListener('change', (e) => {
  const files = e.target.files;
  for (const file of files) {
    const reader = new FileReader();
    reader.onload = (e) => {
      projectFiles.push({
        name: file.name,
        code: e.target.result
      });
      displayOutput();
    };
    reader.readAsText(file);
  }
});

// Function to trigger refactoring of code using either online or offline AI
async function runAIRefactor() {
  for (let i = 0; i < projectFiles.length; i++) {
    try {
      const refactored = isOnlineAI ? 
        await realAIRefactor(projectFiles[i].code) : 
        await localAIRefactor(projectFiles[i].code);
        
      projectFiles[i].code = refactored;
      projectFiles[i].status = 'refactored';

      // Optional: Add more processing like complexity analysis, documentation, etc.
      await additionalProcessing(projectFiles[i]);

    } catch (error) {
      console.error(`Error refactoring file ${projectFiles[i].name}:`, error);
    }
  }
  displayOutput();
}

// Function for refactoring using OpenAI's GPT model (online)
async function realAIRefactor(code) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer YOUR_API_KEY', // Use environment variables to store keys securely
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a senior developer.' },
          { role: 'user', content: 'Refactor and optimize this code:\\n\\n' + code }
        ]
      })
    });
    
    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error during OpenAI request:', error);
    throw new Error('Failed to get refactored code from OpenAI');
  }
}

// Function for local AI refactoring (offline using WebLLM)
async function localAIRefactor(code) {
  try {
    const chat = await webllm.createChat();
    await chat.reload("Llama-3-8B-Instruct"); // Load Llama model
    const reply = await chat.generate("Refactor and optimize this code:\n" + code);
    return reply;
  } catch (error) {
    console.error('Error during local AI refactoring:', error);
    throw new Error('Failed to get refactored code from local AI');
  }
}

// Optional: Additional processing functions like complexity analysis, documentation generation, etc.
async function additionalProcessing(file) {
  // Example: Generate documentation for refactored code
  const doc = await generateDocumentation(file.code);
  console.log(`Generated documentation for ${file.name}:`, doc);
  
  // Example: Generate unit tests for refactored code
  const tests = await generateUnitTests(file.code);
  console.log(`Generated unit tests for ${file.name}:`, tests);

  // Update file status to reflect additional processing
  file.status = 'refactored and documented';
}

// Function to display the output of the current project files
function displayOutput() {
  const output = document.getElementById('output');
  output.textContent = projectFiles.map(f => `// ${f.name}\n${f.code}\n`).join('\n\n');
}

// Function to download the refactored project as a ZIP file
function downloadProject() {
  const zip = new JSZip();
  projectFiles.forEach(file => {
    zip.file(file.name, file.code);
  });
  zip.generateAsync({ type: "blob" }).then(content => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = "refactored_project.zip";
    a.click();
  });
}

// Function to save the project files locally using localForage
function saveToLocal() {
  localforage.setItem('my_project_files', projectFiles).then(() => {
    alert('Saved locally!');
  }).catch(err => {
    console.error("Error saving to local storage:", err);
  });
}

// Function to load the project files from local storage
function loadFromLocalStorage() {
  localforage.getItem('my_project_files').then(data => {
    if (data) {
      projectFiles = data;
      displayOutput();
    } else {
      alert('No saved project found.');
    }
  }).catch(err => {
    console.error("Error loading from local storage:", err);
  });
}

// Function to generate documentation for code using AI
async function generateDocumentation(code) {
  const docPrompt = `Generate documentation for the following code:\n\n${code}`;
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_API_KEY', // Use environment variables to store keys securely
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are an expert software documentation generator.' },
        { role: 'user', content: docPrompt }
      ]
    })
  });
  const data = await response.json();
  return data.choices[0].message.content.trim();
}

// Function to generate unit tests for code
async function generateUnitTests(code) {
  const testPrompt = `Generate unit tests for the following code using the appropriate testing framework (e.g., Jest, Mocha):\n\n${code}`;
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_API_KEY', // Use environment variables to store keys securely
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a test generation AI.' },
        { role: 'user', content: testPrompt }
      ]
    })
  });
  const data = await response.json();
  return data.choices[0].message.content.trim();
}
