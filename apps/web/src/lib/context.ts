import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fetch and compile all project context into a structured string
 * for AI prompts (triage, chat, agents).
 *
 * Pulls from:
 * 1. project_context docs (strategy brief, preferences, decisions, etc.)
 * 2. summaries table (auto-generated rolling summaries)
 * 3. agent_activity table (recent actions)
 */
export async function getProjectContext(
  supabase: SupabaseClient,
  projectId: string
): Promise<string> {
  // Fetch project name
  const { data: project } = await supabase
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .single();

  const projectName = project?.name || "Unknown Project";

  // Fetch all context docs for this project
  const { data: docs } = await supabase
    .from("project_context")
    .select("doc_type, title, content, updated_at")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });

  // Fetch last 5 summaries for this project
  const { data: summaries } = await supabase
    .from("summaries")
    .select("summary, key_points, created_at")
    .eq("source_type", "project")
    .eq("source_id", projectId)
    .order("created_at", { ascending: false })
    .limit(5);

  // Fetch last 10 agent activity entries for this project
  const { data: activities } = await supabase
    .from("agent_activity")
    .select("agent_name, action, description, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(10);

  // Build structured context string
  const sections: string[] = [];
  sections.push(`## Client Context for ${projectName}\n`);

  // Group docs by type
  const docsByType = new Map<string, { title: string; content: string; updated_at: string }[]>();
  for (const doc of docs || []) {
    const list = docsByType.get(doc.doc_type) || [];
    list.push(doc);
    docsByType.set(doc.doc_type, list);
  }

  const DOC_TYPE_LABELS: Record<string, string> = {
    strategy_brief: "Strategy Brief",
    brand_guidelines: "Brand Guidelines",
    decision_log: "Decision Log",
    client_preferences: "Client Preferences",
    meeting_notes: "Meeting Notes",
    agent_config: "Agent Configuration",
  };

  for (const [docType, label] of Object.entries(DOC_TYPE_LABELS)) {
    const typeDocs = docsByType.get(docType);
    if (typeDocs?.length) {
      sections.push(`### ${label}`);
      for (const doc of typeDocs) {
        if (doc.title && doc.title !== label) {
          sections.push(`**${doc.title}**`);
        }
        // For decision logs, only include the last ~2000 chars to keep context window manageable
        if (docType === "decision_log" && doc.content.length > 2000) {
          sections.push("...(earlier entries omitted)...");
          sections.push(doc.content.slice(-2000));
        } else {
          sections.push(doc.content);
        }
      }
      sections.push("");
    }
  }

  // Recent summaries
  if (summaries?.length) {
    sections.push("### Recent Interaction Summary");
    for (const s of summaries) {
      const date = new Date(s.created_at).toLocaleDateString();
      sections.push(`**${date}:** ${s.summary}`);
      if (s.key_points?.length) {
        for (const kp of s.key_points) {
          sections.push(`- ${kp}`);
        }
      }
    }
    sections.push("");
  }

  // Recent activity
  if (activities?.length) {
    sections.push("### Recent Activity");
    for (const a of activities) {
      const date = new Date(a.created_at).toLocaleDateString();
      sections.push(`- [${date}] ${a.agent_name}: ${a.description}`);
    }
    sections.push("");
  }

  return sections.join("\n");
}

/**
 * Append a line to a project's decision_log context doc.
 * Creates the doc if it doesn't exist.
 */
export async function appendToDecisionLog(
  supabase: SupabaseClient,
  projectId: string,
  entry: string
): Promise<void> {
  const timestamp = new Date().toISOString().split("T")[0];
  const line = `[${timestamp}] ${entry}`;

  // Try to find existing decision_log
  const { data: existing } = await supabase
    .from("project_context")
    .select("id, content, version")
    .eq("project_id", projectId)
    .eq("doc_type", "decision_log")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (existing) {
    const newContent = existing.content
      ? `${existing.content}\n${line}`
      : line;

    await supabase
      .from("project_context")
      .update({
        content: newContent,
        version: existing.version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("project_context").insert({
      project_id: projectId,
      doc_type: "decision_log",
      title: "Decision Log",
      content: line,
      version: 1,
    });
  }
}

/**
 * Get or create a specific context doc for a project.
 */
export async function getOrCreateContextDoc(
  supabase: SupabaseClient,
  projectId: string,
  docType: string,
  defaultTitle: string
): Promise<{ id: string; content: string; version: number }> {
  const { data: existing } = await supabase
    .from("project_context")
    .select("id, content, version")
    .eq("project_id", projectId)
    .eq("doc_type", docType)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (existing) {
    return existing;
  }

  const { data: created } = await supabase
    .from("project_context")
    .insert({
      project_id: projectId,
      doc_type: docType,
      title: defaultTitle,
      content: "",
      version: 1,
    })
    .select("id, content, version")
    .single();

  return created || { id: "", content: "", version: 1 };
}
