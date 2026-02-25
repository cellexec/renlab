"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabase } from "../lib/supabase";
import type { Specification, SpecificationVersion, SpecificationStatus } from "../specifications";

function toSpec(row: Record<string, unknown>): Specification {
  return {
    id: row.id as string,
    projectId: (row.project_id as string) ?? null,
    title: row.title as string,
    status: (row.status as SpecificationStatus) ?? "draft",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function toVersion(row: Record<string, unknown>): SpecificationVersion {
  return {
    id: row.id as string,
    specificationId: row.specification_id as string,
    content: row.content as string,
    versionNumber: row.version_number as number,
    changeNote: (row.change_note as string) ?? null,
    createdAt: row.created_at as string,
  };
}

export function useSpecificationStore(projectId: string | null = null) {
  const [specifications, setSpecifications] = useState<Specification[]>([]);
  const [versions, setVersions] = useState<SpecificationVersion[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
    setLoaded(false);

    async function load() {
      let specQuery = sb
        .from("specifications")
        .select("*")
        .order("updated_at", { ascending: false });

      if (projectId) {
        specQuery = specQuery.eq("project_id", projectId);
      }

      const { data: specRows } = await specQuery;

      const { data: versionRows } = await sb
        .from("specification_versions")
        .select("*")
        .order("version_number", { ascending: false });

      if (specRows) setSpecifications(specRows.map(toSpec));
      if (versionRows) setVersions(versionRows.map(toVersion));
      setLoaded(true);
    }
    load();

    const channelSuffix = projectId ?? "all";

    const specChannel = sb
      .channel(`specifications-realtime-${channelSuffix}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "specifications" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const incoming = toSpec(payload.new);
            if (projectId && incoming.projectId !== projectId) return;
            setSpecifications((prev) => {
              if (prev.some((s) => s.id === incoming.id)) return prev;
              return [incoming, ...prev];
            });
          } else if (payload.eventType === "UPDATE") {
            const updated = toSpec(payload.new);
            if (projectId && updated.projectId !== projectId) return;
            setSpecifications((prev) =>
              prev.map((s) => (s.id === updated.id ? updated : s))
            );
          } else if (payload.eventType === "DELETE") {
            const id = (payload.old as { id: string }).id;
            setSpecifications((prev) => prev.filter((s) => s.id !== id));
          }
        }
      )
      .subscribe();

    const versionChannel = sb
      .channel(`spec-versions-realtime-${channelSuffix}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "specification_versions" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setVersions((prev) => {
              if (prev.some((v) => v.id === (payload.new as { id: string }).id)) return prev;
              return [toVersion(payload.new), ...prev];
            });
          } else if (payload.eventType === "UPDATE") {
            const updated = toVersion(payload.new);
            setVersions((prev) =>
              prev.map((v) => (v.id === updated.id ? updated : v))
            );
          } else if (payload.eventType === "DELETE") {
            const id = (payload.old as { id: string }).id;
            setVersions((prev) => prev.filter((v) => v.id !== id));
          }
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(specChannel);
      sb.removeChannel(versionChannel);
    };
  }, [projectId]);

  const createSpecification = useCallback(
    async (title: string, projectId?: string): Promise<string> => {
      const { data, error } = await getSupabase()
        .from("specifications")
        .insert({
          title,
          ...(projectId ? { project_id: projectId } : {}),
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Failed to create specification");
      return data.id;
    },
    []
  );

  const saveVersion = useCallback(
    async (specId: string, content: string, changeNote?: string): Promise<void> => {
      // Get max version number
      const { data: existing } = await getSupabase()
        .from("specification_versions")
        .select("version_number")
        .eq("specification_id", specId)
        .order("version_number", { ascending: false })
        .limit(1);

      const nextVersion = existing && existing.length > 0
        ? (existing[0].version_number as number) + 1
        : 1;

      const { error } = await getSupabase().from("specification_versions").insert({
        specification_id: specId,
        content,
        version_number: nextVersion,
        change_note: changeNote ?? null,
      });
      if (error) throw new Error(error.message);

      // Touch updated_at
      await getSupabase()
        .from("specifications")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", specId);
    },
    []
  );

  const getVersions = useCallback(
    (specId: string): SpecificationVersion[] => {
      return versions
        .filter((v) => v.specificationId === specId)
        .sort((a, b) => b.versionNumber - a.versionNumber);
    },
    [versions]
  );

  const getLatestVersion = useCallback(
    (specId: string): SpecificationVersion | undefined => {
      const specVersions = getVersions(specId);
      return specVersions[0];
    },
    [getVersions]
  );

  const updateTitle = useCallback(
    async (id: string, title: string) => {
      const { error } = await getSupabase()
        .from("specifications")
        .update({ title, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    []
  );

  const deleteSpecification = useCallback(async (id: string) => {
    const { error } = await getSupabase().from("specifications").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }, []);

  const updateStatus = useCallback(
    async (id: string, status: SpecificationStatus) => {
      const { error } = await getSupabase()
        .from("specifications")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    []
  );

  const isEditable = useCallback(
    (id: string): boolean => {
      const spec = specifications.find((s) => s.id === id);
      if (!spec) return false;
      return spec.status === "draft" || spec.status === "failed";
    },
    [specifications]
  );

  return {
    specifications,
    versions,
    loaded,
    createSpecification,
    saveVersion,
    getVersions,
    getLatestVersion,
    updateTitle,
    deleteSpecification,
    updateStatus,
    isEditable,
  };
}
