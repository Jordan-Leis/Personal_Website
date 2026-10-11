// Supabase reads and writes for the planner pages. RLS limits all of this to members.
import { supabase } from "./auth.js";

const must = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

export async function loadAll() {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [tasks, subtasks, proofs, placements, blocks, events] = await Promise.all([
    supabase.from("tasks").select("*").or(`status.neq.done,completed_at.gte.${since}`),
    supabase.from("subtasks").select("*").order("sort_order").order("created_at"),
    supabase.from("task_proofs").select("*").order("created_at"),
    supabase.from("placements").select("*").order("placed_at"),
    supabase.from("blocks").select("*").order("start_at"),
    supabase.from("calendar_events").select("*").order("start_at"),
  ]);
  return {
    tasks: must(tasks), subtasks: must(subtasks), proofs: must(proofs),
    placements: must(placements), blocks: must(blocks), events: must(events),
  };
}

export const createTask = (row) => supabase.from("tasks").insert(row).select().single().then(must);
export const updateTask = (id, patch) => supabase.from("tasks").update(patch).eq("id", id).select().single().then(must);
export const deleteTask = (id) => supabase.from("tasks").delete().eq("id", id).then(must);

export const addSubtask = (task_id, title, sort_order) =>
  supabase.from("subtasks").insert({ task_id, title, sort_order }).select().single().then(must);
export const updateSubtask = (id, patch) => supabase.from("subtasks").update(patch).eq("id", id).select().single().then(must);
export const deleteSubtask = (id) => supabase.from("subtasks").delete().eq("id", id).then(must);

export const loadLog = (task_id) => supabase.from("task_log").select("*").eq("task_id", task_id).order("created_at").then(must);
export const addLog = (task_id, body) => supabase.from("task_log").insert({ task_id, body }).select().single().then(must);

export const addLinkProof = (task_id, url, label) =>
  supabase.from("task_proofs").insert({ task_id, kind: "link", url, label }).select().single().then(must);

export async function addPhotoProof(task_id, blob, label) {
  const ext = blob.type === "image/png" ? "png" : blob.type === "application/pdf" ? "pdf" : blob.type === "image/heic" ? "heic" : "jpg";
  const path = `${task_id}/${crypto.randomUUID()}.${ext}`;
  must(await supabase.storage.from("proofs").upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false }));
  return supabase.from("task_proofs").insert({ task_id, kind: "photo", storage_path: path, label }).select().single().then(must);
}

export async function deleteProof(proof) {
  if (proof.storage_path) must(await supabase.storage.from("proofs").remove([proof.storage_path]));
  return supabase.from("task_proofs").delete().eq("id", proof.id).then(must);
}

export async function signedUrls(paths) {
  if (!paths.length) return {};
  const data = must(await supabase.storage.from("proofs").createSignedUrls(paths, 3600));
  return Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
}

export const place = (task_id, block_key) =>
  supabase.from("placements").insert({ task_id, block_key }).select().single().then(must);
export const updatePlacement = (id, patch) => supabase.from("placements").update(patch).eq("id", id).select().single().then(must);
export const deletePlacement = (id) => supabase.from("placements").delete().eq("id", id).then(must);
