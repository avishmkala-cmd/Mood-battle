const getApiBase = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  
  // In most environments (including AI Studio preview), a relative "/api" is best.
  // It handles domain-relative requests correctly and works with Netlify redirects.
  if (!envUrl) return "/api";
  
  try {
    // If it's a full URL, ensure we only take the origin and append /api,
    // unless the path is explicitly set to /api already.
    const url = new URL(envUrl);
    const origin = url.origin;
    
    // If the path is just "/" or empty, or contains something else, 
    // we default to origin + "/api" because our server.ts routes start with /api.
    if (url.pathname === "/" || url.pathname === "" || !url.pathname.startsWith("/api")) {
      return `${origin}/api`;
    }
    
    return `${origin}${url.pathname.replace(/\/$/, "")}`;
  } catch (e) {
    // If it's not a valid URL (e.g. just a string like "Abc"), 
    // we should probably just default to "/api" to be safe.
    return "/api";
  }
};

const API_BASE = getApiBase();
console.log("API_BASE configured as:", API_BASE);

async function safeJson(res: Response, retryCount = 0): Promise<any> {
  const contentType = res.headers.get("content-type");
  
  if (contentType && contentType.includes("application/json")) {
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || data.message || `Server error: ${res.status}`);
    }
    return data;
  }
  
  const text = await res.text();
  
  // Log details for debugging
  if (!res.ok) {
    console.error(`API Request failed: ${res.status} ${res.url}`, text.substring(0, 500));
  }
  
  // Detect AI Studio 'Starting Server' or Netlify 404/bootstrapping pages
  const isBooting = text.includes("Starting Server...") || 
                    text.includes("Establishing Connection") ||
                    text.includes("title>Starting Server...") ||
                    (text.includes("<html") && text.includes("MOOD BATTLE") && !text.includes("root")); // Catching SPA fallback if it's the wrong page

  if (isBooting && retryCount < 10) {
    const delay = retryCount < 3 ? 2000 : 5000;
    console.log(`Backend is starting up... retrying in ${delay/1000}s (Attempt ${retryCount + 1})`);
    await new Promise(resolve => setTimeout(resolve, delay));
    throw new Error("BACKEND_STARTING");
  }

  if (text.includes("<!DOCTYPE html>") || text.includes("<html")) {
    if (text.includes("Starting Server...")) {
      throw new Error("The backend server is still starting up. Please wait a moment and try again.");
    }
    // If we're getting our own SPA instead of API response
    const isNetlify = window.location.hostname.includes("netlify.app");
    if (text.includes("id=\"root\"") || text.includes("MOOD BATTLE")) {
       let errorMsg = `API Error: The backend at "${res.url}" returned the frontend app instead of data.`;
       if (isNetlify) {
         errorMsg += "\n\nTROUBLESHOOTING:\n1. Your Netlify site needs VITE_API_URL configured.\n2. Go to Netlify Dashboard > Site Settings > Environment Variables.\n3. Add VITE_API_URL and set it to: https://ais-pre-2lynzmqbkedqgwxvldsthv-782401959937.asia-southeast1.run.app\n4. Trigger a new deploy.";
       }
       throw new Error(errorMsg);
    }
    throw new Error(`Critical Error: Received HTML instead of JSON. The backend might be misconfigured. URL: ${res.url}`);
  }
  
  if (!res.ok) {
    const errorMsg = text || `Server error ${res.status}: The resource might be missing or the backend is unreachable.`;
    throw new Error(errorMsg);
  }
  
  console.error("Non-JSON response received:", text.substring(0, 500));
  throw new Error(`Server returned non-JSON response (${res.status}): ${text.substring(0, 100)}`);
}

// Wrapper to handle retries for all API calls
async function fetchWithRetry(fetcher: () => Promise<Response>, maxRetries = 5): Promise<any> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetcher();
      return await safeJson(res, i);
    } catch (err: any) {
      lastError = err;
      if (err.message === "BACKEND_STARTING") {
        continue; // safeJson already handled the delay
      }
      throw err;
    }
  }
  throw lastError;
}

export async function loginWithFirebase(idToken: string) {
  return fetchWithRetry(() => fetch(`${API_BASE}/auth/firebase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  }));
}

export async function getBattles(status: 'live' | 'ended' = 'live') {
  return fetchWithRetry(() => fetch(`${API_BASE}/battles?status=${status}`));
}

export async function updateUsername(token: string, username: string) {
  return fetchWithRetry(() => fetch(`${API_BASE}/me/username`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ username }),
  }));
}

export async function getBattleInfo(id: string) {
  return fetchWithRetry(() => fetch(`${API_BASE}/battles/${id}`));
}

export async function getLeaderboard() {
  return fetchWithRetry(() => fetch(`${API_BASE}/leaderboard`));
}

export async function createBattle(token: string, data: any) {
  return fetchWithRetry(() => fetch(`${API_BASE}/battles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  }));
}

export async function submitBeat(token: string, battleId: string, audioFile: File) {
  const formData = new FormData();
  formData.append("audio", audioFile);

  return fetchWithRetry(() => fetch(`${API_BASE}/battles/${battleId}/submit`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  }));
}

export async function getResults(battleId: string) {
  return fetchWithRetry(() => fetch(`${API_BASE}/battles/${battleId}/results`));
}

export async function voteSubmission(token: string, submissionId: string, rating: number) {
  return fetchWithRetry(() => fetch(`${API_BASE}/submissions/${submissionId}/vote`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ rating }),
  }));
}
