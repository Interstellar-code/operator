import { useCallback } from "react";
import {
  AgentListResult,
  AgentFilesListResult,
  AgentFileGetResult,
  AgentFileSetResult,
  AgentIdentityResult,
  SkillStatusReport,
  SkillUpdateResult,
  ChannelsStatusResult,
  CronStatusResult,
  CronListResult,
  ConfigGetResult,
  ConfigSchemaResponse,
  ModelsListResult,
} from "../types/agents";
import { useGateway } from "./use-gateway";

export function useAgents() {
  const { sendRpc } = useGateway();

  const listAgents = useCallback(() => {
    return sendRpc<AgentListResult>("agents.list");
  }, [sendRpc]);

  const getAgentIdentity = useCallback(
    (agentId?: string) => {
      return sendRpc<AgentIdentityResult>("agent.identity", { agentId });
    },
    [sendRpc],
  );

  const listAgentFiles = useCallback(
    (agentId: string) => {
      return sendRpc<AgentFilesListResult>("agents.files.list", { agentId });
    },
    [sendRpc],
  );

  const getAgentFile = useCallback(
    (agentId: string, name: string) => {
      return sendRpc<AgentFileGetResult>("agents.files.get", { agentId, name });
    },
    [sendRpc],
  );

  const setAgentFile = useCallback(
    (agentId: string, name: string, content: string) => {
      return sendRpc<AgentFileSetResult>("agents.files.set", { agentId, name, content });
    },
    [sendRpc],
  );

  // Skills
  const getSkillsStatus = useCallback(
    (agentId?: string) => {
      return sendRpc<SkillStatusReport>("skills.status", { agentId });
    },
    [sendRpc],
  );

  const updateSkill = useCallback(
    (
      skillKey: string,
      updates: { enabled?: boolean; apiKey?: string; env?: Record<string, string> },
    ) => {
      return sendRpc<SkillUpdateResult>("skills.update", { skillKey, ...updates });
    },
    [sendRpc],
  );

  // Channels
  const getChannelsStatus = useCallback(
    (probe?: boolean) => {
      return sendRpc<ChannelsStatusResult>("channels.status", { probe });
    },
    [sendRpc],
  );

  // Cron
  const getCronStatus = useCallback(() => {
    return sendRpc<CronStatusResult>("cron.status");
  }, [sendRpc]);

  const getCronList = useCallback(
    (includeDisabled?: boolean) => {
      return sendRpc<CronListResult>("cron.list", { includeDisabled });
    },
    [sendRpc],
  );

  // Config
  const getConfig = useCallback(() => {
    return sendRpc<ConfigGetResult>("config.get");
  }, [sendRpc]);

  const getConfigSchema = useCallback(() => {
    return sendRpc<ConfigSchemaResponse>("config.schema", {});
  }, [sendRpc]);

  const setConfig = useCallback(
    (raw: string, baseHash?: string) => {
      return sendRpc<{ ok: boolean }>("config.set", { raw, baseHash });
    },
    [sendRpc],
  );

  // Models
  const listModels = useCallback(() => {
    return sendRpc<ModelsListResult>("models.list");
  }, [sendRpc]);

  return {
    listAgents,
    getAgentIdentity,
    listAgentFiles,
    getAgentFile,
    setAgentFile,
    getSkillsStatus,
    updateSkill,
    getChannelsStatus,
    getCronStatus,
    getCronList,
    getConfig,
    getConfigSchema,
    setConfig,
    listModels,
  };
}
