const API_BASE = import.meta.env.VITE_API_URL || "/api";

async function safeJson(res: Response) {
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || data.message || `Server error: ${res.status}`);
    }
    return data;
  }
  
  const text = await res.text();
  
  if (text.includes("<!DOCTYPE html>") || text.includes("<html")) {
    throw new Error(`Critical Error: Received HTML instead of JSON. The backend might be misconfigured. URL: ${res.url}`);
  }
  
  if (!res.ok) {
    throw new Error(text || `Server error: ${res.status}`);
  }
  
  console.error("Non-JSON response received:", text.substring(0, 500));
  throw new Error(`Server returned non-JSON response (${res.status}): ${text.substring(0, 100)}`);
}

export async function login(email: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return safeJson(res);
}

export async function getBattles(status: 'live' | 'ended' = 'live') {
  const res = await fetch(`${API_BASE}/battles?status=${status}`);
  return safeJson(res);
}

export async function updateUsername(token: string, username: string) {
  const res = await fetch(`${API_BASE}/me/username`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ username }),
  });
  return safeJson(res);
}

export async function getBattleInfo(id: string) {
  const res = await fetch(`${API_BASE}/battles/${id}`);
  return safeJson(res);
}

export async function getLeaderboard() {
  const res = await fetch(`${API_BASE}/leaderboard`);
  return safeJson(res);
}

export async function createBattle(token: string, data: any) {
  const res = await fetch(`${API_BASE}/battles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  return safeJson(res);
}

export async function submitBeat(token: string, battleId: string, audioFile: File) {
  const formData = new FormData();
  formData.append("audio", audioFile);

  const res = await fetch(`${API_BASE}/battles/${battleId}/submit`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
  return safeJson(res);
}

export async function getResults(battleId: string) {
  const res = await fetch(`${API_BASE}/battles/${battleId}/results`);
  return safeJson(res);
}

export async function voteSubmission(token: string, submissionId: string, rating: number) {
  const res = await fetch(`${API_BASE}/submissions/${submissionId}/vote`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ rating }),
  });
  return safeJson(res);
}
